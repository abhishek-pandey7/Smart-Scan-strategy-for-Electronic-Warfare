# PRIMES — Smart Scan Strategy for Electronic Warfare

**P**redictive **R**estless **I**ndex for **M**ultiband **E**lectronic **S**upport — a machine-learning Electronic Support (ES) receiver scheduler that learns *when* and *where* to look, with no prior intelligence on emitters.

> Sections follow the SIH submission structure: **Ideation → Technical Approach → Feasibility & Viability → Impact & Benefits → Research & References.**
> Every number marked *measured* comes from the committed benchmark (`artifacts/benchmark.json`) or from the dataset analysis in [`DATASET_NOTES.md`](DATASET_NOTES.md). What is built vs planned is listed in [`PRIMES_PROTOTYPE.md`](PRIMES_PROTOTYPE.md) and `PROGRESS.md`.
> Mermaid diagrams render on GitHub; paste a block into <https://mermaid.live> to export SVG/PNG for slides.

---

# 1. Ideation

## 1.1 The operational problem

An ES receiver on an aircraft, ship or ground station must maintain awareness of every radar around it across **0.5–18 GHz**, using a receiver whose instantaneous bandwidth is an order of magnitude smaller than the band it must cover. It therefore has to **sweep**, and every millisecond spent on one frequency is a millisecond not spent on the other 17 GHz.

Three physical facts make this hard:

1. **Emitters are only visible in bursts.** A rotating radar points its main beam at us for a short *flash* — tens of milliseconds every few seconds — and is invisible in between. Interception requires being on the right frequency *at the right instant*: a two-dimensional (frequency × time) coincidence problem.
2. **Emitters are agile.** They hop frequency, stagger or jitter their pulse intervals, and switch modes. What worked a second ago may not work now.
3. **There is no prior intelligence.** The problem statement explicitly removes the threat library that conventional scan plans depend on.

## 1.2 Why the current practice fails

Today's receivers use an **open-loop** plan: a fixed sweep, built from pre-mission data, optimised for raw speed. It ignores everything it learns during the mission. Two consequences, both measured in this project:

- **Wasted time.** Equal dwell is spent on silent bands and on active, threatening ones. Measured: the reference open-loop sweep intercepts only **~6 % of narrow main-beam flashes** and **11.5 % of all flashes** on real dataset scenarios.
- **Lock-out (synchronisation).** If the sweep period and a radar's rotation period are commensurate, the radar is **never** intercepted; if they are nearly commensurate, only on a very slow beat. Measured in our adversarial scenario: open-loop intercepts **1.0 %** of those flashes and finds **1 of 6** emitters in a minute. This is Clarkson's classical result, reproduced.

Scanning faster does not fix lock-out — it can cause it.

## 1.3 The insight the solution is built on

We measured the real emitter population (128,252 emitters from 2,500 scenarios) before designing anything. Two findings shaped the entire architecture:

1. **Scan periods are not arbitrary.** **96.2 % of radar scan periods fall on just 22 discrete values** (2 s, 10 s, 1 s, 4 s, 5 s, 2.5 s, …), because radars are built from a finite set of rotation rates. Within the 0.5–30 s range that matters for a short engagement, 19 values carry 96.3 % of the mass.
   → After a **single** catch, the question "when does this radar come back?" has ~19 candidate answers, not a continuum. One more catch, or a few well-placed misses, settles it.
2. **Real emitters are not all clean flashes.** In observed truth, the median emitter is receivable **32 % of the time** in long irregular stretches (sidelobes, wide beams, moving platforms); only **12 %** behave like short periodic flashes.
   → A single "periodic flash" model would be wrong for most of the population. Two competing models are needed per emitter.

**Therefore:** don't ask a neural network to rediscover radar physics from scratch. Model what is known (periodicity, on/off behaviour, detection geometry) explicitly and *learn the parameters online from hits and misses*, then let learning handle the residue.

> **Design principle:** do not use machine learning to rediscover everything from scratch when part of the problem can be modelled explicitly. Learning is applied where data beats assumptions: the emitter-population prior, the per-emitter timing posterior, the visibility factor, the dwell reliability, and (roadmap) a residual RL correction.

## 1.4 Alternatives considered and why they were rejected

| Alternative | Why not the answer |
|---|---|
| **Faster / optimised periodic sweep** (incl. Farey/Diophantine-optimal sweep periods) | Optimal only with a known threat list; the problem statement removes it. Retained as the **baseline** and as theory for the lock-out slide. |
| **Deep RL over raw observations (DQN/PPO)** — the common hackathon answer and the current published ES approach | Sample-hungry: a 30–60 s engagement gives ~7 flashes per emitter, and the first 2–3 must be enough. Opaque to an operator, no worst-case guarantee. **Measured**: our fairly-tuned Double-DQN reaches 4–21 % vs PRIMES' 62–79 %. |
| **Greedy / hit-rate bandit** | Cannot represent *phase*: it knows a band was productive, not *when* it will be productive. Measured 8–20 %. |
| **Exact POMDP solution** | Intractable at 36 centres × dozens of emitters with continuous timing state. |
| **Restless bandit with a Gilbert–Elliott channel model only** (classical dynamic spectrum access) | Right control paradigm, wrong emitter model: a rotating radar is not a two-state Markov channel. We keep the paradigm and replace the model. |

## 1.5 What is novel here

1. **Interval-censored learning of scan timing.** A miss is evidence, not a non-event: a look of length *d* that saw nothing rules out an interval of phase for every candidate period. Standard approaches (FFT/autocorrelation of arrival times) assume regular sampling and break on the sparse, censored, irregular looks a scanning receiver actually produces.
2. **A learned discrete prior over scan periods** (22 values, 96 % mass), fitted from an open dataset by streaming metadata — turning "unknown period" into a small hypothesis set that a couple of observations can resolve.
3. **Two competing emitter models per track**, periodic flash vs Gilbert–Elliott on/off, arbitrated by Bayes factors from the same hits and misses. This is what makes the system work on real data rather than only on idealised scanners.
4. **Value per unit receiver time**, not value per look: the scheduler compares "catch this emitter", "discover something new" and "learn a period" on one scale, divided by the time each option costs.
5. **A micro dwell controller**: looks end early once an emitter is confirmed, extend when they hear part of a flash, and are never used on emitters whose pulses are too sparse to confirm in that time. **Measured on the benchmark**: easy 65.5 % → 72.3 %, lock-out 60.2 % → 69.1 %, and time to first catch cut by 30–35 %.
6. **Anti-synchronisation by construction**: dither in search mode, so the scheduler cannot fall into the lock-out trap that defeats open-loop sweeps.
7. **Explainability as a first-class output**: every dwell decision carries the numbers that produced it, which is what makes an ML scheduler acceptable on mission hardware.

---

# 2. Technical Approach

## 2.1 System overview

PRIMES is a closed loop: **observe → associate → predict → score → schedule → learn.**

```mermaid
flowchart TB
    subgraph L0["L0 · RF Front-End"]
        ANT["Antenna / RF chain"] --> TUNER["Tunable narrowband receiver<br/>(+ optional wideband cueing receiver)"]
        TUNER --> ADC["Digitiser"]
    end
    subgraph L1["L1 · Signal Processing"]
        DET["Pulse detection (CFAR)"] --> PDW["PDW extraction<br/>ToA · freq · PW · AoA · amplitude"]
    end
    subgraph L2["L2 · Deinterleaving & Association"]
        GATE["Gating on AoA / freq / PW"] --> CLUS["Clustering into emitter tracks<br/>+ clutter / false-alarm track"]
    end
    subgraph L3["L3 · Emitter Knowledge"]
        TSTORE["Track store"]
        HYP["Per-track model bank<br/>periodic flash vs on/off Markov"]
        UND["Undiscovered-emitter belief<br/>per 250 MHz cell + pop-up hazard"]
        PRIOR["Learned population priors<br/>periods · flash widths · PRI · density"]
    end
    subgraph L4["L4 · Decision"]
        IDX["Rate index<br/>value per unit receiver time"]
        MICRO["Micro dwell controller<br/>extend · stop-on-confirm · reliability"]
        DITH["Anti-sync dither (search mode)"]
        GOV["Staleness governor<br/>(hard revisit floor)"]
    end
    subgraph L5["L5 · Learning"]
        ONLINE["Online: timing posteriors, visibility factor κ,<br/>dwell reliability"]
        OFFLINE["Offline: population priors, index tuning,<br/>residual RL (roadmap)"]
    end
    subgraph L6["L6 · Control & HMI"]
        OPS["Operator priorities / ROE"]
        XAI["Decision explanations + live picture"]
        C2["C2 / fusion interface"]
    end

    ADC --> DET
    PDW --> GATE
    CLUS --> TSTORE --> HYP
    PRIOR --> HYP
    PRIOR --> UND
    HYP --> IDX
    UND --> IDX
    IDX --> MICRO --> DITH --> GOV --> TUNER
    ONLINE -.-> HYP
    OFFLINE -.-> IDX
    OPS --> IDX
    IDX --> XAI
    TSTORE --> C2
```

**Layer contracts** (the reason the same core runs on a simulator, a recorded dataset or live hardware):

| Layer | Input → Output |
|---|---|
| L0 RF front-end | tune command `(centre, dwell)` → IQ samples |
| L1 Signal processing | IQ → PDW stream |
| L2 Association | PDWs → `(track_id, flash edges, parameters)` |
| L3 Emitter knowledge | associated flashes + misses → `p(band active at t)`, uncertainty, next-flash estimate |
| L4 Decision | beliefs + priorities → `(centre, dwell)` + explanation |
| L5 Learning | experience / corpora → priors, tuned parameters, residual policy |
| L6 Control & HMI | operator intent in; track picture and rationale out |

## 2.2 The scheduling loop, one decision at a time

```mermaid
sequenceDiagram
    autonumber
    participant RX as Receiver (L0/L1)
    participant AS as Associator (L2)
    participant PR as Predictor (L3)
    participant IX as Index + governors (L4)
    participant HMI as Operator / C2 (L6)

    HMI-->>IX: threat priorities (optional, asynchronous)
    loop every dwell
        IX->>RX: tune(centre c, dwell d)
        RX->>AS: PDWs in [t, t+d] (empty = miss)
        AS->>PR: flashes per track + the miss interval
        PR->>PR: hit -> candidate periods from gaps, reweight
        PR->>PR: miss -> eliminate phase intervals (interval-censored)
        PR->>PR: advance on/off beliefs and undiscovered-emitter hazard
        PR->>IX: p(active), uncertainty, next-flash estimates
        IX->>IX: score every (centre, dwell): value per unit time
        IX->>IX: micro dwell rules, dither in search mode, staleness floor
        IX-->>HMI: chosen dwell + the numbers behind it
    end
```

## 2.3 The models

### Periodic flash model (rotating radars)
Emitter *e* illuminates us when `(t − φ) mod T < w`, for period `T`, phase `φ`, flash width `w`.

- **After one catch:** candidates are the ~19 discrete prior periods anchored at the observed flash.
- **After two catches** at `t₁ < t₂`: candidate periods are `(t₂ − t₁)/k`, refined by weighted least squares over all observed flashes.
- **Misses prune:** a look of length *d* that saw nothing removes a phase interval of width `d + w` from every surviving candidate. This is what kills sub-harmonics (2 s vs 4 s) that fit the hits equally well.
- **Uncertainty grows** with the number of unobserved periods, so predictions widen honestly when a track goes unwatched.

### Gilbert–Elliott on/off model (intermittently visible emitters)
A grid over mean on/off durations; the belief that an emitter is "on" relaxes towards its stationary value between looks and is updated on every look. This covers sidelobe visibility, sector scans and bursty modes — the 88 % of real emitters that are *not* clean flashes.

**Model arbitration:** the two classes compete through log-odds updated with the Bayes factor of every hit and miss, so each emitter ends up described by whichever model its own evidence supports.

### Undiscovered-emitter belief (the search term)
Per 250 MHz cell, an expected count of emitters not yet found:
- **thinned** by each look that covered it (Poisson thinning);
- **grown** by a pop-up hazard, so no band can be written off permanently;
- scaled by an **online-learned visibility factor κ**, fitted from how often looks actually discover new emitters. On real data κ settles at **4–10×**, i.e. real emitters are far more visible than metadata implies. Without it, PRIMES under-searches on real data (measured: discovery 22/35 → 34/35 emitters when κ was introduced).

## 2.4 The decision rule

For a dwell centre *c* and dwell length *d*:

$$
I(c,d)=\frac{\overbrace{\sum_{e\in\mathcal{E}(c)} W_e(t)\,P_e(\text{intercept in }[t,t+d])}^{\text{exploit known emitters}}+\overbrace{W_{\text{new}}\sum_{k\in\mathcal{K}(c)} m_k\,\bar P_{\text{det}}(d)}^{\text{discover new ones}}+\overbrace{\lambda\,IG(c,d)}^{\text{learn timing}}}{d+\tau\,\mathbb{1}[c\neq c_{\text{prev}}]}
$$

- **Value per unit time** makes 5 ms and 100 ms options comparable, and makes the retune cost `τ` explicit.
- **Overlap-aware coverage:** each centre accepts ±500 MHz, so neighbouring centres overlap; sums run over the *unique* tracks and cells a centre covers, never double-counting.
- **Staleness weight** `W_e(t)`: value grows with time since that emitter was last caught, so no single loud emitter can monopolise the receiver.
- **Resolution value:** a catch on an unconfirmed periodic track is worth its own flash *plus* the future flashes that confirming the period would unlock. This is what makes PRIMES invest two cheap looks now to own an emitter for the rest of the mission (measured: lock-out tracking 70 % → 95 %).
- **Appointments:** no dwell may run past a confident track's predicted flash unless it covers that emitter.
- **Threat priority (optional mission profile):** `W_e(t)` can be multiplied by the emitter's *expected* threat weight (low 0.3 / medium 1 / high 3). The weight comes from a classifier over what the receiver has actually measured about that emitter: frequency, PRI set, pulse widths, scan period and flash width. The estimate firms up as evidence accumulates and is blended toward 1 while uncertain. *Measured: it moves receiver time toward high-threat radars on real scenarios but costs overall interception on crowded simulated ones, so it is a switch, not the default (§3.1).*
- **Information gain** `IG`: expected bits about the timing hypotheses, in closed form for a binary outcome. *Measured honestly: no benefit; removing it is slightly better on 5 of 6 scenario families within overlapping intervals. Kept as an ablated component and not claimed as a source of gain.*

**Micro dwell controller** (measured: lock-out 60.2 % → 69.1 %, easy 65.5 % → 72.3 %, first catch 30–35 % sooner):
- **5 ms search looks** for a much faster sweep of the spectrum;
- **extend** a look that heard 1–2 pulses near its end, counting pulses across the contiguous window;
- **stop early** once an emitter is confirmed, returning the saved time to search;
- **reliability rule:** a dwell only counts as evidence about an emitter if it comfortably holds the pulses that emitter needs — otherwise a short look at a slow-pulsing emitter would wrongly "prove" it went quiet.

**Anti-synchronisation:** while tracking, look times are driven by predictions and are inherently aperiodic. The lock-out risk returns only in *search* mode, where a golden-ratio low-discrepancy dither breaks any commensurability with an emitter's rotation.

**Complexity and latency (design targets):** per decision the index costs `O(C·D·K̄·H)` — with 36 centres, 5 dwell options, ~3 tracks per centre and ~20 hypotheses ≈ 10⁴ arithmetic operations, i.e. **microseconds** in compiled form and well inside the shortest 5 ms dwell. Association is `O(n log n)` in pulses; predictor updates touch only the tracks a look covered.

## 2.5 Learning: what is learned, from what, and when

```mermaid
flowchart LR
    subgraph SRC["Sources"]
        TUR["Open radar dataset<br/>2,500 training scenarios (metadata)"]
        SIM["Scenario simulator<br/>7 families, domain randomised"]
        FIELD["Mission logs<br/>censored hits / misses"]
    end
    subgraph OFFLINE["Offline (between missions)"]
        PRI["Population priors<br/>periods · flash widths · PRI · density"]
        TUNE["Index tuning<br/>held-out tuning scenarios"]
        RL["Residual RL + shield (roadmap)"]
        EVAL["Exact replay benchmark<br/>multi-seed, bootstrap CIs, ablations"]
        REG["Signed model registry<br/>priors.json · index params · policy"]
    end
    subgraph ONLINE["Online (during a mission, per emitter)"]
        POST["Timing posteriors"]
        KAPPA["Visibility factor κ"]
        CAL["Dwell reliability"]
    end
    TUR --> PRI --> REG
    SIM --> TUNE --> EVAL
    SIM --> RL --> EVAL
    EVAL -- promotion gate --> REG
    REG -- signed update --> ONLINE
    FIELD -. censoring-aware refit .-> PRI
```

**Discipline:** scenario seeds are partitioned — evaluation 0–9, RL training 10 000+, validation 20 000+, and the three real-data tuning scenarios are disjoint from the eleven benchmark ones. Nothing is tuned on what is reported.

## 2.6 Scalability

| Dimension | How it scales | Evidence / mechanism |
|---|---|---|
| **Frequency coverage (C centres)** | index cost linear in C; coverage geometry is configuration, not code | 36 centres today; 0.5–18 GHz |
| **Dwell options (D)** | linear; 5 options now | micro controller adds the short end |
| **Emitters / tracks** | only tracks a centre covers are scored; negligible-weight hypotheses pruned | validated at 100 emitters/scenario |
| **Receivers per platform (K)** | assign the K best dwells by *marginal* coverage gain — a submodular problem with a `1 − 1/e` guarantee | design in place; single receiver measured |
| **Platforms** | tracks fused at a mission node; each edge keeps scheduling autonomously — no central bottleneck in the control loop | fusion interface defined |
| **Compute at the edge** | ~10⁴ ops per decision; NumPy today, ONNX/C++ port path for embedded SoC | decision ≪ 5 ms dwell |
| **Training / evaluation** | embarrassingly parallel; checkpointed and resumable; cloud GPU only for RL | 610-run benchmark, 3–6 workers |
| **Data volume** | dataset metadata streamed (no 70 GB download); pulse data cached once, replayed many times | priors fitted in ~10 min over the network |
| **Software** | stateless API with on-disk run cache; deterministic replay makes any result reproducible from a seed | `POST /api/runs` cached by content hash |

## 2.7 Security, safety and trust

A learned scheduler on mission hardware must answer "how can this fail, and who can make it fail?"

**Operational security**
- **Passive by construction.** ES is receive-only: PRIMES emits nothing, so it adds no probability of intercept or geolocation risk for own platform.
- **Unpredictability.** Search-mode dither means the look sequence is not a fixed pattern an adversary could model even with knowledge of the algorithm.

**Adversarial robustness (the ML-specific threat)**
- **Bait/decoy emitters** designed to monopolise a learned scheduler: bounded by the **staleness weight** (an emitter's value decays right after it is caught) and by a **cap on the share of receiver time any one track can draw**.
- **Denial by false alarms / jamming:** in evaluation a false alarm is deliberately made to look like a *new emitter* (plausible pulse train, in-band frequency), so the scheduler has to spend time on it. Each track carries existence log-odds that repeat hits raise and reliable misses lower. Miss/hit evidence is floored so no single observation can veto a hypothesis, and κ and dwell-reliability estimators are clipped to sane ranges. *Measured: ~23 false alarms per run cost 2 interception points; a stress rate of ~70 per run costs 11 points pooled and 3 points on real scenarios (§3.1).*
- **Blind-spot creation:** the **staleness governor** enforces a hard maximum revisit interval per band — a deterministic guarantee that no band goes unobserved beyond `τ_crit`, independent of what the learned layer wants.
- **Model poisoning via field logs:** logs refit *priors* only, offline, with censoring-aware estimation and human review; they never rewrite a live policy.

**Functional safety**
- **Deterministic fallback:** if the learned layer is unavailable or faults, the analytic index runs alone; if priors are missing, flat priors apply; ultimately a fixed raster sweep is always available.
- **Shielded learning:** any residual RL policy is clamped so its choice cannot fall below the analytic policy's value by more than a set margin (roadmap component, designed in).
- **Bounded compute:** fixed-size hypothesis banks (pruned) and a fixed action set give a hard upper bound on per-decision work — no unbounded search at runtime.

**Software and supply-chain security**
- **Offline by default:** no network calls in the scheduling loop; dataset access is needed only to refit priors, on a development machine.
- **Signed, versioned artefacts** (`priors.json`, index parameters, policy weights) in a registry; **shadow-mode** evaluation before a new artefact is allowed to act; rollback is a version change.
- **Pinned dependencies**, reproducible environment, permissive open-source licences only (dataset: Apache-2.0).
- **Deterministic replay + full decision logs** give a tamper-evident audit trail: any mission can be re-run bit-for-bit from its seed and inputs, and every dwell has a recorded rationale — essential for accident investigation and for acceptance testing.

**Data handling**
- Mission data stays at the edge; only aggregated, non-attributable statistics need ever leave it.
- Development used open synthetic data, so no classified material is embedded in the models.

## 2.8 Deployment architecture

```mermaid
flowchart TB
    subgraph EDGE["Edge node (per platform)"]
        RX["ES receiver(s)"] --> RT["PRIMES runtime<br/>associate · predict · index · governors"]
        RT --> LOG["Decision log + track store"]
    end
    subgraph COORD["Multi-receiver coordination"]
        ASSIGN["Dwell assignment across K receivers<br/>greedy marginal coverage (1 − 1/e)"]
    end
    subgraph FUSE["Mission / fusion node"]
        T2T["Track-to-track fusion"] --> GEO["Cross-platform AoA → geolocation"]
        GEO --> PIC["Shared emitter picture + cueing"]
    end
    subgraph GROUND["Ground / cloud (between missions)"]
        SIMS["Scenario generation at scale"] --> TRAIN["Training · tuning · evaluation"]
        TRAIN --> REG["Signed model registry"]
    end
    C2["C2 / operator"]
    RT <--> ASSIGN
    LOG --> T2T
    PIC -- cues, priorities --> RT
    C2 <--> PIC
    LOG -. mission logs (offline) .-> TRAIN
    REG -. signed update, shadow first .-> RT
```

**Tiering:** the edge loop is fully autonomous and works comms-denied; coordination and fusion improve it when available; the ground tier never participates in a real-time decision.

## 2.9 Technology stack

| Concern | Choice | Why |
|---|---|---|
| Core | Python 3.12 + NumPy | vectorised, portable, no exotic dependencies |
| Environment | Gymnasium | standard RL interface for the comparator |
| Learned comparator | Stable-Baselines3 (Double-DQN), PyTorch | credible published baseline |
| Data | huggingface_hub (streaming), h5py | metadata without bulk download |
| Backend | FastAPI + Uvicorn | typed, async, trivial to containerise |
| Frontend | Next.js (React, TypeScript), canvas/SVG | interactive replay; no chart library to audit |
| Reproducibility | pytest (20 tests), seeded replay, checkpointed benchmark | every figure regenerable |
| Edge path | ONNX export; NumPy/C++ port of the index loop | embedded SoC / FPGA-class targets |

---

# 3. Feasibility & Viability

## 3.1 Technical feasibility — already demonstrated

Not a proposal: a working prototype with measured results.

| Evidence | Status |
|---|---|
| Receiver model reverse-engineered from an open dataset | ✅ explains **99.987 %** of 22.7 M pulses |
| Population priors fitted from 128,252 emitters | ✅ **96.2 %** of periods on 22 values |
| Scheduler implemented end-to-end with two emitter models | ✅ 20 unit tests |
| Benchmark vs 4 baselines + a trained Double-DQN + clairvoyant upper bound | ✅ 610 runs with 95 % bootstrap CIs, including 5 ablations |
| Validation on **real dataset scenarios** (not only our simulator) | ✅ 11 scenarios, 35–100 emitters each |
| Robustness to missed detections and false alarms | ✅ 1,008-run sweep, 7 conditions |
| Works from unlabelled pulses (own deinterleaving), not truth labels | ✅ −0.8 points mean; none on real PDWs |
| Threat-aware priority from observed parameters | ✅ classifier + scheduler profile, measured |
| Interactive demo (replay + benchmark pages) | ✅ FastAPI + Next.js |

**Headline measured results** (610-run benchmark, 10 seeds per simulated family, 11 real dataset scenarios):

| Scenario | Open-loop raster | Greedy bandit | Double-DQN | **PRIMES** | Clairvoyant oracle |
|---|---|---|---|---|---|
| lock-out | 1.0 % | 7.6 % | 5.8 % | **69.1 %** | 98.3 % |
| easy | 5.6 % | 14.4 % | 4.4 % | **72.3 %** | 96.1 % |
| pop-up | 5.8 % | 10.8 % | 5.3 % | **61.6 %** | 97.6 % |
| dense (40 emitters) | 9.9 % | 20.3 % | 20.7 % | **65.9 %** | 89.9 % |
| mixed periodic + intermittent | 14.1 % | 17.2 % | 10.3 % | **78.8 %** | 94.3 % |
| **real dataset scenarios** | 16.8 % | 20.3 % | 15.3 % | **69.8 %** | 84.8 % |

Supporting measurements: **95 % of lock-out emitters discovered** (raster 15 %); **91–98 %** of next-flash predictions within 10 ms on periodic emitters; **85–96 %** of an emitter's flashes caught once it is tracked; time to first catch on lock-out **55.7 s → 17.2 s** and on easy **36.9 s → 16.6 s**. PRIMES' 95 % intervals do not overlap any non-oracle rival's on any family.

**Robustness to imperfect detection.** 1,008 runs: 7 conditions × 4 policies × 25 simulated and 11 real scenarios. Each condition varies one factor; interception is pooled over all 36 scenarios.

| Condition | Raster | Greedy | **PRIMES** (95 % CI) | Oracle | PRIMES / oracle | PRIMES on real scenarios |
|---|---|---|---|---|---|---|
| nominal (P_d = 1, P_fa = 0) | 10.3 % | 16.1 % | **69.0 %** [65.5, 72.1] | 91.6 % | 0.75 | 69.8 % |
| P_d = 0.9 | 9.6 % | 15.9 % | **62.7 %** [58.9, 66.1] | 87.4 % | 0.72 | 62.1 % |
| P_d = 0.7 | 8.2 % | 13.9 % | **55.5 %** [51.7, 59.2] | 77.4 % | 0.72 | 56.9 % |
| P_d = 0.5 | 6.3 % | 12.4 % | **44.4 %** [40.3, 48.8] | 66.5 % | 0.67 | 48.2 % |
| P_fa = 0.001 per look (~5 false alarms / run) | 10.3 % | 15.6 % | **68.1 %** [65.0, 71.0] | 91.6 % | 0.74 | 69.7 % |
| P_fa = 0.005 (~23 / run) | 10.3 % | 16.6 % | **66.8 %** [62.7, 70.8] | 91.6 % | 0.73 | 70.3 % |
| P_fa = 0.02 (~70 / run, stress) | 10.3 % | 16.4 % | **58.4 %** [54.0, 62.9] | 91.6 % | 0.64 | 66.8 % |

- **Missed detections degrade PRIMES gracefully, in step with the physics.** At P_d = 0.5, half of all flashes are unobservable even to the clairvoyant oracle. PRIMES keeps 0.67 of the oracle's score and stays **6.5–7× raster** throughout. Its evidence model treats a miss as `(1 − P_d)` evidence, so a missed flash weakens a timing hypothesis instead of deleting it.
- **False alarms cost little at realistic rates.** Up to ~23 false emitters per run, interception falls by at most 2 points. Only at a stress rate (~70 per run) does it fall to 58 %. On real scenarios it falls just 3 points, to 66.8 %, because real emitters there give their tracks repeated hits that false tracks never get. PRIMES is still 5.7× raster at the stress rate.
- **Open-loop raster is unaffected by false alarms only because it ignores what it hears**, which is also why it catches 10 %.

**Own deinterleaving instead of labelled pulses** (tuning scenarios, disjoint from the benchmark). The scheduler receives only unlabelled pulse descriptor words (ToA, frequency, pulse width, AoA). Within a dwell it groups pulses by bearing and splits groups whose frequencies are further apart than one agile emitter spans (1.1 GHz). Across dwells a group joins the track whose AoA gate, centred on an alpha-beta predicted bearing and widened with time since last heard, contains it; pulse width only breaks ties. This design came from measuring the real PDWs: bearing is the stable key (1–6° spread per dwell); pulse width is not, because many radars interleave several width modes within milliseconds; hoppers span up to 1 GHz; and close fly-bys sweep >10°/s.

| Tuning scenarios (3 each) | Labelled pulses (ideal) | **Own deinterleaving** | Pulse purity | Tracks per real emitter |
|---|---|---|---|---|
| easy | 64.8 % | **64.8 %** | 1.000 | 1.00 |
| lockout | 74.8 % | **74.8 %** | 1.000 | 1.00 |
| popup | 73.7 % | **73.1 %** | 0.988 | 1.00 |
| dense (40 emitters) | 70.1 % | **67.6 %** | 0.994 | 1.18 |
| mixed | 79.8 % | **76.7 %** | 0.988 | 1.22 |
| real Turing scenarios (PDWs with the dataset's own noise) | 73.0 % | **74.3 %** | 0.990 | 1.21 |
| **mean** | 72.7 % | **71.9 %** | | |

Where emitters are crowded (`dense`, `mixed`), co-bearing emitters occasionally merge and some fragment, costing 2–3 points. On real PDWs, the tracks that fragment are mostly fly-bys and multi-mode radars, and the net effect is within noise.

**Threat-aware priority** (tuning scenarios, disjoint from the benchmark):

| | PRIMES | PRIMES + threat priority |
|---|---|---|
| Real scenarios: high-threat flashes intercepted | 69.7 % | **77.6 %** |
| Real scenarios: time to first catch of a high-threat radar | 9.8 s | **7.7 s** |
| Real scenarios: all flashes intercepted | 73.0 % | 75.1 % |
| Simulated `mixed` / `lockout`: all flashes intercepted | 79.4 % / 75.6 % | 69.0 % / 67.5 % |

On real data, prioritising improves both the threat metric and the overall one. On crowded simulated scenarios it diverts time from search, so it ships as an operator-selectable mission profile.

Each radar type in the dataset has one parameter template, so the classifier behind the profile identifies a *known* type essentially perfectly. The harder test is a type it has **never seen**. Leaving each of the 68 types out in turn, it predicts the threat level correctly **63 %** of the time vs 48.5 % chance. The priority it assigns is correctly ordered on average: low 1.04, medium 1.54, high 2.26.

## 3.2 What the numbers do *not* claim

- The clairvoyant oracle (85–98 %) is **not** an achievable target: it is handed the truth.
- The residual ~20 % gap on simulated scenarios is dominated by flashes that occur **before** a blind search first finds an emitter — a physical limit of one narrowband receiver, not a tuning failure.
- Robustness figures vary **one** impairment at a time; combined low P_d *and* high P_fa is not yet measured.
- **Track existence weighting** (discounting a track by its probability of being a real emitter) was implemented and measured. It rejects false tracks, but on clean scenarios it also discounts real emitters caught only once (easy, seed 0: 85.6 % → 66.1 %). It is **off by default**; the unweighted scheduler already tolerates realistic false-alarm rates (table above).
- The information-gain term shows **no measurable benefit**; three other ideas (frequency-seeded search, faster revisits for intermittent emitters, a per-discovery bookkeeping change) were measured and **rejected**. Reporting them is deliberate: it shows the tuning was evidence-driven.

## 3.3 Resource feasibility

| Resource | Requirement |
|---|---|
| Development compute | a laptop; the full 610-run benchmark takes ~45 min on 3 cores; DQN training ~25 min on CPU |
| Runtime compute (target) | ~10⁴ operations per decision; fits a modest embedded CPU. Python prototype currently takes 25–50 s per 30 s scenario — a **porting** task, not an algorithmic one |
| Data | open, Apache-2.0 licensed; metadata streamed, no bulk storage needed |
| Licences / cost | zero: entirely open-source stack, no proprietary toolchain |
| Skills | signal processing + applied Bayesian inference + ordinary web/backend engineering |

## 3.4 Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Missed detections / false alarms** in a real front-end | Certain | Measured graceful degradation: P_d = 0.5 keeps 0.67 of oracle; ≤ 2-point loss at realistic false-alarm rates. The evidence model is P_d-aware |
| **Real deinterleaving is imperfect** | High | Measured: with its own deinterleaving from unlabelled PDWs, PRIMES loses 0.8 points on average vs truth labels (72.7 % → 71.9 %), and none on real dataset scenarios. A learned deinterleaver can replace the rule-based one in L2 |
| **Real-time budget on embedded hardware** | Medium | Bounded per-decision cost by design; ONNX/C++ port; hardware-in-the-loop test on an SDR |
| **Domain gap between simulator and a specific platform** | Medium | Validated on an independent dataset already; simulator parameters are fitted, not invented; priors refit per theatre |
| **Adversary exploits the learned behaviour** | Low–Medium | Staleness governor, dither, per-track time caps, evidence floors (§2.7) |
| **Evaluator scepticism of "AI in the loop"** | Medium | Deterministic fallback, per-decision explanations, replayable audit trail, and a measured comparison against a fairly-tuned DQN |
| **Long-period emitters (≥ 15 s) cannot be learned in a short engagement** | Certain (physics) | Fall back to the search prior; metrics stratified so the limitation is visible, not hidden |

## 3.5 Path from prototype to fielded capability

| Stage | Work | Indicative effort |
|---|---|---|
| **Now (TRL 3–4)** | Algorithm + simulator + dataset validation + demo | done |
| **TRL 4–5** | Real deinterleaving in the loop; hardware-in-the-loop with an SDR (RFSoC/USRP class); latency port to C++/ONNX; recorded-signal replay | 3–6 months |
| **TRL 5–6** | Integration with an existing ESM suite as a scheduling module; multi-receiver coordination; trials against instrumented emitters | 6–12 months |
| **TRL 6+** | Multi-platform fusion; certification evidence pack (determinism, fallback, audit); field trials | 12+ months |

**Viability as a product:** PRIMES is a **software upgrade to existing receivers** — same antenna, same front-end, better decisions. That is the cheapest possible path to capability, and it degrades gracefully to today's behaviour if switched off.

---

# 4. Impact & Benefits

## 4.1 Operational impact

| Effect | Measured |
|---|---|
| **More of the electromagnetic picture** | 4.2× more radar flashes intercepted than the open-loop sweep on real scenarios (69.8 % vs 16.8 %), 82 % of a clairvoyant scheduler |
| **Blind spots eliminated** | lock-out emitters go from 1 % of flashes and 15 % discovered, to 69 % of flashes and 95 % discovered |
| **Earlier warning** | time to first catch cut by up to 3.2× (lock-out 55.7 s → 17.2 s; easy 36.9 s → 16.6 s) |
| **Better emitter parameters** | 85–96 % of a tracked emitter's flashes are caught on simulated scenarios, so PRI/scan/agility estimates rest on far more samples |
| **Operator trust** | every dwell decision is explained in one line; the learned period of each radar is displayed against truth in the demo |

Why each matters operationally: an ES system exists to answer *what is out there, where, and is it a threat now*. Flashes are the raw evidence for all three. Catching ~4× more of them, and catching the radars that a fixed sweep structurally cannot see, changes the quality of the tactical picture rather than just a metric.

## 4.2 Economic and programmatic benefits

- **No new hardware:** a scheduling-software change to fielded receivers.
- **Fleet-wide upgrade path:** one validated artefact set can be deployed to many platforms; behaviour is reproducible and auditable.
- **Lower operator workload:** the scheduler handles search/track balance that operators currently manage by choosing sweep plans.
- **Cheap to develop and maintain:** open-source stack, no licence costs, an automated benchmark that regenerates every figure from seeds.

## 4.3 Strategic benefits

- **Works without a threat library** — exactly the case where imported, pre-programmed scan plans fail, and the case the problem statement targets.
- **Indigenous and adaptable:** priors are refitted from locally observed populations; nothing depends on a foreign threat database.
- **Transparent AI for defence:** explanations, deterministic fallback and replayable audit make it acceptable where black-box RL would not be.

## 4.4 Wider applications

| Domain | Use |
|---|---|
| Spectrum monitoring / regulation | find intermittent or unlicensed transmitters with limited receivers |
| Interference hunting | telecom operators tracking sporadic interferers |
| Radio astronomy / RFI mitigation | schedule monitoring of a wide band with narrow instruments |
| Search problems in general | the same "predict → value per unit time → schedule" pattern fits sensor scheduling, inspection routing and anomaly sweeps |

---

# 5. Research & References

## 5.1 Prior art we build on

| Reference | What we take from it |
|---|---|
| A. G. Self, B. G. Smith, *Intercept time and its prediction*, IEE Proc. F, 1985 | Classical probability-of-intercept theory; used to validate the simulator's intercept statistics |
| I. V. L. Clarkson, *Optimisation of periodic search strategies for electronic support*, IEEE Trans. AES, 2011 | Synchronisation / lock-out of periodic sweeps (Farey ratios); motivates our adversarial scenarios and the anti-sync dither |
| I. V. L. Clarkson, *Sensor scheduling for electronic support to intercept beam-agile radar*, IET RSN, 2019 | Periodic vs stochastic emitter models for scheduling |
| I. V. L. Clarkson, *Approximate ML period estimation from sparse, noisy timing data*, IEEE Trans. SP, 2008; McKilliam & Clarkson, ICASSP 2008 | Period estimation from sparse irregular observations — the basis for our censored candidate-and-refit estimator |
| K. Liu, Q. Zhao, *Indexability of restless bandit problems and optimality of Whittle index for dynamic multichannel access*, IEEE Trans. IT, 2010 | The restless-bandit index paradigm and the Gilbert–Elliott channel model |
| *Restless bandits with imperfect binary feedback: PCL-indexability*, arXiv:2606.11192 | Index theory under missed detections and false alarms |
| Nakhleh et al., *NeurWIN: Neural Whittle Index Network*, NeurIPS 2021 | Learned index policies — the roadmap route for a residual learner |
| Russo & Van Roy, *Learning to optimize via information-directed sampling*, Operations Research, 2018 | Information-value term in the score |
| *Machine Learning-based Receiver Scheduling for Electronic Support* (Double-DQN), IEEE Xplore 11310649 | The current published ML approach — reimplemented as our comparator |
| The Alan Turing Institute, *The Turing Synthetic Radar Dataset*, arXiv:2602.03856 | Independent emitter population and ground truth |
| *Radar Pulse Deinterleaving with Transformer-Based Deep Metric Learning*, arXiv:2503.13476 | Learned replacement for our rule-based bearing/frequency deinterleaver |
| RFRL Gym (Virginia Tech NSI), arXiv:2401.05406 | Reference point for RF RL environments |

## 5.2 Our own measurements (reproducible from this repository)

| Finding | Method | Where |
|---|---|---|
| Reference receiver: 36 centres, ±500 MHz acceptance, fixed 2.15 s cycle — explains 99.987 % of 22.7 M pulses | replay of the published schedule against 250 scan-mode files | `scripts/inspect_turing_dataset.py`, `DATASET_NOTES.md` |
| 96.2 % of scan periods on 22 discrete values (128,252 emitters) | metadata streamed from 2,500 training scenarios | `primes/data/fit_priors.py` |
| Real emitters: median 32 % visibility duty; only 12 % flash-like | illumination analysis of stare-mode truth | `DATASET_NOTES.md` |
| Open-loop intercepts 6.3 % of narrow flashes / 11.5 % of all | exact replay of the real schedule on 11 scenarios | `DATASET_NOTES.md` |
| PRIMES vs 4 baselines + DQN + oracle, 6 scenario families, bootstrap CIs, 5 ablations | 610-run benchmark | `experiments/benchmark.py`, `artifacts/benchmark.json` |
| PRIMES keeps 0.67–0.75 of oracle interception from P_d = 1 down to 0.5, and loses ≤ 2 points up to ~23 false alarms per run | 1,008-run robustness sweep | `experiments/robustness.py`, `artifacts/robustness.json` |
| Threat priority: real-scenario high-threat interception 69.7 % → 77.6 %, first catch 9.8 → 7.7 s; unseen-type threat level 63 % vs 48.5 % chance | variant sweep; leave-one-radar-type-out | `experiments/compare_variants.py`, `primes/threat/train.py`, `artifacts/threat_loto.json` |
| Own deinterleaving from unlabelled PDWs costs 0.8 interception points on average (none on real scenarios); purity 0.99, 1.0–1.2 tracks per emitter | variant sweep on tuning scenarios; raster-fed association harness | `primes/associate/`, `experiments/association_quality.py` |
| Component attribution: micro dwell controller +7–9 points on periodic scenarios; learned prior +14 points on easy; information gain no benefit; 5 further ideas measured and rejected | ablations and variant sweeps on disjoint tuning scenarios | `experiments/compare_variants.py`, `PROGRESS.md` |

## 5.3 Reproducibility

```bash
pip install -r requirements.txt
pytest -q                                      # 20 tests
python -m experiments.benchmark --seeds 10     # regenerates artifacts/benchmark.json
uvicorn api.main:app --port 8000               # backend
cd web && npm install && npm run dev           # demo at localhost:3000
```

Every result is a deterministic replay from a seed; the benchmark checkpoints each run and resumes if interrupted.

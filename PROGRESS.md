# PRIMES — Progress

_Last updated: 2026-09-17 (threat-aware priority; false alarms as new emitters; 1,008-run robustness sweep)_

## Status at a glance

| Area | Status |
|---|---|
| Research, design, dataset analysis | ✅ done |
| Learned emitter priors from Turing data | ✅ done |
| Simulator, receiver model, baselines, replay, metrics | ✅ done, tested |
| PRIMES-lite scheduler (the ML core) | ✅ working, tested; beats every rival on every scenario family with non-overlapping CIs |
| Double-DQN comparator | ✅ trained and evaluated on held-out seeds (fair rival, on par with the greedy bandit) |
| FastAPI backend | ✅ working |
| Next.js frontend (replay + benchmark pages) | ✅ working, both pages verified |
| Multi-seed benchmark with confidence intervals | ✅ done: 610 runs incl. ablations, `artifacts/benchmark.json` |
| Solution document (ideation, technical approach, feasibility, impact, references) | ✅ `docs/PRIMES_FULL_ARCHITECTURE.md` |
| Frontend head-to-head banner (live "N× more" factor) | ✅ done |
| Threat-aware scheduling (taxonomy, classifier, metrics, variant) | ✅ measured; variant `primes_threat`, off by default |
| Robustness sweep (P_d, P_fa) | ✅ 1,008 runs, `artifacts/robustness.json` |

## Where things are

| What | Location |
|---|---|
| Full solution / PPT content (4 architecture views) | `docs/PRIMES_FULL_ARCHITECTURE.md` |
| Prototype scope doc | `docs/PRIMES_PROTOTYPE.md` |
| Dataset findings | `docs/DATASET_NOTES.md` |
| Benchmark results (evidence) | `artifacts/benchmark.json`, shown on the web benchmark page |
| Original plan | `PLAN.md` |
| Code | stacked feature branches, see below |

### Branches (all pushed)

Code branches are stacked, each built on the previous one. `feature/web` also contains the docs branch, so **one PR from `feature/web` into `main` brings in everything**:

```
main
 ├─ docs/architecture-and-prototype   (merged into feature/web)
 └─ feature/prototype-core            receiver, scenarios, Turing loader, baselines, replay, metrics
     └─ feature/primes-lite           learned priors, PRIMES-lite scheduler, tests
         └─ feature/dqn               Gym environment, Double-DQN comparator
             └─ feature/api           FastAPI backend, benchmark script
                 └─ feature/web       Next.js frontend, docs, benchmark results, README, this file
                     └─ feature/tracking-fix   value-of-resolving + appointment blocking, tuning sweep, re-run benchmark
                         └─ feature/search-prior   frequency-prior ablation, resumable benchmark
                             └─ feature/accuracy   micro dwell controller, head-to-head UI, solution document, 610-run benchmark
```

## What's been built

### 1. Dataset analysis (Turing Synthetic Radar Dataset)
- **Receiver model:** reverse-engineered the scan-mode receiver. 36 dwell centres, **±500 MHz acceptance** (adjacent dwells overlap 50 %), a fixed **2.15 s** cycle. It explains **99.987 %** of 22.7 M pulses.
- **Priors:** fitted from **2,500 training scenarios (128,252 emitters)** by streaming metadata over the HF API. **96.2 % of scan periods fall on just 22 discrete values**, so after a single catch PRIMES checks about 19 likely return times instead of a continuous range.
- **Real visibility (important correction):** in stare-mode truth, emitters are visible a **median 32 % of the time**, in long intermittent stretches. Only **12 %** behave like short periodic main-beam flashes. The "~14 ms flash every ~4 s" figure comes from metadata (beamwidth × period), not from observed pulses.
- **Open-loop raster**, replayed on 11 real scenarios, intercepts ~6 % of narrow flashes (≥ 3 pulses) and 11.5 % of all gap-split flashes.

### 2. Prototype core (`primes/`)
- **Receiver:** Turing replica with n-min-pulse detection, P_d, P_fa and measured frequency.
- **Scenario families:**
  - `easy`
  - `lockout` (exact and near-commensurate with the raster)
  - `popup`
  - `dense` (sampled from learned priors)
  - `mixed` (periodic + intermittent)
  - real `turing:<config>`
- **Baselines:** raster (exact Turing schedule), random, hit-rate bandit, clairvoyant oracle.
- **Evaluation:** exact pulse-level replay and all figures of merit, including interception ratio, discovery, time to first intercept, pop-up latency, % correct predictions, intercept-time error and false alarms.

### 3. PRIMES-lite scheduler
- **Periodic track model per emitter:** candidates from the learned discrete prior after one hit; weighted least-squares refit from hit differences after two. Misses eliminate phase intervals (interval-censored evidence).
- **Gilbert–Elliott on/off model** per emitter, competing with the periodic model through Bayes factors. This handles the real data's intermittent visibility.
- **Undiscovered-emitter belief** per 250 MHz cell, with a pop-up hazard and an **online-learned visibility factor κ**. It adapts when real emitters are far more visible than the metadata prior suggests.
- **Rate index:** value per unit receiver time = (exploit + discovery + λ·information gain) / dwell. It chooses the dwell centre and dwell length (5–100 ms), uses golden-ratio dither in search mode, and logs an explanation for every decision.
- **Micro dwell controller (default):** 5 ms search looks; a look that heard 1–2 pulses near its end is extended on the same frequency; search looks stop once 3 pulses confirm an emitter; a look only counts as evidence if it comfortably holds that emitter's pulses.
- **20 unit tests pass:** period recovery, sub-harmonic elimination, Markov learning, lock-out breaking, beating raster.

### 4. Double-DQN comparator (`primes/rl/`)
- **Setup:** Gymnasium environment (validated), model-free features, reward matching PRIMES' objective, SB3 DQN with Double-Q targets.
- **First run:** collapsed to a near-constant policy (unfair strawman), so it was discarded.
- **Second run:** fixed 25 ms band selection, 5-step returns, 600k steps, best-on-validation checkpoint (validation reward 199). On held-out seeds it performs on par with the greedy bandit (e.g. 20.7 % on `dense`) and is kept as the ML rival.

### 5. Backend and frontend
- **API (`api/main.py`):** `/api/catalog`, `POST /api/runs` (replay + disk cache), `/api/runs/{id}`, `/api/benchmark`.
- **Web, mission replay page:**
  - scenario and scheduler pickers, stat tiles and playback
  - spectrum-time canvas per scheduler
  - intercept and discovery timelines
  - "Why PRIMES looked there" decision panel
  - learned-track table (estimated vs true period)
  - shareable auto-run links
- **Web, benchmark page:** interval plots with 95 % confidence intervals, plus a table.

## Benchmark results (610 runs: 10 seeds × 5 simulated families + 11 real Turing scenarios, 95 % bootstrap CIs)

Flash interception ratio, mean (higher is better). Full table with CIs: web benchmark page or `artifacts/benchmark.json`.

| Scenario | Raster (open-loop) | Greedy bandit | Double-DQN | **PRIMES** | Oracle (upper bound) |
|---|---|---|---|---|---|
| easy | 5.6 % | 14.4 % | 4.4 % | **72.3 %** | 96.1 % |
| lock-out | 1.0 % | 7.6 % | 5.8 % | **69.1 %** | 98.3 % |
| pop-up | 5.8 % | 10.8 % | 5.3 % | **61.6 %** | 97.6 % |
| dense (40 emitters) | 9.9 % | 20.3 % | 20.7 % | **65.9 %** | 89.9 % |
| mixed periodic + intermittent | 14.1 % | 17.2 % | 10.3 % | **78.8 %** | 94.3 % |
| **Turing dataset (real)** | 16.8 % | 20.3 % | 15.3 % | **69.8 %** | 84.8 % |

PRIMES' 95 % intervals do not overlap any non-oracle rival's on any scenario family. On real data PRIMES catches **4.2×** the flashes of the open-loop sweep and reaches **82 %** of what a clairvoyant scheduler achieves.

Other metrics:

| Scenario | Emitters discovered: raster → PRIMES | Mean time to first intercept: raster → PRIMES | Flashes caught once tracked (PRIMES) | Next-flash predictions correct |
|---|---|---|---|---|
| easy | 68 % → 93 % | 36.9 s → 16.6 s | 94.7 % | 91 % |
| lock-out | 15 % → 95 % | 55.7 s → 17.2 s | 91.0 % | 98 % |
| pop-up | 57 % → 78 % | 32.0 s → 20.5 s | 96.3 % | 94 % |
| dense | 76 % → 70 % | 27.6 s → 25.4 s | 84.6 % | 96 % |
| mixed | 87 % → 86 % | 18.9 s → 17.7 s | 88.5 % | 92 % |
| Turing (real) | 93 % → 93 % | 9.7 s → 9.3 s | 73.6 % | 6 % (few flash-like emitters; see caveats) |

**Where the remaining losses are:** on simulated scenarios most of the gap to the oracle is flashes that occur *before* a blind search first finds their emitter; once tracked, PRIMES catches 85–96 % of an emitter's flashes. On real data only ~5 % is lost to search; tracked capture is ~74 % vs the oracle's ~85 %, which is receiver contention (dozens of emitters visible at once) plus the oracle's foresight. The on/off model itself is well calibrated (predicted 0.39 vs observed 0.37, bin by bin).

**Ablations (what produces the gain), from this benchmark:**
- **Micro dwell controller** (5 ms search looks, extend on partial pulses, stop on confirmation, reliable-dwell rule): easy 65.5 % → 72.3 %, lock-out 60.2 % → 69.1 %, pop-up 57.9 % → 61.6 %; neutral on dense, mixed and Turing. Time to first catch on easy 25.3 s → 16.6 s, lock-out 24.2 s → 17.2 s.
- **Reliable-dwell rule** (a look only counts as evidence about an emitter if it comfortably holds that emitter's pulses): lifted real-data interception even without the micro controller (Turing 64.5 % → 69.0 %).
- **Learned prior vs flat prior:** easy 72.3 % vs 58.5 %, Turing 69.8 % vs 67.3 %; lock-out is within noise.
- **Value of resolving + appointment blocking** (earlier round): lock-out tracking 70 % → 95 %.
- **Information-gain term:** no benefit. Removing it is slightly *better* on 5 of 6 families (e.g. lock-out 76.1 % vs 69.1 %, Turing 71.8 % vs 69.8 %), though the intervals overlap. It should be decided on the tuning scenarios, not on this benchmark, to avoid tuning on reported data.
- **Parameter sweep** (`experiments/tune_wnew.py`): defaults `w_new = 2`, `stale = 2 s` are at the cross-family optimum.

**Ideas tried and rejected (measured, then reverted or left off):**
- **Search seeded with the learned frequency distribution** (78 % of emitters sit in 12 of 72 frequency cells). Worse on every scenario: Turing 64.5 % → 57.7 %, mixed 79.1 % → 47.7 %, easy 65.5 % → 34.6 %. Within a 30–60 s engagement it over-concentrates search on the busy bands and starves the rest. Kept as the `primes_fprior` ablation, off by default.
- **Faster revisits (0.25–0.5 s) for intermittent emitters.** PRIMES camps on already-visible emitters instead of searching: Turing 74 % → 56 %, dense 70 % → 52 % on tuning scenarios. Rejected; the knob exists, default unchanged.
- **Lowering the undiscovered-emitter count by one per discovery.** Statistically invalid for a Poisson count, and measured worse (easy 65.5 % → 57.6 %). Reverted.

- **Shorter search dwells (5 ms, 3 ms), with a realistic 0.5 ms retune time.** Helps periodic scenarios (lock-out 60 % → 64 %, all emitters found more often) but hurts intermittent ones (mixed 80 % → 49 %) because a very short look is an unreliable test of a bursty emitter. Net: 65.9 % → 57.4 % mean on tuning scenarios (5 seeds). Left off; `dwells_s` is configurable.
- **Online per-dwell detection calibration** (observed vs predicted detections, per dwell length). No measurable effect at 5 seeds (65.6 % vs 65.9 %); an apparent +1.6 points at 3 seeds was noise. Left off (`calibrate_dwells`).
- Kept from that round: the on/off model now ignores dwells too short to hold the 3 pulses a detection needs (principled; no measurable change at the default dwell lengths), and the benchmark now reports **acquisition loss** and **tracked-flash capture** separately.

**Where PRIMES does not win:** on `dense` raster discovers slightly *more* emitters (76 % vs 70 %) at about the same time-to-first-intercept; PRIMES trades a little breadth of search for 6.7× the flashes intercepted there. On real data discovery is now equal (93 % vs 93 %). `w_new` moves along this trade-off.

## Threat-aware scheduling

- **Labels and classifier:** 68 radar types mapped to low / medium / high (`primes/assets/threat_taxonomy.json`); the classifier works on observable parameters (`primes/threat/`).
- **Classifier accuracy:** 100 % on known types, because each type has one parameter template, so this is a library lookup. On unseen types (leave-one-type-out) it scores **63 % vs 48.5 % chance**.
- **Real tuning scenarios:** high-threat interception **69.7 % → 77.6 %**; first catch of a high-threat radar **9.8 → 7.7 s**; overall interception 73.0 → 75.1 %.
- **Simulated tuning scenarios:** overall interception mixed 79.4 → 69.0 %, lockout 75.6 → 67.5 %, easy 61.6 → 65.7 %. Because of this it is a mission profile, not the default.

## Robustness (1,008 runs: 7 conditions × raster / greedy / PRIMES / oracle × 25 simulated + 11 real scenarios)

| Condition | Raster | Greedy | **PRIMES** (95 % CI) | Oracle | PRIMES / oracle | PRIMES on real scenarios |
|---|---|---|---|---|---|---|
| nominal (P_d = 1, P_fa = 0) | 10.3 % | 16.1 % | **69.0 %** [65.5, 72.1] | 91.6 % | 0.75 | 69.8 % |
| P_d = 0.9 | 9.6 % | 15.9 % | **62.7 %** [58.9, 66.1] | 87.4 % | 0.72 | 62.1 % |
| P_d = 0.7 | 8.2 % | 13.9 % | **55.5 %** [51.7, 59.2] | 77.4 % | 0.72 | 56.9 % |
| P_d = 0.5 | 6.3 % | 12.4 % | **44.4 %** [40.3, 48.8] | 66.5 % | 0.67 | 48.2 % |
| P_fa = 0.001 per look (~5 false alarms / run) | 10.3 % | 15.6 % | **68.1 %** [65.0, 71.0] | 91.6 % | 0.74 | 69.7 % |
| P_fa = 0.005 (~23 / run) | 10.3 % | 16.6 % | **66.8 %** [62.7, 70.8] | 91.6 % | 0.73 | 70.3 % |
| P_fa = 0.02 (~70 / run, stress) | 10.3 % | 16.4 % | **58.4 %** [54.0, 62.9] | 91.6 % | 0.64 | 66.8 % |

- False alarms are now modelled as new emitters (unique id, plausible pulse train, random in-band frequency), not as ignorable noise.
- Track existence odds (`use_existence`) reject false tracks but discount real emitters caught only once (easy, seed 0: 85.6 % → 66.1 %), so they are off by default.

## Known issues and caveats

1. **DQN is a modest rival.** It matches the greedy bandit but not more; a stronger model-free baseline (longer training, recurrent policy) would make the comparison harder to dismiss. What exists is fair: same reward, same environment, best-on-validation checkpoint, held-out seeds.
2. **Discovery breadth on `dense`** is below raster (70 % vs 76 %); on real data it is now equal. Tunable via `w_new`.
3. **Information gain adds nothing**, and removing it looks slightly better; decide on tuning scenarios, then either drop it or keep it as an ablated component. Do not claim it as a source of gain.
4. **Ideal association:** pulses arrive already labelled by emitter (truth labels). Next item: realistic association from noisy PDWs.
5. **Prediction accuracy** is scored only on flash-like emitters. On real Turing data there are few (4–6 per scenario), so that metric is thin there.
6. **Runtime:** PRIMES takes tens of seconds to a few minutes per 30 s Turing scenario in Python (the micro controller makes more, shorter decisions). Fine for replay and demo (results are cached); not real-time yet: a porting task.
7. **Simulator realism:** simulated flash emitters are idealised compared with Turing visibility. The `mixed` family and the Turing replays cover the gap.

## Next steps

1. Open one PR from `feature/accuracy` into `main` (it contains everything since the last merge) and merge.
2. Put the benchmark numbers and the ablation findings on the slides; the benchmark page screenshots well.
3. Optional improvements: tune `w_new` / `λ` on training seeds (Optuna); vectorise PRIMES across tracks for speed; stronger DQN; real deinterleaving instead of ideal association.

## How to run

See [`README.md`](README.md).

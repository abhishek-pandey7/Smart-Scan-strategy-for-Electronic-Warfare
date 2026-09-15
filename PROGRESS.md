# PRIMES — Progress

_Last updated: 2026-09-15 (evening)_

## Status at a glance

| Area | Status |
|---|---|
| Research, design, dataset analysis | ✅ done |
| Learned emitter priors from Turing data | ✅ done |
| Simulator, receiver model, baselines, replay, metrics | ✅ done, tested |
| PRIMES-lite scheduler (the ML core) | ✅ working, tested; beats baselines in smoke tests |
| Double-DQN comparator | ✅ trained and evaluated on held-out seeds (fair rival, on par with the greedy bandit) |
| FastAPI backend | ✅ working |
| Next.js frontend (replay + benchmark pages) | ✅ working, both pages verified |
| Multi-seed benchmark with confidence intervals | ✅ done: 488 runs, `artifacts/benchmark.json` |
| Docs corrections from new findings | ✅ done |

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
- **Rate index:** value per unit receiver time = (exploit + discovery + λ·information gain) / dwell. It chooses the dwell centre and dwell length (10–100 ms), uses golden-ratio dither in search mode, and logs an explanation for every decision.
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

## Benchmark results (10 seeds × 5 simulated families + 11 real Turing scenarios, 95 % bootstrap CIs)

Flash interception ratio, mean (higher is better). Full table with CIs: web benchmark page or `artifacts/benchmark.json`.

| Scenario | Raster (open-loop) | Greedy bandit | Double-DQN | **PRIMES** | Oracle (upper bound) |
|---|---|---|---|---|---|
| easy | 5.6 % | 14.4 % | 4.4 % | **62.5 %** | 96.1 % |
| lock-out | 1.0 % | 7.6 % | 5.8 % | **48.2 %** | 98.3 % |
| pop-up | 5.8 % | 10.8 % | 5.3 % | **57.9 %** | 97.6 % |
| dense (40 emitters) | 9.9 % | 20.3 % | 20.7 % | **63.0 %** | 89.9 % |
| mixed periodic + intermittent | 14.1 % | 17.2 % | 10.3 % | **80.7 %** | 94.3 % |
| **Turing dataset (real)** | 16.8 % | 20.3 % | 15.3 % | **63.0 %** | 84.8 % |

PRIMES' 95 % intervals do not overlap any non-oracle rival's on any scenario family.

Other metrics:

| Scenario | Emitters discovered: raster → PRIMES | Mean time to first intercept: raster → PRIMES | PRIMES next-flash predictions correct |
|---|---|---|---|
| easy | 68 % → 84 % | 36.9 s → 23.7 s | 82 % |
| lock-out | 15 % → 92 % | 55.7 s → 24.2 s | 97 % |
| pop-up | 57 % → 72 % (pop-up latency 25.0 s → 22.7 s) | 32.0 s → 24.5 s | 95 % |
| dense | 76 % → 69 % | 27.6 s → 26.8 s | 96 % |
| mixed | 87 % → 90 % | 18.9 s → 16.0 s | 92 % |
| Turing (real) | 93 % → 87 % | 9.7 s → 10.3 s | 18 % (few flash-like emitters; see caveats) |

**Ablations (what produces the gain):**
- **Learned prior vs flat prior:** large effect on sparse periodic scenarios (`easy` 62.5 % vs 38.2 %, `pop-up` 57.9 % vs 45.8 %), neutral on dense / mixed / Turing where the on/off model and κ dominate.
- **Information-gain term:** no measurable effect at this scale (all differences inside the CIs). Honest finding: the exploit + discovery terms already place looks well; IG is a candidate for removal or re-tuning.

**Where PRIMES does not win:** on real Turing data and on `dense`, raster discovers slightly *more* emitters (93 % vs 87 %; 76 % vs 69 %) and reaches its first intercept about as fast. PRIMES trades a little breadth of search for 3.75× the flashes intercepted. Tuning `w_new` (the discovery weight) would move along this trade-off.

## Known issues and caveats

1. **DQN is a modest rival.** It matches the greedy bandit but not more; a stronger model-free baseline (longer training, recurrent policy) would make the comparison harder to dismiss. What exists is fair: same reward, same environment, best-on-validation checkpoint, held-out seeds.
2. **Discovery breadth on real data** is slightly below raster (see results). Tunable via `w_new`.
3. **Information gain adds nothing measurable** in the current setup; keep it in the architecture story as an ablated component, not as a claimed source of gain.
4. **Ideal association:** pulses arrive already labelled by emitter (truth labels). Real deinterleaving is roadmap.
5. **Prediction accuracy** is scored only on flash-like emitters. On real Turing data there are few (4–6 per scenario), so that metric is thin there.
6. **Runtime:** PRIMES takes 25–50 s per 30 s Turing scenario in Python. Fine for replay and demo (results are cached); not real-time yet.
7. **Simulator realism:** simulated flash emitters are idealised compared with Turing visibility. The `mixed` family and the Turing replays cover the gap.

## Next steps

1. Open one PR from `feature/web` into `main` (it contains every branch) and merge.
2. Put the benchmark numbers and the ablation findings on the slides; the benchmark page screenshots well.
3. Optional improvements: tune `w_new` / `λ` on training seeds (Optuna); vectorise PRIMES across tracks for speed; stronger DQN; real deinterleaving instead of ideal association.

## How to run

See [`README.md`](README.md).

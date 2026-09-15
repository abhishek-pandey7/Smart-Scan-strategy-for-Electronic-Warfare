# PRIMES — Progress

_Last updated: 2026-09-16_

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
                     └─ feature/tracking-fix   value-of-resolving + appointment blocking, tuning sweep, re-run benchmark
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
| easy | 5.6 % | 14.4 % | 4.4 % | **65.5 %** | 96.1 % |
| lock-out | 1.0 % | 7.6 % | 5.8 % | **60.2 %** | 98.3 % |
| pop-up | 5.8 % | 10.8 % | 5.3 % | **57.9 %** | 97.6 % |
| dense (40 emitters) | 9.9 % | 20.3 % | 20.7 % | **65.2 %** | 89.9 % |
| mixed periodic + intermittent | 14.1 % | 17.2 % | 10.3 % | **79.1 %** | 94.3 % |
| **Turing dataset (real)** | 16.8 % | 20.3 % | 15.3 % | **64.5 %** | 84.8 % |

PRIMES' 95 % intervals do not overlap any non-oracle rival's on any scenario family.

Other metrics:

| Scenario | Emitters discovered: raster → PRIMES | Mean time to first intercept: raster → PRIMES | PRIMES next-flash predictions correct |
|---|---|---|---|
| easy | 68 % → 81 % | 36.9 s → 25.3 s | 89 % |
| lock-out | 15 % → 92 % | 55.7 s → 24.2 s | 100 % |
| pop-up | 57 % → 72 % | 32.0 s → 26.1 s | 96 % |
| dense | 76 % → 69 % | 27.6 s → 25.6 s | 98 % |
| mixed | 87 % → 87 % | 18.9 s → 17.7 s | 94 % |
| Turing (real) | 93 % → 91 % | 9.7 s → 9.7 s | 14 % (few flash-like emitters; see caveats) |

**Where the remaining losses are** (measured split, PRIMES): on `easy` 36 % of flashes occur *before* a blind search first finds their emitter, but once tracked PRIMES catches **99.5 %**, better than the oracle's own tracking rate; on lock-out tracked-flash capture is 95 %; on real Turing data ~5 % is lost to search and tracked capture is ~70 % vs the oracle's ~82 %, a gap that is receiver contention (dozens of emitters on at once) plus the oracle's foresight, since the on/off model is well calibrated (predicted 0.39 vs observed 0.37, bin by bin).

**Ablations (what produces the gain):**
- **Learned prior vs flat prior:** large effect on sparse periodic scenarios (`easy` 65.5 % vs 44.9 %, `pop-up` 57.9 % vs 49.8 %), neutral on dense / mixed / Turing where the on/off model and κ dominate.
- **Value of resolving + appointment blocking (this session's fix):** lock-out 48.2 % → 60.2 %, easy 62.5 % → 65.5 %, dense 63.0 % → 65.2 %, Turing 63.0 % → 64.5 % with discovery 87 % → 91 %.
- **Parameter sweep** (`experiments/tune_wnew.py`, on training seeds and three Turing files outside the benchmark): the defaults `w_new = 2`, `stale = 2 s` are at the optimum of the cross-family mean; a higher discovery weight helps Turing slightly but costs lock-out, so defaults were kept.
- **Information-gain term:** no measurable effect at this scale (all differences inside the CIs). Honest finding: the exploit + discovery terms already place looks well; IG is a candidate for removal or re-tuning.

**Where PRIMES does not win:** on `dense` (and marginally on real data) raster discovers slightly *more* emitters (76 % vs 69 %; 93 % vs 91 %) at the same time-to-first-intercept. PRIMES trades a little breadth of search for 3.8× the flashes intercepted. `w_new` moves along this trade-off.

## Known issues and caveats

1. **DQN is a modest rival.** It matches the greedy bandit but not more; a stronger model-free baseline (longer training, recurrent policy) would make the comparison harder to dismiss. What exists is fair: same reward, same environment, best-on-validation checkpoint, held-out seeds.
2. **Discovery breadth on `dense`** is below raster (69 % vs 76 %); on real data it is now within 2 points. Tunable via `w_new`.
3. **Information gain adds nothing measurable** in the current setup; keep it in the architecture story as an ablated component, not as a claimed source of gain.
4. **Ideal association:** pulses arrive already labelled by emitter (truth labels). Real deinterleaving is roadmap.
5. **Prediction accuracy** is scored only on flash-like emitters. On real Turing data there are few (4–6 per scenario), so that metric is thin there.
6. **Runtime:** PRIMES takes 25–50 s per 30 s Turing scenario in Python. Fine for replay and demo (results are cached); not real-time yet.
7. **Simulator realism:** simulated flash emitters are idealised compared with Turing visibility. The `mixed` family and the Turing replays cover the gap.

## Next steps

1. Open one PR from `feature/tracking-fix` into `main` (it contains every branch) and merge.
2. Put the benchmark numbers and the ablation findings on the slides; the benchmark page screenshots well.
3. Optional improvements: tune `w_new` / `λ` on training seeds (Optuna); vectorise PRIMES across tracks for speed; stronger DQN; real deinterleaving instead of ideal association.

## How to run

See [`README.md`](README.md).

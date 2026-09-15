# PRIMES — Progress

_Last updated: 2026-09-15_

## Status at a glance

| Area | Status |
|---|---|
| Research, design, dataset analysis | ✅ done |
| Learned emitter priors from Turing data | ✅ done |
| Simulator, receiver model, baselines, replay, metrics | ✅ done, tested |
| PRIMES-lite scheduler (the ML core) | ✅ working, tested; beats baselines in smoke tests |
| Double-DQN comparator | 🟡 trained (2nd attempt); **held-out evaluation not yet run** |
| FastAPI backend | ✅ working |
| Next.js frontend (replay + benchmark pages) | ✅ working; benchmark page waits for benchmark data |
| Multi-seed benchmark with confidence intervals | ⏳ script ready, **not yet run** |
| Docs corrections from new findings | ⏳ pending (see "Known issues") |

## Where things are

| What | Location |
|---|---|
| Full solution / PPT content (4 architecture views) | `docs/PRIMES_FULL_ARCHITECTURE.md` on branch `docs/architecture-and-prototype` |
| Prototype scope doc | `docs/PRIMES_PROTOTYPE.md` on the same branch |
| Dataset findings | `docs/DATASET_NOTES.md` (on `main`, more measurements on the docs branch) |
| Original plan | `PLAN.md` |
| Code | stacked feature branches, see below |

### Branches (all pushed)

Code branches are stacked, each built on the previous one, so merging `feature/web` brings in everything:

```
main
 ├─ docs/architecture-and-prototype   (docs only: full architecture, prototype scope, measurements)
 └─ feature/prototype-core            receiver, scenarios, Turing loader, baselines, replay, metrics
     └─ feature/primes-lite           learned priors, PRIMES-lite scheduler, tests
         └─ feature/dqn               Gym environment, Double-DQN comparator
             └─ feature/api           FastAPI backend, benchmark script
                 └─ feature/web       Next.js frontend, README, this file
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
- **Second run:** fixed 25 ms band selection, 5-step returns, 600k steps, best-on-validation checkpoint (validation reward 199). **Not yet evaluated on held-out seeds.**

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

## Results so far (single-seed smoke tests, not the final benchmark)

Flash interception ratio (higher is better):

| Scenario | Raster (open-loop) | Greedy bandit | **PRIMES-lite** | Oracle (upper bound) |
|---|---|---|---|---|
| easy (seed 1) | 3.8 % | 19.2 % | **65.4 %** | 100 % |
| lockout (seed 0) | 0.7 % (1/6 emitters found) | – | **46.7 %** (6/6 found, 97 % predictions correct) | – |
| mixed (seed 1) | 15.1 % | 14.9 % | **78.3 %** | 93 % |
| Turing config_192 (real) | 15.4 % | 19.3 % | **66.2 %** | 82.9 % |
| Turing config_3 (real, 64 emitters) | 16.8 % | 4.6 % | **64.6 %** | 81.6 % |

- **Discovery and time to first intercept on real data:** PRIMES matches or beats raster (config_3: 62/64 vs 60/64 emitters found; mean first intercept 7.4 s vs 8.8 s).
- **Lock-out:** raster catches **zero** flashes from every lock-out emitter. PRIMES learns their exact periods (2.150 s, 2.200 s) and intercepts them.
- **Earlier code version** (before the learned κ; not yet re-run): dense 75.1 % vs raster 11.4 %; popup 24.6 % vs 5.7 %.

These are single runs. Final claims must come from the multi-seed benchmark with confidence intervals.

## Known issues and caveats

1. **DQN not yet validated.** Its held-out evaluation hasn't run, and results may still be weak. A fair, working comparator is required before claiming "beats DQN".
2. **Benchmark not yet run.** No confidence intervals exist yet.
3. **Docs need corrections** on the docs branch:
   - "~14 ms flash every ~4 s" must be labelled as metadata-derived, with the measured visibility added (median 32 % duty, 12 % flash-like).
   - Add the learned-prior result (96.2 % on 22 periods).
   - Update the prototype doc: Streamlit → FastAPI + Next.js; DQN and Markov model now in scope; learned κ.
   - Update the full doc's status table and the results once the benchmark exists.
4. **Ideal association:** pulses arrive already labelled by emitter (truth labels). Real deinterleaving is roadmap.
5. **Prediction accuracy** is scored only on flash-like emitters. On real Turing data there are few (4–6 per scenario), so that metric is thin there.
6. **Runtime:** PRIMES takes 25–50 s per 30 s Turing scenario in Python. Fine for replay and demo (results are cached); not real-time yet.
7. **Simulator realism:** simulated flash emitters are idealised compared with Turing visibility. The `mixed` family and the Turing replays cover the gap.

## Next steps

1. Evaluate Double-DQN on held-out seeds. Retrain with the fixed validation set if still weak.
2. Run the benchmark: `python -m experiments.benchmark --seeds 10 --workers 6`.
3. Correct the docs with the new findings and benchmark numbers, then merge the docs branch.
4. Check the frontend benchmark page and the light theme.
5. Open the PR chain and merge into `main`.
6. Optional: vectorise PRIMES across tracks for speed; tune λ and w_new on training seeds.

## How to run

See [`README.md`](README.md).

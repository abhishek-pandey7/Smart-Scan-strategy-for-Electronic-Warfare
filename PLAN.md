# Smart Scan Strategy for Electronic Warfare — PRIMES

## Context

The project directory `E:\projects\Smart Scan strategy for Electronic Warfare` is empty. This is a greenfield research build.

**The problem.** An Electronic Support (ES) receiver must maintain surveillance over a wide RF spectrum (0.5–18 GHz) using an instantaneous bandwidth an order of magnitude smaller. It must therefore sweep. Classical practice is *open-loop*: a pre-mission, prior-intelligence-driven periodic sweep, tuned for raw speed. Two failure modes follow:

1. It spends equal time on silent/benign bands and on new or threatening ones.
2. A periodic sweep against a periodic emitter can **synchronise** — when sweep period and emitter scan period are commensurate the emitter is *never* intercepted (Clarkson's lock-out result). Raw speed does not fix this; it can cause it.

The problem statement removes the crutch: **no prior reliable intelligence** on emitters or their characteristics. So the scheduler must simultaneously (a) discover each band's temporal structure from its own hits and misses and (b) exploit that structure to minimise intercept time and maximise interception ratio — a two-dimensional (frequency × time) search that is really an *active learning* problem, not a sweep-optimisation problem.

**Intended outcome.** A machine-learning ES receiver scheduler that beats open-loop and standard DRL baselines on time-to-first-intercept and interception ratio, backed by a reproducible experiment harness reporting every figure of merit the problem statement names, validated against an external published dataset.

---

## Why this approach (research verdict)

I surveyed the alternatives; the short version of the trade study:

| Family | Verdict |
|---|---|
| Open-loop periodic / Farey-optimised sweep (Clarkson 2011) | Optimal *only* with a known threat list. Becomes our strongest classical baseline, not our answer. |
| Myopic / greedy on a belief state | Cheap, but greedy on a 2-state Markov belief cannot represent *phase* of a periodic scanner; under-explores. |
| Restless Multi-Armed Bandit + Whittle index (Liu & Zhao) | Provably near-optimal, O(N log N), interpretable, robust to model mismatch. **Right control layer** — but the standard version assumes a Gilbert–Elliott channel, which is the wrong emitter model. |
| Plain Double-DQN scheduler (the current IEEE state of the art) | Model-free, learns *something*, but sample-hungry, opaque to an operator, no worst-case guarantee, and it must rediscover periodicity from scratch in every scenario. **This is the bar to beat.** |
| POMDP solvers | Exact but intractable at 32–64 bands. |

**The gap nobody closes:** the observation record is *censored* — you only learn a band's state when you look at it, and a null look is itself informative. Estimating an emitter's scan period from sparse, censored, irregularly-spaced looks is the crux, and it is exactly the problem Clarkson & McKilliam solved with lattice-based ML period estimation for PRI. Nobody has plugged that into the scheduler's belief state.

**PRIMES** (*Predictive Restless Index for Multiband Electronic Support*) — a three-layer **Predict → Index → Learn** scheduler:

1. **Predict.** Per band, an online Bayesian hypothesis bank over temporal structure — `{silent, periodic-scan(T, duty, phase), staggered/agile, Gilbert–Elliott Markov, Poisson}` — updated on *censored* evidence (a look that saw nothing is a real likelihood term). Periodic hypotheses use a lattice line-search ML period estimator adapted to censored samples. Output: a calibrated posterior predictive `p_b(t)` = P(band b transmits in slot t) **plus its uncertainty**. This layer is what makes "no prior intelligence" survivable, and it directly produces the problem statement's *percentage of correct predictions* and *average intercept time error* metrics.

2. **Index.** A Whittle / marginal-productivity index computed over that posterior predictive, with imperfect binary feedback (P_d < 1, P_fa > 0), threat weights, and retune costs. Decisions are O(N log N) and every decision comes with a scalar reason — an operator can ask "why band 12?" and get an answer. Standard RMAB indices assume Gilbert–Elliott; ours is indexed on a *predictive process*, which is the novel part.

3. **Learn.** Two learned components, both *bounded*:
   - An **information-directed exploration bonus**: index = exploit value + λ · expected information gain about (T, phase). This is the key creative move — to intercept a periodic scanner quickly you must first place looks at maximally *informative* phases, then switch to exploitation. A DQN learns this only implicitly and slowly.
   - A **residual policy** (small GRU, NeurWIN-style learned index correction) trained by deep RL to correct the analytic index where the hypothesis bank is mis-specified, behind a **shield** that provably clamps performance to never fall below the analytic policy.

4. **Anti-synchronisation guarantee.** Golden-ratio / Farey-informed dither on tie-breaks, with a formal check that the realised look sequence is never commensurate with any candidate emitter period — the lock-out failure mode is designed out, not hoped away.

Net: near-optimal control with worst-case protection and interpretability (index policy), plus the adaptivity of deep RL (residual layer), plus an explicit answer to "how do you learn an emitter you've never seen" (censored-evidence predictor).

---

## Environment & data

**Simulator-first, dataset for external validation.**

**Simulator** (`primes/env/`) — the system model the problem statement asks for:
- `N` bands (default 32; dataset-matched config: 35 × 500 MHz over 0.5–18 GHz), slot Δt (default 1 ms), horizon 30 s.
- Receiver: tunes one band per slot (config extends to K simultaneous or a wideband/narrowband sensitivity trade), dwell = m slots, retune/settling penalty τ, sensitivity threshold.
- Emitters: circular / sector / raster **spatial scan** (period `T_s`, illumination dwell `t_ill`), PRI (fixed / staggered / jittered), **frequency agility** (hop set + hop period), duty cycle; plus stochastic emitters via continuous-time Markov chain / Gilbert–Elliott, and aperiodic Poisson emitters.
- Detection model: `P_d(SNR, dwell)` when illuminating ∧ in-band ∧ in-slot; `P_fa` per look. Both configurable — sensitivity is a swept parameter, not a constant.
- **Truth tensor** `O[b, t] ∈ {0,1}` + emitter-id map, exported per scenario. This is the "truth information on status of emitters in each band and at each time slot" the statement requires.

**Why the truth tensor matters:** because the scheduler only consumes what it looks at, *any* policy can be replayed exactly against a stored truth tensor. That gives **exact off-policy evaluation** — no importance weighting, no re-simulation — so all policies are compared on identical environments.

**External dataset** — `alan-turing-institute/turing-synthetic-radar-dataset` (Apache-2.0, gated, 70 GB; we pull a subset). Verified findings are in [`docs/DATASET_NOTES.md`](docs/DATASET_NOTES.md).
- **Stare Mode** is an oracle receiver over 0.5–18 GHz for 30 s. It supplies ground truth: per-pulse emitter labels, plus full per-emitter metadata (scan type, rate, beamwidth, hop set, PRI mode). Replay is done **at pulse level** (exact), and a 1 ms `(band × slot)` tensor is derived for the learning models.
- **Scan Mode** is a fixed open-loop sweep over the *same* scenarios: 36 dwell centres at 500 MHz spacing, **±500 MHz acceptance, so adjacent dwells overlap by 50 %**, and one 2.15 s cycle identical in every file. This is a published open-loop baseline we did not tune. Scan files are *independent stochastic realisations*, not filtered copies of the stare files, so validation compares statistics, not individual pulses.
- **Action space follows the dataset:** 36 overlapping dwell centres, making the arms correlated. The index layer selects by *marginal coverage gain*, not by independent per-arm indices. Dwell length is part of the action (e.g. {10, 25, 50, 100} ms), because the median illumination flash is ~14 ms against 50–100 ms open-loop dwells.
- **Simulator priors:** emitter parameter distributions are fitted from `train_scan` metadata (4.9 GB), so the 49 GB `train_stare` split is never downloaded. The scheduler itself never sees this metadata at run time; it still starts with no prior intelligence.
- Note: this dataset is built for *deinterleaving*, not scheduling. We use it only as an environment/validation source. `JC Wise, Radar Emitter Database` (radars.org.uk) is used, if accessible, only to sanity-check emitter parameter distributions.

---

## Repository layout

```
primes/
  env/         emitter.py  receiver.py  scenario.py  truth.py  gym_env.py
  predict/     hypotheses.py  period_lattice.py  censored_bayes.py  calibration.py
  index/       whittle.py  mp_index.py  info_gain.py  dither.py
  policies/    baselines.py  myopic.py  thompson.py  primes.py  residual_rl.py
  eval/        metrics.py  replay.py  bootstrap.py  plots.py
  data/        turing_loader.py  to_truth_tensor.py
configs/       scenario_*.yaml  policy_*.yaml  experiment_*.yaml
experiments/   run_sweep.py  ablations.py
tests/
reports/       report.md  figures/
```

Stack: Python 3.11, NumPy + Numba (hot loops), Gymnasium, Stable-Baselines3 (+ Ray RLlib for sweeps on cloud GPU), PyArrow/Polars for PDW ingest, Hydra for configs, pytest, matplotlib. Study `github.com/vtnsi/rfrl-gym` (MIT) for env-design patterns but do **not** depend on it — it does not model a partial-band scanning ES receiver.

---

## Build phases

**Phase 1 — Environment & truth (`primes/env/`)**
Emitter/receiver/scenario models above; deterministic seeding; truth-tensor export; Gymnasium wrapper with observation = (last-look results per band, time-since-look per band, hit counts, slot phase) and action = band index. Scenario YAMLs: `easy` (few periodic emitters), `agile` (frequency-hopping), `adversarial` (periods chosen to lock-out a raster sweep), `dense` (dataset-matched, ~90 emitters).

**Phase 2 — Baselines & metrics (`policies/baselines.py`, `eval/`)**
Raster sweep, random, Farey/Clarkson-optimised periodic, jittered periodic, round-robin-with-priority, myopic-greedy on Gilbert–Elliott belief, Thompson sampling, and a **clairvoyant oracle** (upper bound, sees the truth tensor). Metrics module implementing every figure of merit — see below. Bootstrap CIs, multi-seed. **Gate: replay harness reproduces each baseline's metrics deterministically.**

**Phase 3 — Predict layer (`primes/predict/`)**
Hypothesis bank with censored-evidence likelihoods; lattice line-search ML period estimation over sparse censored look times; sequential Bayesian model selection; posterior predictive `p_b(t)` with uncertainty; reliability-diagram calibration. **Gate: on `easy`, recovers scan periods within tolerance from < 1 % duty-cycle observation, and its predictions are calibrated.**

**Phase 4 — Index layer (`primes/index/`)**
Whittle/MP index over the predictive process with imperfect binary feedback; indexability check; information-gain bonus with a scheduled λ; anti-synchronisation dither with a commensurability assertion. **Gate: with λ=0 and γ→0 it provably reduces to the myopic policy (unit-tested); it beats every Phase-2 baseline on `easy`, `agile`, and — decisively — `adversarial`.**

**Phase 5 — Learn layer (`policies/residual_rl.py`)**
GRU residual policy trained with PPO (and a NeurWIN-style learned index head) on randomised scenarios; shield that clamps the combined policy to the analytic index's guarantee. Also implement the **Double-DQN scheduler from the IEEE state of the art** as the ML comparator. Cloud-GPU sweeps over seeds and scenario families. **Gate: shielded PRIMES ≥ analytic PRIMES on every scenario; PRIMES > Double-DQN with non-overlapping bootstrap CIs; PRIMES generalises to held-out scenario families where Double-DQN degrades.**

**Phase 6 — Dataset validation (`primes/data/`)**
Ingest a Turing Stare-Mode subset → truth tensors; replay all policies. Cross-validate our receiver model by replaying a raster sweep matched to the dataset's Scan-Mode configuration and checking our predicted hit statistics against the dataset's actual Scan-Mode PDW record. **Gate: our simulated open-loop sweep reproduces the dataset's independent scan-mode intercept statistics within CI — this validates the receiver model against a third-party simulator.**

**Phase 7 — Ablations & report (`experiments/`, `reports/`)**
Ablate each layer (predict-only, index-only, no info-gain, no dither, no shield) to attribute the gain. Sweep sensitivity, P_fa, band count, emitter density, agility rate. Sections on *"approaches to intercept a periodic scan receiver optimally"* — the analytic Farey/Diophantine treatment set against what PRIMES learns, showing whether the learned policy rediscovers the number-theoretic optimum. Report maps 1:1 to the problem statement.

---

## Figures of merit (`primes/eval/metrics.py`)

Every metric the statement names, plus the ones needed to defend the result:

- **Probability of detection / false alarm**, as functions of sensitivity and dwell (ROC per scenario).
- **Sensitivity** — swept parameter; performance-vs-sensitivity curves.
- **Average intercept rate** and **interception ratio** (fraction of emitter-active slots intercepted).
- **Time to first intercept** per emitter — mean, median, **95th percentile and worst case** (the tail is what lock-out shows up in).
- **Average reward / cost** under a configurable threat-weighted cost function.
- **Percentage of correct predictions** — accuracy of the Predict layer's next-transmission calls.
- **Average intercept time error** — |predicted − actual| next-transmission time.
- **Regret vs. clairvoyant oracle**, and **coverage fairness** across emitters (so a policy cannot win by farming one loud emitter).
- **New-emitter latency** — slots from an emitter first appearing to first intercept. Directly answers the statement's complaint that open-loop "loses time to non-threatening emitters".

---

## Verification

1. **Analytic cross-check** — for a single periodic emitter and a periodic sweep, the simulator's measured intercept-time statistics must match the closed-form results (Self 1985; Clarkson's synchronisation ratios). Unit test.
2. **Lock-out reproduction** — construct a scenario where a raster sweep provably never intercepts; assert raster TTFI = ∞ and PRIMES TTFI is finite. Unit test.
3. **Replay determinism** — same policy + same truth tensor + same seed ⇒ bit-identical metrics.
4. **Reduction tests** — index layer with λ=0, γ→0 equals myopic; shield never underperforms the analytic policy on any seed.
5. **Calibration** — Predict layer reliability diagrams; Brier score against truth.
6. **External validation** — Phase 6 gate: our open-loop sweep reproduces the Turing Scan-Mode intercept statistics.
7. **Statistical rigour** — every headline number over ≥ 30 seeds with bootstrap CIs; no claim made on overlapping intervals.
8. **End-to-end** — `python experiments/run_sweep.py --config configs/experiment_full.yaml` regenerates every figure in `reports/` from scratch.

---

## Risks

- **Dataset is gated and 70 GB.** Needs HF access acceptance; we pull a subset. Mitigated by simulator-first ordering — Phases 1–5 do not block on it.
- **It is a deinterleaving dataset, not a scheduling one.** Handled explicitly: used as an environment/validation source only, and stated as such in the report.
- **Whittle indexability may fail** for some predictive processes. Mitigation: numerical indexability check per configuration; fall back to the MP-index (PCL) formulation, which is exactly the framework built for imperfect binary feedback.
- **Residual RL could overfit** to simulated scenario families. Mitigation: held-out scenario families, domain randomisation, and the shield bounds the downside.

## Open items for later (not blocking)

- Multi-receiver / cooperative scheduling (multi-agent extension).
- Real-time latency benchmarking and an ONNX inference path — deferred per the research-grade decision, but the index layer is already O(N log N) and would port cleanly.

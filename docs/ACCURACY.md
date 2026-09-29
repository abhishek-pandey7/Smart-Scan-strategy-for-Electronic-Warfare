# Understanding Ekalavya accuracy

_Why the numbers are 60–80 % and not 100 %, where the missing points go, and what can recover them._

## 1. What the headline number measures

**Interception ratio** is the share of *every* radar beam flash in the engagement window (30 s real, 60 s simulated) that the receiver actually caught. A flash counts as interceptable if it carries at least 3 pulses and falls inside some receiver centre's band.

It is **not** "percent of decisions correct". The receiver hears about 1 GHz of an 18 GHz spectrum at a time, so at any instant most flashes happen where it is not listening. 100 % would require being on the right band at the right millisecond for every flash of every radar, including radars it has not found yet.

## 2. The scale that matters

610-run benchmark: 10 seeds per simulated family plus 11 real dataset scenarios, with 95 % bootstrap CIs.

| Scenario | Raster (current practice) | **Ekalavya** | Clairvoyant oracle | Ekalavya / oracle | Ekalavya / raster |
|---|---|---|---|---|---|
| lockout | 1.0 % | **69.1 %** | 98.3 % | 0.70 | 69× |
| easy | 5.6 % | **72.3 %** | 96.1 % | 0.75 | 13× |
| popup | 5.8 % | **61.6 %** | 97.6 % | 0.63 | 11× |
| dense (40 emitters) | 9.9 % | **65.9 %** | 89.9 % | 0.73 | 6.7× |
| mixed | 14.1 % | **78.8 %** | 94.3 % | 0.84 | 5.6× |
| **real Turing scenarios** | 16.8 % | **69.8 %** | 84.8 % | **0.82** | 4.2× |

- **The oracle is not an achievable target.** It is handed the truth, including the future, and still misses 2–15 % because flashes on different bands overlap in time.
- **The honest comparison is Ekalavya vs the oracle (0.63–0.84) and vs today's open-loop sweep (4–69×).**

## 3. Where Ekalavya loses its points

Every flash is exactly one of: caught, **lost before discovery** (the emitter had not been found yet), or **missed while tracking** (the emitter was known but the receiver was elsewhere). The three shares add to 100 % per run (served by `/api/accuracy`, shown on the web Accuracy page):

| Scenario | Ekalavya caught | Lost before discovery | Missed while tracking | Oracle: missed while tracking | Ekalavya caught once tracked |
|---|---|---|---|---|---|
| lockout | 69 % | 25 % | 6 % | 2 % | 91 % |
| easy | 72 % | 24 % | 4 % | 4 % | 95 % |
| popup | 62 % | 36 % | 2 % | 2 % | 96 % |
| dense | 66 % | 22 % | 12 % | 10 % | 85 % |
| mixed | 79 % | 11 % | 10 % | 6 % | 89 % |
| **real Turing** | **70 %** | **6 %** | **25 %** | 15 % | 74 % |

"Missed while tracking" = (1 − caught-once-tracked rate) × share of flashes from the first catch onwards. The first catch of each emitter is counted as caught, not as lost.

### 3.1 Loss before discovery (the biggest part on simulated scenarios)

A flash from an emitter nobody has detected yet can only be caught by luck: there is no information about where or when it will be. The oracle loses almost nothing here (0–1.5 %) only because it already knows every emitter.

On a single narrowband receiver this is largely a **physical limit, not a tuning failure**. Pop-up has the largest share (36 %) because four emitters appear mid-engagement and must be found from scratch.

### 3.2 Loss while tracking (the real room for improvement on real data)

Once found, simulated rotating scanners are caught 85–96 % of the time, within a few points of the oracle. Real Turing emitters are caught 74 % vs the oracle's 85 %. That 11-point gap has a cause: only 12 % of real emitters behave like neat periodic scanners. Most are visible intermittently for seconds at a time (median 32 % visibility duty; `DATASET_NOTES.md`). Ekalavya models those with an on/off belief that predicts less sharply than a flash timetable.

## 4. How accuracy holds up under realistic conditions

| Condition | Ekalavya (all 36 scenarios) | Ekalavya / oracle |
|---|---|---|
| nominal | 69.0 % | 0.75 |
| missed detections, P_d = 0.7 | 55.5 % | 0.72 |
| missed detections, P_d = 0.5 | 44.4 % | 0.67 |
| ~23 false alarms per run | 66.8 % | 0.73 |
| ~70 false alarms per run (stress) | 58.4 % | 0.64 |
| own deinterleaving from unlabelled pulses (tuning scenarios) | −0.8 points vs labelled | — |

Missed detections lower the oracle too (half of all flashes are unobservable at P_d = 0.5). Ekalavya's share of the achievable stays at 0.67–0.75.

Note: the association comparison uses 3 tuning scenarios per family (disjoint from the benchmark). Its absolute values (e.g. easy 64.8 %) must not be compared with the benchmark table; only the labelled-vs-unlabelled difference is meaningful.

## 5. What can raise the numbers

| Lever | Attacks | Expected effect | Roadmap item |
|---|---|---|---|
| **Wideband cue** (coarse wideband detector points the narrowband receiver) | loss before discovery: 6–36 % | largest: emitters found in seconds instead of by sweeping | 7 |
| **Second receiver** (coordinated scheduling) | both phases | roughly halves search time; more tracking capacity | 7 |
| **Joint parameter tuning** on tuning scenarios (w_new, staleness, λ) | balance between search and tracking | a few points, evenly spread | 8 |
| **Look-ahead planning** (plan several dwells, not one) | tracking loss on intermittent real emitters (74 % vs 85 %) | closes part of the 11-point real-data gap | 9 |
| **Residual RL with shield** | model mismatch on real emitters | learned corrections without ever falling below Ekalavya | 10 |

What will **not** raise the numbers, measured and rejected: frequency-seeded search, faster revisits of intermittent emitters, plain shorter dwells, per-dwell calibration, and threat or existence weighting as defaults (`PROGRESS.md`).

## 6. Reproduce

```bash
python -m experiments.benchmark --seeds 10       # sections 2 and 3: artifacts/benchmark.json (tracked_ratio, pre_discovery_loss)
python -m experiments.robustness --seeds 5       # section 4: artifacts/robustness.json
python -m experiments.compare_variants --variants base pdw --seeds 3   # association comparison
```

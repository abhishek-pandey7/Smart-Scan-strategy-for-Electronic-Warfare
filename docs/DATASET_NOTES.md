# Turing Synthetic Radar Dataset — verified notes

Everything below was verified by running `scripts/inspect_turing_dataset.py`. The receiver-model numbers cover all 250 `val_scan` files (22.7 M pulses). Structural facts were checked in detail on `config_192` (stare and scan pair).

## Layout

```
archive/{train,validation,test}/*.h5    3.5 / 0.37 / 0.36 GB   (older release)
scan/{train_scan,val_scan,test_scan}/config_N.h5    4.94 / 0.48 / 0.57 GB
stare/{train_stare,val_stare,test_stare}/config_N.h5  49.2 / 4.9 / 5.7 GB
```

- Each split has 250 or 2,500 configs. `missing.txt` (spelled `mising.txt` in `train_scan`) holds a number only.
- `config_N` in `stare/` and `scan/` describes **the same scenario**. Transmitter functions and start positions match.
- Both HF repo IDs (`turing-synthetic-radar-dataset`, `turing-deinterleaving-challenge`) point to the same files.

## HDF5 schema

| Path | Shape / type | Meaning |
|---|---|---|
| `data` | `(N, 5) float32` | `ToA` (µs), `Frequency` (MHz), `PulseWidth` (µs), `AoA` (deg), `Amplitude` (dB) |
| `labels` | `(N, 1) int8` | emitter index → `metadata/transmitters/transmitters_<k>` |
| `metadata` attrs | | `collection_time_s=30`, `num_pulses`, … |
| `metadata/receiver` attrs | | `scan_mode` (`Stare`/`Scanning`), `bandwith_mhz=500` (sic), `sensitivity_dbm=-110`, noise scales, position |
| `metadata/receiver/dwell_centres_mhz`, `dwell_times_s` | `(36,)` scan, `(0,)` stare | sweep schedule |
| `metadata/transmitters/transmitters_k` | group | `function` (radar name), plus `frequency_config`, `pri_config`, `pulse_width_config`, `scan_config`, `power_config`, `position_config` |

## Scan-mode receiver model (reverse-engineered)

- **Schedule:** the same in every file. 36 dwell centres at 250, 750, …, 17750 MHz, dwell times of 0.05 or 0.10 s, **2.15 s cycle** starting at t = 0 and repeating for 30 s.
- **Acceptance:** a pulse is received iff `|f − dwell_centre| ≤ 500 MHz`. That is 1 GHz effective width, so **adjacent dwells overlap by 50 %**. This model explains **99.987 %** of scan pulses (worst file 99.93 %). A ±250 MHz window explains only ~52 %, so the `bandwith_mhz=500` attribute is the half-width, not the full width.
- **Independent realisations:** scan files are *not* filtered subsets of stare files. In `config_192`, only 40 % of one emitter's scan pulses have a stare pulse within 50 µs, and another emitter has more pulses in scan than in stare. Validate against the dataset statistically, never pulse-by-pulse.
- **Stray ToAs:** a few pulses have ToA > 30 s (333 in `val_scan`; 1.9 % of pulses in one stare file). Clip to `[0, 30]` s.

## Emitter population (`val_scan`: 250 scenarios, 12,512 emitters)

| Quantity | min | p10 | median | p90 | max |
|---|---|---|---|---|---|
| Emitters per scenario | 1 | 12 | 51 | 89 | 100 |
| Circular scan period (s) | 0.5 | 1 | 4 | 15 | 600 |
| Beamwidth (deg) | 0.2 | 0.3 | 1.5 | 2.5 | 4.5 |
| Illumination per scan (ms) | 0.33 | 1.25 | 13.9 | 41.7 | 5000 |
| 500 MHz sub-bands per emitter | 1 | 1 | 1 | 2 | 3 |

- **Scan type:** Circular 96 %, Omni 4 %.
- **Frequency:** FixedSingle 52 %, FixedMultiSimultaneous 12 %, HoppingSawtooth 11 %, RandomRange 11 %, HoppingLinear 10 %, RandomFixed 5 %.
- **PRI:** Fixed 39 %, Staggered 27 %, SwitchDwell 19 %, Jittered 13 %, Sliding 2 %.
- **Detection (metadata view):** beamwidth × period gives a main-beam illumination of ~14 ms every ~4 s for the median emitter. **The observed pulses tell a different story** — see "Measured visibility" below.
- **Open-loop scan coverage:** in the median scenario, 74 % of listed emitters produce at least one scan-mode pulse (p10 67 %, min 47 %). *Caveat:* the denominator includes emitters invisible even to the stare receiver. The true open-loop miss rate needs the paired stare files.

## Open-loop raster performance on stare truth (measured)

The exact Turing raster schedule was replayed against stare-mode truth for 11 `val_stare` scenarios: `config_192` plus 10 random configs with a fixed seed (3, 8, 17, 40, 62, 71, 122, 151, 202, 203).

- **Flash definition:** an emitter's pulses split at gaps > 50 ms.
- **Interception rule:** ≥ 3 of the flash's pulses received within one dwell.
- **Coverage:** every frequency is covered by 2–3 overlapping dwells, giving **50–200 ms of dwell per 2.15 s cycle** (median 100 ms).

| Measure | Value |
|---|---|
| All flashes intercepted (10 random scenarios, pooled) | **11.5 %** (1,264 / 11,038); range 6.6–20.9 % per scenario |
| Narrow flashes (< 50 ms) with ≥ 3 pulses, intercepted (11 scenarios) | **6.3 %**, consistent with the analytic (100 + 14) / 2150 ≈ 5.3 % to 7.6 % |
| Narrow flashes (< 50 ms), ≥ 1-pulse rule | 8.1 % |
| Narrow flashes that contain ≥ 3 pulses at all | only 19.6 %; the median narrow flash has 1 pulse |

**Implication for metrics:** use *interceptable* flashes as the denominator (flashes with ≥ `n_min` pulses in truth), otherwise 1–2-pulse fragments dominate and deflate every policy's score.

## Measured visibility in stare-mode truth (11 scenarios, 431 emitters)

Splitting each emitter's stare-mode pulses into illuminations (gaps > 50 ms, ≥ 3 pulses) and summing their durations over the 30 s window:

| Visibility duty cycle | min | p10 | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|---|---|
| fraction of the window an emitter is receivable | 0.00 | 0.03 | 0.12 | **0.32** | 0.63 | 0.83 | 0.99 |

- Only **12 %** of emitters are *flash-like* (visible < 5 % of the time). The rest are visible for long, irregular stretches (sidelobes, moving platforms, wide beams, multi-second illuminations).
- Among flash-like emitters, illumination gaps are almost never clean multiples of the metadata scan period (1 of 53). Real visibility is **intermittent, not cleanly periodic**.
- Consequence: a purely periodic-flash predictor is the wrong single model for this data. PRIMES therefore runs a **periodic model and a Gilbert–Elliott on/off model per emitter** and lets hits and misses decide between them, and it **learns online how visible undiscovered emitters are** (the κ factor) instead of trusting the metadata-derived flash prior.

## Learned priors (`train_scan`, 2,500 scenarios, 128,252 emitters)

Fitted by streaming per-transmitter metadata over the HF API (`primes/data/fit_priors.py`, ~10 min, no download):

- **96.2 % of circular scan periods fall on 22 discrete values.** Top: 2 s (12.3 %), 10 s (10.7 %), 1 s (10.7 %), 4 s (10.6 %), 5 s (7.7 %), 2.5 s (6.1 %), 6 s (4.6 %), 3 s (4.5 %).
- Within the 0.5–30 s range that matters for a 30–60 s engagement, 19 discrete periods carry 96.3 % of the mass. After a **single** catch, PRIMES therefore only has to test ~19 candidate return times, and one more hit or a few misses usually settle it.
- Omni fraction 3.6 %; frequency-mode and PRI distributions match the validation split above.

## Radar types and threat labels

The metadata names each emitter's radar type (`function`): **68 types**, e.g. AN/APG-81 F-35 Fire Control, Patriot AN/MPQ-53, NEXRAD weather radar, Furuno marine navigation radar. We assigned each type an analyst threat level in `primes/assets/threat_taxonomy.json`: **high** (22 types: fire control, engagement and multifunction air/missile defence), **medium** (33: surveillance, early warning, patrol, weapon locating), **low** (13: civil, weather, navigation, scientific). Used only as ground truth for training and scoring, never by the scheduler.

**Each type has one fixed parameter template.** Across 128,252 training emitters the median type has exactly 1 distinct frequency set, 1 PRI set, 1 pulse-width set and 1 scan rate (a few types vary one parameter, e.g. AN/FPS-132 uses 31 frequency sets). Consequences:

- Identifying a *known* type from observed parameters is a library lookup, exactly as in operational ESM emitter libraries. A gradient-boosted classifier on observable features (frequency, PRI set, PW set, scan period, flash width, with measurement noise and partial observation) reaches **100 %** on the validation split. That number is expected, not impressive.
- The meaningful test is **leave-one-radar-type-out**: predict the threat level of a type the model has never seen from its parameters alone. Result: **63 % three-way accuracy vs 48.5 % chance**, recall 0.65 / 0.62 / 0.64 for low / medium / high, and the *priority weight* it assigns is correctly ordered on average (low 1.04, medium 1.54, high 2.26 on a 0.3 / 1 / 3 scale). So for unseen radars the model is a directionally correct prior, not an identifier. Hardest cases are naval/ground surveillance radars that share parameter ranges with fire-control sets.

## Design implications for PRIMES

1. **Two visibility regimes.** Flash-like emitters (12 %) reward learning period and phase and placing *short, well-timed* dwells. The majority are intermittently visible for seconds at a time; for those the question is "is it on right now?", answered by an on/off Markov belief that decays between looks.
2. **Learning must succeed from 2–3 observations.** With ~19 discrete period candidates from the learned prior and interval-censored misses, a periodic emitter is usually pinned down by its second or third catch. That favours an explicit Bayesian predictor over model-free DRL, which is sample-hungry.
3. **Long-period tail.** Periods of 15–600 s flash at most twice in the window, so period learning is impossible there. The hypothesis bank must fall back to a search prior, and metrics must be stratified by period relative to the window.
4. **Correlated arms.** Overlapping dwells share coverage, so selection should maximise marginal coverage gain (a submodular problem), not use independent restless-bandit arms.
5. **Time resolution.** Flashes can be as short as 0.33 ms (p10 1.25 ms). Replay therefore runs at pulse level, and the learning tensor uses ≤ 1 ms slots.
6. **Hopping emitters** span up to 3 sub-bands (p90: 2). Band belief should be shared across the sub-bands an emitter has been seen in.

## Download plan (disk: ~71 GB free on E:)

| Split | Size | Purpose | Status |
|---|---|---|---|
| `val_scan` | 0.48 GB | receiver model, population stats | downloaded |
| `val_stare` | 4.9 GB | ground truth for development evaluation | 11 files fetched on demand |
| `train_scan` | 4.9 GB | emitter-parameter priors | streamed via HF API, nothing stored |
| `test_scan` + `test_stare` | 6.3 GB | held-out final results | pending |
| `train_stare` | 49 GB | not needed; we train on the simulator | skip |

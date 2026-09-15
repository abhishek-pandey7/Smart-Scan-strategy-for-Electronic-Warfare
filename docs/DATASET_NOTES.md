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
- **Detection:** only pulses from the main beam reach the receiver (sidelobes are not modelled or fall below sensitivity). An emitter is therefore visible only as a short **flash** once per scan period.
- **Open-loop scan coverage:** in the median scenario, 74 % of listed emitters produce at least one scan-mode pulse (p10 67 %, min 47 %). *Caveat:* the denominator includes emitters invisible even to the stare receiver. The true open-loop miss rate needs the paired stare files.

## Design implications for PRIMES

1. **The problem is flash interception.** The median emitter gives a ~14 ms flash every ~4 s. The open-loop sweep dwells 50–100 ms per band on a 2.15 s cycle. A scheduler that learns period and phase can place *short, well-timed* dwells and spend the time saved on search. That is the Predict layer's reason to exist.
2. **Learning must succeed from 2–3 flashes.** A 30 s window with a median 4 s period gives about 7 flashes per emitter, and the first few must be enough. That favours a Bayesian periodic-hypothesis predictor over model-free DRL, which is sample-hungry.
3. **Long-period tail.** Periods of 15–600 s flash at most twice in the window, so period learning is impossible there. The hypothesis bank must fall back to a search prior, and metrics must be stratified by period relative to the window.
4. **Correlated arms.** Overlapping dwells share coverage, so selection should maximise marginal coverage gain (a submodular problem), not use independent restless-bandit arms.
5. **Time resolution.** Flashes can be as short as 0.33 ms (p10 1.25 ms). Replay therefore runs at pulse level, and the learning tensor uses ≤ 1 ms slots.
6. **Hopping emitters** span up to 3 sub-bands (p90: 2). Band belief should be shared across the sub-bands an emitter has been seen in.

## Download plan (disk: ~71 GB free on E:)

| Split | Size | Purpose | Status |
|---|---|---|---|
| `val_scan` | 0.48 GB | receiver model, population stats | downloaded |
| `val_stare` | 4.9 GB | ground truth for development evaluation | pending |
| `train_scan` | 4.9 GB | emitter-parameter priors for the simulator (metadata only) | pending |
| `test_scan` + `test_stare` | 6.3 GB | held-out final results | pending |
| `train_stare` | 49 GB | not needed; we train on the simulator | skip |

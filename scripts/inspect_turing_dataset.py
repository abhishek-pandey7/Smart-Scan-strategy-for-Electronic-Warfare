"""Inspect the Turing Synthetic Radar Dataset and verify our reading of its receiver model.

Checks, over every scan-mode file in a split:
  1. Every file uses the same dwell schedule (centres + dwell times).
  2. Scan-mode pulses are explained by a repeating dwell cycle starting at t=0
     with acceptance |f - dwell_centre| <= ACCEPT_HALF_WIDTH_MHZ.
  3. Emitter parameter distributions (scan period, beamwidth, illumination time,
     frequency / PRI modes) taken from the per-transmitter metadata.

Usage:
    python scripts/inspect_turing_dataset.py --split val_scan
    python scripts/inspect_turing_dataset.py --split val_scan --download
"""

from __future__ import annotations

import argparse
import collections
import glob
import os

import h5py
import numpy as np

REPO_ID = "alan-turing-institute/turing-synthetic-radar-dataset"
ACCEPT_HALF_WIDTH_MHZ = 500.0
COLLECTION_TIME_S = 30.0


def dwell_index(toa_s: np.ndarray, dwell_times_s: np.ndarray) -> np.ndarray:
    """Index of the dwell active at each time, for a schedule repeating from t=0."""
    edges = np.concatenate([[0.0], np.cumsum(dwell_times_s)])
    return np.searchsorted(edges, np.mod(toa_s, edges[-1]), side="right") - 1


def quantiles(a) -> np.ndarray:
    return np.round(np.quantile(np.asarray(a, dtype=float), [0, 0.1, 0.5, 0.9, 1]), 4)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="data/raw")
    ap.add_argument("--split", default="val_scan", help="e.g. val_scan, test_scan, train_scan")
    ap.add_argument("--download", action="store_true", help="fetch the split from Hugging Face first")
    args = ap.parse_args()

    mode = args.split.split("_")[-1]  # scan | stare
    if args.download:
        from huggingface_hub import snapshot_download

        snapshot_download(REPO_ID, repo_type="dataset", local_dir=args.root,
                          allow_patterns=[f"{mode}/{args.split}/*"], max_workers=8)

    files = sorted(glob.glob(os.path.join(args.root, mode, args.split, "config_*.h5")))
    if not files:
        raise SystemExit(f"no files under {args.root}/{mode}/{args.split} (use --download)")

    schedules = set()
    n_pulses = n_explained = n_late = 0
    n_emitters, seen_frac = [], []
    periods, beams, illum_ms, subbands = [], [], [], []
    modes = collections.defaultdict(collections.Counter)

    for fp in files:
        with h5py.File(fp, "r") as f:
            data = f["data"][:]
            labels = f["labels"][:, 0]
            rx = f["metadata/receiver"]
            txs = f["metadata/transmitters"]

            n_emitters.append(len(txs))
            seen_frac.append(len(np.unique(labels)) / max(len(txs), 1))

            dwell_t = rx["dwell_times_s"][()].astype(float)
            centres = rx["dwell_centres_mhz"][()].astype(float)
            schedules.add((tuple(np.round(dwell_t, 4)), tuple(centres)))

            if len(data) and len(dwell_t):
                toa = data[:, 0] * 1e-6
                idx = dwell_index(toa, dwell_t)
                n_pulses += len(data)
                n_explained += int(np.sum(np.abs(data[:, 1] - centres[idx]) <= ACCEPT_HALF_WIDTH_MHZ))
                n_late += int(np.sum(toa > COLLECTION_TIME_S))

            for name in txs:
                tx = txs[name]
                scan = tx["scan_config"].attrs
                modes["scan_type"][scan["scan_type"]] += 1
                modes["freq_mode"][tx["frequency_config"].attrs["freq_mode"]] += 1
                modes["pri_mode"][tx["pri_config"].attrs["pri_mode"]] += 1
                freqs = tx["frequency_config"]["freqs_mhz"][()]
                subbands.append(len(np.unique((freqs // 500).astype(int))))
                if scan["scan_type"] == "Circular" and scan["scan_rate_rpm"] > 0:
                    period = 60.0 / scan["scan_rate_rpm"]
                    periods.append(period)
                    beams.append(scan["beam_width_deg"])
                    illum_ms.append(1e3 * period * scan["beam_width_deg"] / 360.0)

    print(f"split {args.split}: {len(files)} files")
    print(f"emitters per scenario q[0,.1,.5,.9,1]: {quantiles(n_emitters)}")
    print(f"fraction of emitters with >=1 pulse in this file, q: {quantiles(seen_frac)}")
    print(f"distinct receiver schedules: {len(schedules)}")
    if n_pulses:
        cycle = sum(next(iter(schedules))[0])
        print(f"dwell cycle {cycle:.3f} s, {len(next(iter(schedules))[0])} dwells")
        print(f"pulses explained by (cycle from t=0, |f-centre|<={ACCEPT_HALF_WIDTH_MHZ:.0f} MHz): "
              f"{n_explained / n_pulses:.4%} of {n_pulses}")
    print(f"pulses with ToA > {COLLECTION_TIME_S:.0f} s: {n_late}")
    for key, counter in modes.items():
        print(f"{key}: {dict(counter.most_common())}")
    print(f"circular scan period (s) q: {quantiles(periods)}")
    print(f"beamwidth (deg) q: {quantiles(beams)}")
    print(f"illumination per scan (ms) q: {quantiles(illum_ms)}")
    print(f"distinct 500 MHz sub-bands per emitter q: {quantiles(subbands)}")


if __name__ == "__main__":
    main()

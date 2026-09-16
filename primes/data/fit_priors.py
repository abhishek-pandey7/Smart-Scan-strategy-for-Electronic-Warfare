"""Fit emitter-population priors from Turing dataset metadata, streamed over the HF API.

Each small scan-mode file (~2 MB) is fetched into memory, its per-transmitter
metadata is extracted, and nothing is written to disk. The output serves two consumers:

* the simulator samples realistic emitters from the empirical population;
* PRIMES uses the population as a learned prior over scan period and flash width.

Usage:
    python -m primes.data.fit_priors --split train_scan --limit 2500 --workers 8
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

REPO = "datasets/alan-turing-institute/turing-synthetic-radar-dataset"
OUT_DIR = Path(__file__).resolve().parents[1] / "assets"

FREQ_MODES = ["FixedSingle", "FixedMultiSimultaneous", "HoppingLinear",
              "HoppingSawtooth", "RandomRange", "RandomFixed"]


def _read_config(path: str) -> tuple[str, list[dict]]:
    import io

    import h5py
    from huggingface_hub import HfFileSystem

    # One GET for the whole (small, ~2 MB) scan file into memory. HDF5 metadata is scattered,
    # so byte-range streaming turns into many tiny requests and is far slower.
    blob = HfFileSystem().cat_file(path)
    rows = []
    with h5py.File(io.BytesIO(blob), "r") as f:
        for name in f["metadata/transmitters"]:
            tx = f["metadata/transmitters"][name]
            scan = tx["scan_config"].attrs
            freq = tx["frequency_config"]
            pri, pw = tx["pri_config"], tx["pulse_width_config"]
            rows.append({
                "function": str(tx.attrs.get("function", "")),
                "scan_type": str(scan["scan_type"]),
                "rpm": float(scan["scan_rate_rpm"]),
                "beamwidth_deg": float(scan["beam_width_deg"]),
                "freq_mode": str(freq.attrs["freq_mode"]),
                "freqs_mhz": [float(x) for x in freq["freqs_mhz"][()]],
                "pri_s": float(np.median(pri["pris_us"][()])) * 1e-6,
                "pri_mode": str(pri.attrs.get("pri_mode", "")),
                "pris_us": [round(float(x), 4) for x in pri["pris_us"][()]],
                "pw_mode": str(pw.attrs.get("pw_mode", "")),
                "pws_us": [round(float(x), 5) for x in pw["pws_us"][()]],
            })
    return path, rows


def _subsample(items: list, n: int, seed: int = 0) -> list:
    if len(items) <= n:
        return items
    idx = np.sort(np.random.default_rng(seed).choice(len(items), n, replace=False))
    return [items[i] for i in idx]


def fit(split: str, limit: int, workers: int, max_samples: int = 10_000,
        population_out: str | None = None) -> dict:
    from huggingface_hub import HfFileSystem

    mode = split.split("_")[-1]
    paths = sorted(p for p in HfFileSystem().ls(f"{REPO}/{mode}/{split}", detail=False)
                   if p.endswith(".h5"))[:limit]

    by_path: dict[str, list[dict]] = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_read_config, p): p for p in paths}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                path, rows = fut.result()
                by_path[path] = rows
            except Exception as exc:  # a single unreadable file should not abort the fit
                print(f"skip {futures[fut]}: {exc}")
            if i % 100 == 0:
                print(f"{i}/{len(paths)} configs")

    # deterministic order regardless of completion order, so subsampling is reproducible
    scenarios = [by_path[p] for p in sorted(by_path)]
    emitters = [e for sc in scenarios for e in sc]
    if population_out:
        Path(population_out).parent.mkdir(parents=True, exist_ok=True)
        with open(population_out, "w") as fh:
            json.dump([{**e, "scenario": i} for i, sc in enumerate(scenarios) for e in sc], fh, separators=(",", ":"))
    circ = [e for e in emitters if e["scan_type"] == "Circular" and e["rpm"] > 0]
    period = np.array([60.0 / e["rpm"] for e in circ])
    flash = np.array([60.0 / e["rpm"] * e["beamwidth_deg"] / 360.0 for e in circ])
    pri = np.array([e["pri_s"] for e in circ])

    # Discrete part of the period prior: rpm values shared by many emitters.
    rpm_vals, rpm_counts = np.unique(np.round([e["rpm"] for e in circ], 4), return_counts=True)
    order = np.argsort(-rpm_counts)
    discrete = [{"rpm": float(rpm_vals[i]), "period_s": 60.0 / float(rpm_vals[i]),
                 "p": float(rpm_counts[i] / len(circ))}
                for i in order if rpm_counts[i] / len(circ) >= 0.005]

    return {
        "source": f"{REPO}/{mode}/{split}",
        "n_scenarios": len(scenarios),
        "n_emitters": len(emitters),
        "emitters_per_scenario": [len(sc) for sc in scenarios],
        "omni_fraction": float(np.mean([e["scan_type"] == "Omni" for e in emitters])),
        "freq_mode_probs": {m: float(np.mean([e["freq_mode"] == m for e in emitters])) for m in FREQ_MODES},
        "period_discrete": discrete,
        "period_discrete_mass": float(sum(d["p"] for d in discrete)),
        "quantiles": {
            "period_s": np.quantile(period, [0, .1, .25, .5, .75, .9, 1]).round(4).tolist(),
            "flash_s": np.quantile(flash, [0, .1, .25, .5, .75, .9, 1]).round(6).tolist(),
            "pri_s": np.quantile(pri, [0, .1, .25, .5, .75, .9, 1]).round(7).tolist(),
        },
        # Joint samples keep the correlation between period, beamwidth, PRI and frequency.
        "samples": [{"period_s": round(60.0 / e["rpm"], 5),
                     "beamwidth_deg": e["beamwidth_deg"],
                     "pri_s": round(e["pri_s"], 8),
                     "freq_mode": e["freq_mode"],
                     "freqs_mhz": e["freqs_mhz"],
                     "function": e["function"],
                     "pri_mode": e["pri_mode"], "pris_us": e["pris_us"],
                     "pw_mode": e["pw_mode"], "pws_us": e["pws_us"]}
                    for e in _subsample(circ, max_samples)],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="train_scan")
    ap.add_argument("--limit", type=int, default=2500)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--max-samples", type=int, default=10_000)
    ap.add_argument("--out", default=str(OUT_DIR / "priors.json"))
    ap.add_argument("--population-out", default=None,
                    help="also write every emitter's metadata (for threat-model training), e.g. artifacts/population_train_scan.json")
    args = ap.parse_args()

    priors = fit(args.split, args.limit, args.workers, args.max_samples, args.population_out)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(priors, fh, separators=(",", ":"))
    print(f"wrote {args.out}: {priors['n_scenarios']} scenarios, {priors['n_emitters']} emitters, "
          f"discrete period mass {priors['period_discrete_mass']:.1%} over {len(priors['period_discrete'])} values")


if __name__ == "__main__":
    main()

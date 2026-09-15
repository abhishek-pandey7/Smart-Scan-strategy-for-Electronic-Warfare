"""Compare PRIMES variants on tuning scenarios that are disjoint from the benchmark.

Simulated families use training seeds (10_000+); Turing uses val_stare configs 5, 50, 100, which
are not in the benchmark set. Results are appended to artifacts/variants.jsonl as they finish.

    python -m experiments.compare_variants --variants base short5
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "artifacts" / "variants.jsonl"
FAMILIES = ["easy", "lockout", "popup", "dense", "mixed"]
TURING_TUNE = [5, 50, 100]

VARIANTS = {
    "base": {},
    "short5": {"dwells_s": (0.005, 0.010, 0.025, 0.050, 0.100), "retune_s": 0.0005},
    "short5_noretune": {"dwells_s": (0.005, 0.010, 0.025, 0.050, 0.100)},
    "short3": {"dwells_s": (0.003, 0.005, 0.010, 0.025, 0.050, 0.100), "retune_s": 0.0005},
    # retune time charged in simulated time for all of these; the score is not biased by it
    "base_rt": {"retune_s": 0.0005, "retune_in_index": False},
    "short5_rt": {"dwells_s": (0.005, 0.010, 0.025, 0.050, 0.100), "retune_s": 0.0005, "retune_in_index": False},
    "base_rt_cal": {"retune_s": 0.0005, "retune_in_index": False, "calibrate_dwells": True},
    "short5_rt_cal": {"dwells_s": (0.005, 0.010, 0.025, 0.050, 0.100), "retune_s": 0.0005,
                      "retune_in_index": False, "calibrate_dwells": True},
    "short5_search_rt": {"dwells_s": (0.005, 0.010, 0.025, 0.050, 0.100), "retune_s": 0.0005,
                         "retune_in_index": False, "min_track_dwell_s": 0.010},
}


def run(args):
    variant, scenario, seed, extra = args
    from primes.data.priors import Priors
    from primes.data.turing import load_stare
    from primes.env.scenarios import make_scenario
    from primes.eval.metrics import compute_metrics
    from primes.eval.replay import replay
    from primes.policies.primes_lite import PrimesLite

    pr = Priors.load()
    truth = load_stare(seed) if scenario == "turing" else make_scenario(scenario, seed, pr)
    params = {**VARIANTS[variant], **extra}
    m = compute_metrics(replay(PrimesLite(**params), truth, pr, seed=seed), truth)
    return {"variant": variant, "scenario": scenario, "seed": seed, "params": {k: str(v) for k, v in params.items()},
            **{k: m[k] for k in ("interception_ratio", "discovery_fraction", "ttfi_mean_s",
                                 "tracked_ratio", "pre_discovery_loss") if k in m}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", nargs="+", default=["base", "short5"])
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--tag", default="")
    args = ap.parse_args()

    tasks = [(v, f, 10_000 + s, {}) for v in args.variants for f in FAMILIES for s in range(args.seeds)]
    tasks += [(v, "turing", c, {}) for v in args.variants for c in TURING_TUNE]
    rows = []
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(max_workers=args.workers) as pool, OUT.open("a") as fh:
        futs = {pool.submit(run, t): t for t in tasks}
        for i, fut in enumerate(as_completed(futs), 1):
            try:
                r = fut.result()
            except Exception as exc:
                print(f"FAILED {futs[fut][:3]}: {exc!r}", flush=True)
                continue
            r["tag"] = args.tag
            rows.append(r)
            fh.write(json.dumps(r) + "\n"); fh.flush()
            if i % 10 == 0:
                print(f"{i}/{len(tasks)}", flush=True)

    print("\nvariant    scenario  interception  discovered  ttfi")
    for f in FAMILIES + ["turing"]:
        for v in args.variants:
            sel = [r for r in rows if r["variant"] == v and r["scenario"] == f]
            if sel:
                print(f"{v:16s} {f:8s} {np.mean([r['interception_ratio'] for r in sel]):.3f}"
                      f"      {np.mean([r['discovery_fraction'] for r in sel]):.2f}"
                      f"     {np.mean([r['ttfi_mean_s'] for r in sel]):.1f}")
    for v in args.variants:
        sel = [r for r in rows if r["variant"] == v]
        print(f"MEAN {v:16s} interception {np.mean([r['interception_ratio'] for r in sel]):.3f}")
    print("done", flush=True)


if __name__ == "__main__":
    main()

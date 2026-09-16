"""Robustness sweep: interception vs detection probability, false-alarm rate and sensitivity.

    python -m experiments.robustness --seeds 5 --workers 3

Conditions (one factor varied at a time from the nominal p_d = 1, p_fa = 0):
  detection probability p_d in {0.9, 0.7, 0.5}
  false-alarm probability per look p_fa in {0.001, 0.005, 0.02}; at ~5-25 ms looks that is roughly
  5-25 false alarms per minute (realistic) up to ~100+ per minute (stress)
Policies: raster, greedy, primes, oracle. Scenarios: 5 simulated families x seeds + the 11 Turing
benchmark scenarios. Checkpointed to artifacts/robustness_runs.jsonl; writes artifacts/robustness.json.
"""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from experiments.benchmark import BENCHMARK_TURING, bootstrap_ci

OUT = Path(__file__).resolve().parents[1] / "artifacts" / "robustness.json"
CHECKPOINT = OUT.with_name("robustness_runs.jsonl")
CONDITIONS = [("nominal", 1.0, 0.0),
              ("p_d=0.9", 0.9, 0.0), ("p_d=0.7", 0.7, 0.0), ("p_d=0.5", 0.5, 0.0),
              ("p_fa=0.001", 1.0, 0.001), ("p_fa=0.005", 1.0, 0.005), ("p_fa=0.02", 1.0, 0.02)]
POLICIES = ["raster", "greedy", "primes", "oracle"]
METRICS = ["interception_ratio", "discovery_fraction", "ttfi_mean_s", "tracked_ratio", "false_alarms",
           "false_alarm_rejection_s", "real_tracks_dropped"]


def _task(cond: str, p_d: float, p_fa: float, scenario: str, seed: int, policy: str) -> dict:
    from primes.eval.metrics import compute_metrics
    from primes.eval.replay import replay
    from primes.eval.runner import load_scenario, make_policy, priors

    truth = load_scenario(scenario, seed)
    t0 = time.time()
    m = compute_metrics(replay(make_policy(policy), truth, priors(), seed=seed, p_d=p_d, p_fa=p_fa), truth)
    row = {k: m.get(k) for k in METRICS}
    row.update(condition=cond, p_d=p_d, p_fa=p_fa, scenario=scenario,
               group="turing" if scenario.startswith("turing:") else scenario, seed=seed, policy=policy,
               runtime_s=round(time.time() - t0, 2))
    return row


def main() -> None:
    from primes.env.scenarios import SIM_FAMILIES

    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=5)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--fresh", action="store_true")
    args = ap.parse_args()

    scenarios = [(f, s) for f in SIM_FAMILIES for s in range(args.seeds)] + [(f"turing:{c}", 0) for c in BENCHMARK_TURING]
    tasks = [(c, pd, pfa, sc, seed, p) for (c, pd, pfa) in CONDITIONS for (sc, seed) in scenarios for p in POLICIES]
    if args.fresh:
        CHECKPOINT.unlink(missing_ok=True)
    rows = [json.loads(l) for l in CHECKPOINT.read_text().splitlines()] if CHECKPOINT.exists() else []
    done = {(r["condition"], r["scenario"], r["seed"], r["policy"]) for r in rows}
    todo = [t for t in tasks if (t[0], t[3], t[4], t[5]) not in done]
    print(f"{len(tasks)} runs, {len(todo)} to run", flush=True)

    t0 = time.time()
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(max_workers=args.workers) as pool, CHECKPOINT.open("a") as ckpt:
        futs = {pool.submit(_task, *t): t for t in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            try:
                row = fut.result()
            except Exception as exc:
                print(f"FAILED {futs[fut][:1] + futs[fut][3:]}: {exc!r}", flush=True)
                continue
            rows.append(row)
            ckpt.write(json.dumps(row) + "\n"); ckpt.flush()
            if i % 25 == 0 or i == len(todo):
                print(f"{len(rows)}/{len(tasks)} done ({time.time() - t0:.0f}s)", flush=True)

    summary = []
    for cond, _, _ in CONDITIONS:
        for grp in ["all"] + sorted({r["group"] for r in rows}):
            for pol in POLICIES:
                sel = [r for r in rows if r["condition"] == cond and r["policy"] == pol and (grp == "all" or r["group"] == grp)]
                if not sel:
                    continue
                entry = {"condition": cond, "group": grp, "policy": pol, "n": len(sel)}
                for k in METRICS:
                    v = np.array([r[k] for r in sel if r.get(k) is not None], dtype=float)
                    if len(v):
                        lo, hi = bootstrap_ci(v)
                        entry[k] = {"mean": float(v.mean()), "ci95": [lo, hi], "n": int(len(v))}
                summary.append(entry)
    OUT.write_text(json.dumps({"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "conditions": CONDITIONS, "policies": POLICIES, "summary": summary, "rows": rows}, indent=1))
    print(f"wrote {OUT}")
    print("\ncondition   policy   interception (all scenarios)   turing only")
    for cond, _, _ in CONDITIONS:
        for pol in POLICIES:
            a = next((e for e in summary if e["condition"] == cond and e["group"] == "all" and e["policy"] == pol), None)
            t = next((e for e in summary if e["condition"] == cond and e["group"] == "turing" and e["policy"] == pol), None)
            if a:
                print(f"{cond:10s} {pol:8s} {a['interception_ratio']['mean']:.3f}                       "
                      f"{t['interception_ratio']['mean'] if t else float('nan'):.3f}")


if __name__ == "__main__":
    main()

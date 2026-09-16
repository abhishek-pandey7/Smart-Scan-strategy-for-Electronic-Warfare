"""Multi-seed benchmark of all schedulers with bootstrap confidence intervals.

    python -m experiments.benchmark --seeds 10 --workers 6

Evaluation scenario seeds are 0..N-1 (training uses 10_000+, validation 20_000+).
Writes artifacts/benchmark.json, which the API serves at /api/benchmark.
"""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "artifacts" / "benchmark.json"
CHECKPOINT = OUT.with_name("benchmark_runs.jsonl")
BENCHMARK_TURING = [3, 8, 17, 40, 62, 71, 122, 151, 192, 202, 203]
METRICS = ["interception_ratio", "tracked_ratio", "pre_discovery_loss", "threat_weighted_interception",
           "high_threat_interception", "high_threat_ttfi_s", "threat_class_accuracy", "interception_ratio_per_emitter", "discovery_fraction", "ttfi_mean_s",
           "ttfi_p95_s", "popup_latency_mean_s", "prediction_correct_pct", "intercept_time_error_ms",
           "intercept_time_error_median_ms", "intercept_rate_per_s", "mean_dwell_ms"]


def _task(scenario: str, seed: int, policy: str) -> dict:
    from primes.eval.metrics import compute_metrics
    from primes.eval.replay import replay
    from primes.eval.runner import load_scenario, make_policy, priors

    truth = load_scenario(scenario, seed)
    t0 = time.time()
    m = compute_metrics(replay(make_policy(policy), truth, priors(), seed=seed), truth)
    row = {k: m[k] for k in METRICS}
    row.update(scenario=scenario, group="turing" if scenario.startswith("turing:") else scenario,
               seed=seed, policy=policy, emitters=m["emitters"], runtime_s=round(time.time() - t0, 2))
    return row


def bootstrap_ci(x: np.ndarray, n: int = 2000, seed: int = 0) -> tuple[float, float]:
    if len(x) < 2:
        return (float(x[0]), float(x[0])) if len(x) else (np.nan, np.nan)
    rng = np.random.default_rng(seed)
    means = rng.choice(x, (n, len(x)), replace=True).mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def summarise(rows: list[dict]) -> list[dict]:
    out = []
    for g in sorted({r["group"] for r in rows}):
        for p in sorted({r["policy"] for r in rows}):
            sel = [r for r in rows if r["group"] == g and r["policy"] == p]
            if not sel:
                continue
            entry = {"group": g, "policy": p, "n": len(sel)}
            for k in METRICS:
                vals = np.array([r[k] for r in sel if r[k] is not None], dtype=float)
                if len(vals):
                    lo, hi = bootstrap_ci(vals)
                    entry[k] = {"mean": float(vals.mean()), "ci95": [lo, hi], "n": int(len(vals))}
            out.append(entry)
    return out


def main() -> None:
    from primes.env.scenarios import SIM_FAMILIES
    from primes.eval.runner import available_policies

    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=10)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--families", nargs="*", default=list(SIM_FAMILIES))
    ap.add_argument("--turing", nargs="*", type=int, default=BENCHMARK_TURING,
                    help="val_stare config ids (default: the fixed benchmark set; tuning uses 5, 50, 100)")
    ap.add_argument("--policies", nargs="*", default=None)
    ap.add_argument("--fresh", action="store_true", help="discard saved partial results and start over")
    args = ap.parse_args()

    policies = args.policies or available_policies()
    turing = args.turing
    tasks = [(f, s, p) for f in args.families for s in range(args.seeds) for p in policies]
    tasks += [(f"turing:{c}", 0, p) for c in turing for p in policies]

    # Every finished run is appended to a checkpoint, so an interrupted benchmark resumes where it stopped.
    if args.fresh:
        CHECKPOINT.unlink(missing_ok=True)
    rows = [json.loads(line) for line in CHECKPOINT.read_text().splitlines()] if CHECKPOINT.exists() else []
    done = {(r["scenario"], r["seed"], r["policy"]) for r in rows}
    todo = [t for t in tasks if t not in done]
    print(f"{len(tasks)} runs: {len(args.families)} families x {args.seeds} seeds + {len(turing)} Turing scenarios, "
          f"policies {policies}; {len(tasks) - len(todo)} already done, {len(todo)} to run", flush=True)

    t0 = time.time()
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(max_workers=args.workers) as pool, CHECKPOINT.open("a") as ckpt:
        futures = {pool.submit(_task, *t): t for t in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                row = fut.result()
            except Exception as exc:
                print(f"FAILED {futures[fut]}: {exc!r}", flush=True)
                continue
            rows.append(row)
            ckpt.write(json.dumps(row) + "\n")
            ckpt.flush()
            if i % 25 == 0 or i == len(todo):
                print(f"{len(rows)}/{len(tasks)} done ({time.time() - t0:.0f}s)", flush=True)

    wanted = set(tasks)
    rows = [r for r in rows if (r["scenario"], r["seed"], r["policy"]) in wanted]

    result = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "config": {"seeds": args.seeds, "families": args.families, "turing": turing, "policies": policies},
              "summary": summarise(rows), "rows": rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1))
    print(f"wrote {OUT}")
    for e in result["summary"]:
        ir = e.get("interception_ratio", {})
        print(f"  {e['group']:8s} {e['policy']:13s} interception {ir.get('mean', float('nan')):.3f} "
              f"[{ir.get('ci95', [np.nan, np.nan])[0]:.3f}, {ir.get('ci95', [np.nan, np.nan])[1]:.3f}]")


if __name__ == "__main__":
    main()

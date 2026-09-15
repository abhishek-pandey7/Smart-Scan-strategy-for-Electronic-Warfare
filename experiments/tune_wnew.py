"""Small sweep of PRIMES parameters on tuning scenarios disjoint from the benchmark.

Simulated families use training seeds (10_000+); Turing uses val_stare configs not in the benchmark set.
"""
from __future__ import annotations

import itertools
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

TURING_TUNE = [5, 50, 100]
FAMS = ["easy", "lockout", "dense", "mixed"]


def run(args):
    fam, seed, w_new, stale = args
    from primes.data.priors import Priors
    from primes.env.scenarios import make_scenario
    from primes.data.turing import load_stare
    from primes.policies.primes_lite import PrimesLite
    from primes.eval.replay import replay
    from primes.eval.metrics import compute_metrics
    pr = Priors.load()
    tr = load_stare(seed) if fam == "turing" else make_scenario(fam, seed, pr)
    m = compute_metrics(replay(PrimesLite(w_new=w_new, stale_s=stale), tr, pr, seed=seed), tr)
    return fam, w_new, stale, m["interception_ratio"], m["discovery_fraction"]


if __name__ == "__main__":
    grid = list(itertools.product([1.0, 2.0, 4.0], [1.0, 2.0, 4.0]))
    tasks = [(f, 10_000 + s, w, st) for f in FAMS for s in range(2) for (w, st) in grid]
    tasks += [("turing", c, w, st) for c in TURING_TUNE for (w, st) in grid]
    with ProcessPoolExecutor(max_workers=6) as pool:
        rows = list(pool.map(run, tasks))
    for fam in FAMS + ["turing"]:
        print(f"\n{fam}: w_new stale -> interception / discovery")
        for (w, st) in grid:
            sel = [r for r in rows if r[0] == fam and r[1] == w and r[2] == st]
            print(f"  {w:4.1f} {st:4.1f} -> {np.mean([r[3] for r in sel]):.3f} / {np.mean([r[4] for r in sel]):.2f}")
    print("\nmean over families (interception):")
    for (w, st) in grid:
        sel = [r for r in rows if r[1] == w and r[2] == st]
        print(f"  {w:4.1f} {st:4.1f} -> {np.mean([r[3] for r in sel]):.3f}")

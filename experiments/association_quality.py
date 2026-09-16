"""Deinterleaving quality without a scheduler in the loop: raster looks fed through the associator.

    python -m experiments.association_quality --scenarios turing:5 turing:50 turing:100 dense:10000 mixed:10000

Uses tuning scenarios only (Turing configs 5, 50, 100; simulated seeds 10000+), disjoint from the benchmark.
Reports pulse purity, tracks per real emitter and the share of contaminated tracks.
"""

from __future__ import annotations

import argparse
import time

import numpy as np

from primes.associate.deinterleave import Associator
from primes.core.types import N_MIN_PULSES, RASTER_DWELL_S, Action
from primes.env.receiver import Receiver
from primes.eval.metrics import _association
from primes.eval.replay import Trace
from primes.eval.runner import load_scenario
from primes.policies.base import PolicyLogs


def evaluate(scenario: str) -> dict:
    name, _, seed = scenario.partition(":") if not scenario.startswith("turing:") else (scenario, "", "0")
    truth = load_scenario(name, int(seed))
    rx = Receiver(truth, np.random.default_rng(0), pdw=True)
    assoc = Associator(N_MIN_PULSES)
    logs = PolicyLogs()
    t, i = 0.0, 0
    while t < truth.horizon_s:
        c = i % len(RASTER_DWELL_S)
        look = rx.observe(t, Action(c, float(RASTER_DWELL_S[c])))
        x = look.pdw
        det, _, _, _, members = assoc.associate(x[:, 0], x[:, 1], x[:, 2], x[:, 3], t + look.action.dwell_s)
        for tid, idx in members.items():
            ids, n = np.unique(look.pdw_truth[idx], return_counts=True)
            logs.association.append((tid, dict(zip(ids.tolist(), n.tolist()))))
        t += look.action.dwell_s
        i += 1
    m = _association(Trace("raster", truth.name, 0, [], logs=logs))
    m["tracks"] = len(assoc.aoa)
    m["emitters"] = len(truth.emitters)
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", nargs="*", default=["turing:5", "turing:50", "turing:100", "dense:10000", "mixed:10000"])
    args = ap.parse_args()
    for sc in args.scenarios:
        t0 = time.time()
        m = evaluate(sc)
        print(f"{sc:12s} purity {m['association_purity'] or 0:.3f}  tracks/emitter {m['tracks_per_emitter'] or 0:.2f}  "
              f"contaminated {m['contaminated_tracks'] or 0:.2f}  tracks {m['tracks']} for {m['emitters']} emitters  "
              f"({time.time() - t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()

"""Compact JSON payloads of scenarios and replay traces for the web frontend."""

from __future__ import annotations

import numpy as np

from primes.core.types import ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES, Truth
from primes.eval.metrics import compute_metrics, intercepted_flashes
from primes.eval.replay import Trace

MAX_FLASHES = 6000
TIMELINE_STEP_S = 0.25


def _r(x, nd=4):
    return None if x is None else round(float(x), nd)


def _sig(v, digits=4):
    """Round every float in a nested explanation to `digits` significant digits; integral floats become ints."""
    if isinstance(v, dict):
        return {k: (x if k == "t" else _sig(x, digits)) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_sig(x, digits) for x in v]
    if isinstance(v, (float, np.floating)):
        v = float(v)
        if not np.isfinite(v):
            return None
        r = float(f"{v:.{digits}g}")
        return int(r) if r.is_integer() else r
    return v


def scenario_payload(truth: Truth) -> dict:
    flashes = []
    for e, fl in truth.flashes.items():
        if e < 0:
            continue
        coverable = np.abs(fl[:, 3:4] - CENTRES_MHZ[None, :]).min(axis=1) <= ACCEPT_HALF_WIDTH_MHZ
        for k in np.flatnonzero((fl[:, 2] >= N_MIN_PULSES) & coverable):
            flashes.append([int(e), int(k), _r(fl[k, 0]), _r(fl[k, 1]), _r(fl[k, 3], 1)])
    flashes.sort(key=lambda f: f[2])
    return {
        "name": truth.name,
        "horizon_s": truth.horizon_s,
        "centres_mhz": CENTRES_MHZ.tolist(),
        "emitters": [{"id": e.id, "kind": e.kind, "label": e.label, "role": e.role,
                      "freqs_mhz": [round(f, 1) for f in e.freqs_mhz[:6]], "period_s": _r(e.period_s), "threat": e.threat,
                      "flash_ms": _r(e.flash_s * 1e3 if e.flash_s else None, 2), "appear_s": _r(e.appear_s)}
                     for e in truth.emitters],
        "flashes": {"columns": ["emitter", "index", "start", "end", "freq_mhz"],
                    "rows": flashes[:MAX_FLASHES], "truncated": len(flashes) > MAX_FLASHES},
    }


def trace_payload(trace: Trace, truth: Truth) -> dict:
    metrics = compute_metrics(trace, truth)
    caught = intercepted_flashes(trace, truth)

    looks = {"t": [], "centre": [], "dwell_ms": [], "emitters": []}
    for lk in trace.looks:
        looks["t"].append(_r(lk.t))
        looks["centre"].append(lk.action.centre)
        looks["dwell_ms"].append(round(lk.action.dwell_s * 1e3, 1))
        looks["emitters"].append(sorted(int(e) for e in lk.detections if e >= 0))

    events = sorted((t, e, k) for e, fl in caught.items() for k, t in fl.items())
    first_seen: dict[int, float] = {}
    for t, e, _ in events:
        first_seen.setdefault(e, t)
    grid = np.arange(0.0, truth.horizon_s + 1e-9, TIMELINE_STEP_S)
    ev_t = np.array([t for t, _, _ in events])
    disc_t = np.sort(np.array(list(first_seen.values())))
    timeline = {"t": grid.round(3).tolist(),
                "intercepted": np.searchsorted(ev_t, grid, side="right").tolist(),
                "discovered": np.searchsorted(disc_t, grid, side="right").tolist()}

    predictions = []
    for t_now, e, pred in trace.logs.predictions:
        fl = truth.flashes.get(e)
        nxt = fl[(fl[:, 0] > t_now + 0.02) & (fl[:, 2] >= N_MIN_PULSES), 0] if fl is not None else []
        predictions.append({"t": _r(t_now), "emitter": e, "predicted": _r(pred),
                            "actual": _r(nxt[0]) if len(nxt) else None})

    return {
        "policy": trace.policy,
        "metrics": {k: v for k, v in metrics.items() if not k.startswith("_")},
        "looks": looks,
        "intercepts": [[_r(t), e, k] for t, e, k in events],
        "timeline": timeline,
        "tracks": [[_r(t), e, _r(T), _r(c, 3)] for t, e, T, c in trace.logs.tracks],
        "threats": [[_r(t), e, p] for t, e, p in trace.logs.threats],
        "predictions": predictions,
        "explanations": [_sig(ex) for _, ex in trace.explanations],
    }

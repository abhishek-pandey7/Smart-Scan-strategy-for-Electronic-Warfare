"""Figures of merit computed from a replay trace and the hidden truth."""

from __future__ import annotations

import numpy as np

from primes.core.types import N_MIN_PULSES, Truth
from primes.eval.replay import Trace

PREDICTION_TOL_S = 0.010


def intercepted_flashes(trace: Trace, truth: Truth) -> dict[int, dict[int, float]]:
    """emitter -> {flash index: time of first intercept}."""
    out: dict[int, dict[int, float]] = {}
    for look in trace.looks:
        for e, pulses in look.detections.items():
            fl = truth.flashes.get(e)
            if e < 0 or fl is None:
                continue
            k = np.unique(np.searchsorted(fl[:, 0], pulses, side="right") - 1)
            for ki in k[k >= 0]:
                out.setdefault(e, {}).setdefault(int(ki), look.t)
    return out


def compute_metrics(trace: Trace, truth: Truth) -> dict:
    H = truth.horizon_s
    caught = intercepted_flashes(trace, truth)
    appear = {e.id: e.appear_s for e in truth.emitters}

    n_able = n_hit = 0
    per_emitter_ratio, ttfi, popup_latency = [], [], []
    for e, fl in truth.flashes.items():
        if e < 0:
            continue
        able = np.flatnonzero(fl[:, 2] >= N_MIN_PULSES)
        if len(able) == 0:
            continue
        hits = caught.get(e, {})
        got = sum(1 for k in able if k in hits)
        n_able += len(able); n_hit += got
        per_emitter_ratio.append(got / len(able))
        t0 = appear.get(e, 0.0)
        first = min(hits.values()) if hits else H
        ttfi.append(first - t0)
        if t0 > 0:
            popup_latency.append(first - t0)

    discovered = np.array(sorted(min(h.values()) for h in caught.values() if h))
    n_emitters = len(per_emitter_ratio)

    pred_err = []
    for t_now, e, pred in trace.logs.predictions:
        fl = truth.flashes.get(e)
        if fl is None:
            continue
        nxt = fl[fl[:, 0] > t_now + 0.02, 0]
        if len(nxt):
            pred_err.append(abs(pred - nxt[0]))
    pred_err = np.array(pred_err)

    looks_t = trace.t
    dwell = np.array([lk.action.dwell_s for lk in trace.looks])
    false_alarms = sum(1 for lk in trace.looks if -1 in lk.detections)

    return {
        "policy": trace.policy,
        "scenario": trace.scenario,
        "seed": trace.seed,
        "emitters": n_emitters,
        "interceptable_flashes": n_able,
        "intercepted_flashes": n_hit,
        "interception_ratio": n_hit / n_able if n_able else 0.0,
        "interception_ratio_per_emitter": float(np.mean(per_emitter_ratio)) if per_emitter_ratio else 0.0,
        "emitters_discovered": int(len(discovered)),
        "discovery_fraction": len(discovered) / n_emitters if n_emitters else 0.0,
        "ttfi_mean_s": float(np.mean(ttfi)) if ttfi else H,
        "ttfi_p95_s": float(np.percentile(ttfi, 95)) if ttfi else H,
        "popup_latency_mean_s": float(np.mean(popup_latency)) if popup_latency else None,
        "intercept_rate_per_s": n_hit / H,
        "prediction_count": int(len(pred_err)),
        "prediction_correct_pct": float(np.mean(pred_err <= PREDICTION_TOL_S) * 100) if len(pred_err) else None,
        "intercept_time_error_ms": float(np.mean(pred_err) * 1e3) if len(pred_err) else None,
        "intercept_time_error_median_ms": float(np.median(pred_err) * 1e3) if len(pred_err) else None,
        "looks": len(trace.looks),
        "mean_dwell_ms": float(dwell.mean() * 1e3) if len(dwell) else 0.0,
        "false_alarms": false_alarms,
        "discovery_curve": {"t": discovered.round(4).tolist(),
                            "n": list(range(1, len(discovered) + 1))},
        "_looks_span_s": float(looks_t[-1]) if len(looks_t) else 0.0,
    }

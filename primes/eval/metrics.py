"""Figures of merit computed from a replay trace and the hidden truth."""

from __future__ import annotations

import numpy as np

from primes.core.types import ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES, Truth
from primes.eval.replay import Trace

PREDICTION_TOL_S = 0.010
FLASH_LIKE_DUTY = 0.05          # emitters visible < 5 % of the time count as flash-like for prediction scoring


def visibility_duty(truth: Truth, emitter_id: int) -> float:
    fl = truth.flashes.get(emitter_id)
    return 0.0 if fl is None else float(np.sum(fl[:, 1] - fl[:, 0]) / truth.horizon_s)


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


def _rejection_time(trace: Trace, real_ids: set[int]) -> float | None:
    """Mean seconds from a false alarm's detection to the scheduler dropping its track."""
    times = [dt for _, e, dt in trace.logs.rejections if e < 0]
    return float(np.mean(times)) if times else None


def track_owners(trace: Trace) -> dict[int, tuple[int, float]]:
    """Scheduler track id -> (truth emitter owning most of its pulses, that share). Empty when the scheduler
    was given labelled pulses, in which case track ids already are emitter ids."""
    acc: dict[int, dict[int, int]] = {}
    for tid, counts in trace.logs.association:
        a = acc.setdefault(tid, {})
        for e, k in counts.items():
            a[e] = a.get(e, 0) + k
    out = {}
    for tid, a in acc.items():
        e, k = max(a.items(), key=lambda kv: kv[1])
        out[tid] = (e, k / sum(a.values()))
    return out


def _association(trace: Trace) -> dict:
    """Deinterleaving quality from the scheduler's own track ids vs the truth emitters of their pulses."""
    log = trace.logs.association
    if not log:
        return {"association_purity": None, "tracks_per_emitter": None, "contaminated_tracks": None}
    total = pure = 0
    per_track: dict[int, dict[int, int]] = {}
    for tid, counts in log:
        n = sum(counts.values())
        total += n
        pure += max(counts.values())
        acc = per_track.setdefault(tid, {})
        for e, k in counts.items():
            acc[e] = acc.get(e, 0) + k
    owner: dict[int, set[int]] = {}
    contaminated = 0
    for tid, acc in per_track.items():
        e, k = max(acc.items(), key=lambda kv: kv[1])
        contaminated += k < 0.9 * sum(acc.values())
        if e >= 0:
            owner.setdefault(e, set()).add(tid)
    return {"association_purity": pure / total if total else None,
            "tracks_per_emitter": float(np.mean([len(v) for v in owner.values()])) if owner else None,
            "contaminated_tracks": contaminated / len(per_track)}


def _threat_accuracy(trace: Trace, threat: dict[int, str]) -> float | None:
    """Share of labelled tracks whose latest predicted threat level matches the truth."""
    owners = track_owners(trace)
    latest: dict[int, list[float]] = {}
    for _, e, probs in trace.logs.threats:
        latest[owners[e][0] if e in owners else e] = probs
    scored = [(("low", "medium", "high")[int(np.argmax(p))] == threat[e]) for e, p in latest.items() if threat.get(e)]
    return float(np.mean(scored)) if scored else None


def compute_metrics(trace: Trace, truth: Truth) -> dict:
    H = truth.horizon_s
    caught = intercepted_flashes(trace, truth)
    appear = {e.id: e.appear_s for e in truth.emitters}

    n_able = n_hit = 0
    n_pre = n_post = n_post_hit = 0          # acquisition vs track maintenance split
    from primes.threat.taxonomy import threat_weight
    threat = {e.id: e.threat for e in truth.emitters}
    w_able = w_hit = 0.0
    high_able = high_hit = 0
    high_ttfi: list[float] = []
    per_emitter_ratio, ttfi, popup_latency = [], [], []
    for e, fl in truth.flashes.items():
        if e < 0:
            continue
        coverable = np.abs(fl[:, 3:4] - CENTRES_MHZ[None, :]).min(axis=1) <= ACCEPT_HALF_WIDTH_MHZ
        able = np.flatnonzero((fl[:, 2] >= N_MIN_PULSES) & coverable)
        if len(able) == 0:
            continue
        hits = caught.get(e, {})
        got = sum(1 for k in able if k in hits)
        n_able += len(able); n_hit += got
        lvl = threat.get(e, "")
        if lvl:
            w_able += threat_weight(lvl) * len(able)
            w_hit += threat_weight(lvl) * got
        if lvl == "high":
            high_able += len(able); high_hit += got
        per_emitter_ratio.append(got / len(able))
        t0 = appear.get(e, 0.0)
        first = min(hits.values()) if hits else H
        if hits:
            post = able[fl[able, 0] >= first]
            n_post += len(post)
            n_post_hit += sum(1 for k in post if k in hits)
            n_pre += len(able) - len(post)
        else:
            n_pre += len(able)
        ttfi.append(first - t0)
        if lvl == "high":
            high_ttfi.append(first - t0)
        if t0 > 0:
            popup_latency.append(first - t0)

    discovered = np.array(sorted(min(h.values()) for h in caught.values() if h))
    n_emitters = len(per_emitter_ratio)

    pred_err = []
    flash_like = {e for e in truth.flashes if e >= 0 and visibility_duty(truth, e) < FLASH_LIKE_DUTY}
    owners = track_owners(trace)
    for t_now, e, pred in trace.logs.predictions:
        e = owners[e][0] if e in owners else e       # self-deinterleaved tracks are scored against their owning emitter
        fl = truth.flashes.get(e)
        if fl is None or e not in flash_like:
            continue
        fl = fl[fl[:, 2] >= N_MIN_PULSES]
        nxt = fl[fl[:, 0] > t_now + 0.02, 0]
        if len(nxt):
            pred_err.append(abs(pred - nxt[0]))
    pred_err = np.array(pred_err)

    looks_t = trace.t
    dwell = np.array([lk.action.dwell_s for lk in trace.looks])
    false_alarms = sum(1 for lk in trace.looks for e in lk.detections if e < 0)

    return {
        "policy": trace.policy,
        "scenario": trace.scenario,
        "seed": trace.seed,
        "emitters": n_emitters,
        "flash_like_emitters": len(flash_like),
        "interceptable_flashes": n_able,
        "intercepted_flashes": n_hit,
        "interception_ratio": n_hit / n_able if n_able else 0.0,
        "tracked_ratio": n_post_hit / n_post if n_post else None,
        "threat_weighted_interception": w_hit / w_able if w_able else None,
        "high_threat_interception": high_hit / high_able if high_able else None,
        "high_threat_ttfi_s": float(np.mean(high_ttfi)) if high_ttfi else None,
        "threat_class_accuracy": _threat_accuracy(trace, threat),
        "false_alarm_rejection_s": _rejection_time(trace, real_ids={e.id for e in truth.emitters}),
        "real_tracks_dropped": sum(1 for _, e, _ in trace.logs.rejections if e >= 0),
        **_association(trace),
        "pre_discovery_loss": n_pre / n_able if n_able else 0.0,
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

"""Deinterleaving within one dwell and association of pulse clusters to tracks across dwells.

Measured on real Turing PDWs (tuning configs only): angle of arrival is the stable short-term key
(1-6 deg spread inside a dwell); pulse width is not, since many radars interleave several pulse-width
modes within milliseconds; frequency agility spans up to ~600 MHz; and some emitters' bearings drift by
tens of degrees over 30 s. So:

  within a dwell   pulses are grouped by bearing (bin-and-merge connected components), then a group is
                   split where its frequencies are further apart than an agile emitter spans;
  across dwells    a group joins the track whose bearing gate, widened with time since that track was
                   last heard and centred on its alpha-beta predicted bearing, contains it and whose known frequencies are within the agility span;
                   pulse width only breaks ties. Otherwise it starts a new track.

Nothing here reads truth labels. Errors a real deinterleaver makes are reproduced, not hidden:
co-bearing emitters in the same band merge; fast-moving emitters can fragment.
"""

from __future__ import annotations

import numpy as np

AOA_BIN_DEG = 4.0                  # bins merge with neighbours, so pulses chain within ~2 bins
FREQ_SPLIT_MHZ = 150.0             # a gap this large inside one bearing group starts a new group...
FREQ_AGILE_MHZ = 1100.0            # ...unless the parts are within an agile emitter's span (real hoppers span up to 1 GHz)
TRACK_AOA_GATE_DEG = 8.0
TRACK_AOA_DRIFT_DEG_S = 2.0        # gate widening per second since the track was last heard
TRACK_AOA_GATE_MAX_DEG = 30.0
AOA_ALPHA, AOA_BETA = 0.5, 0.3      # alpha-beta bearing filter: close fly-bys sweep >10 deg/s
MAX_AOA_RATE_DEG_S = 20.0


def _wrap_deg(x):
    return (np.asarray(x) + 180.0) % 360.0 - 180.0


def _circ_mean_deg(a: np.ndarray) -> float:
    r = np.deg2rad(a)
    return float(np.rad2deg(np.arctan2(np.sin(r).mean(), np.cos(r).mean())))


def cluster_pulses(freq: np.ndarray, pw: np.ndarray, aoa: np.ndarray) -> np.ndarray:
    """Cluster label per pulse (0..k-1): bearing groups, split in frequency beyond an agile span."""
    n = len(freq)
    if n == 0:
        return np.empty(0, dtype=int)
    n_bins = int(round(360.0 / AOA_BIN_DEG))
    b = np.floor((np.asarray(aoa) + 180.0) / AOA_BIN_DEG).astype(np.int64) % n_bins
    occupied = np.zeros(n_bins, dtype=bool)
    occupied[b] = True
    # circular runs of occupied bins (a one-bin hole is bridged) are one bearing group
    filled = occupied | (np.roll(occupied, 1) & np.roll(occupied, -1))
    run = np.cumsum(np.r_[filled[0], filled[1:] & ~filled[:-1]]) - 1
    if filled.all():
        run[:] = 0
    elif filled[0] and filled[-1]:
        run[run == run[-1]] = 0                           # the run wrapping past ±180° is one group
    group = run[b]
    labels = np.empty(n, dtype=int)
    next_label = 0
    for g in np.unique(group):
        idx = np.flatnonzero(group == g)
        for part in _split_freq(idx, np.asarray(freq)):
            labels[part] = next_label
            next_label += 1
    return labels


def _split_freq(idx: np.ndarray, freq: np.ndarray) -> list[np.ndarray]:
    """Split pulses at frequency gaps larger than FREQ_SPLIT_MHZ, then re-join neighbouring parts while
    the joined span stays within FREQ_AGILE_MHZ (one agile emitter)."""
    order = idx[np.argsort(freq[idx])]
    f = freq[order]
    cuts = np.flatnonzero(np.diff(f) > FREQ_SPLIT_MHZ) + 1
    parts = np.split(order, cuts)
    out = [parts[0]]
    for p in parts[1:]:
        if freq[p].max() - freq[out[-1]].min() <= FREQ_AGILE_MHZ:
            out[-1] = np.concatenate([out[-1], p])
        else:
            out.append(p)
    return out


class Associator:
    """Turns an unlabelled look into detections keyed by track (pseudo-emitter) ids."""

    def __init__(self, n_min: int):
        self.n_min = n_min
        self.aoa: list[float] = []
        self.rate: list[float] = []         # deg/s
        self.t_last: list[float] = []
        self.freqs: list[list[float]] = []
        self.logpw: list[list[float]] = []

    def _match(self, t: float, a: float, f: np.ndarray, lp: float, taken: set[int]) -> int | None:
        if not self.aoa:
            return None
        dt = t - np.array(self.t_last)
        A = np.array(self.aoa) + np.array(self.rate) * dt
        gate = np.minimum(TRACK_AOA_GATE_DEG + TRACK_AOA_DRIFT_DEG_S * dt, TRACK_AOA_GATE_MAX_DEG)
        da = np.abs(_wrap_deg(A - a))
        best, best_cost = None, np.inf
        for i in np.flatnonzero(da <= gate):
            if i in taken:
                continue
            known = np.array(self.freqs[i])
            span = max(float(f.max()), known.max()) - min(float(f.min()), known.min())
            if span > FREQ_AGILE_MHZ:
                continue
            df = float(np.min(np.abs(known - np.median(f))))
            dpw = float(np.min(np.abs(np.array(self.logpw[i]) - lp)))
            cost = da[i] / gate[i] + df / FREQ_AGILE_MHZ + 0.25 * min(dpw, 2.0)
            if cost < best_cost:
                best, best_cost = int(i), cost
        return best

    def _update(self, i: int | None, t: float, a: float, f: np.ndarray, lp: float) -> int:
        fm = float(np.median(f))
        if i is None:
            self.aoa.append(a); self.rate.append(0.0); self.t_last.append(t)
            self.freqs.append([fm]); self.logpw.append([lp])
            return len(self.aoa) - 1
        dt = t - self.t_last[i]
        pred = self.aoa[i] + self.rate[i] * dt
        resid = float(_wrap_deg(a - pred))
        self.aoa[i] = float(_wrap_deg(pred + AOA_ALPHA * resid))
        if dt > 0.2:
            self.rate[i] = float(np.clip(self.rate[i] + AOA_BETA * resid / dt, -MAX_AOA_RATE_DEG_S, MAX_AOA_RATE_DEG_S))
        self.t_last[i] = t
        if np.min(np.abs(np.array(self.freqs[i]) - fm)) > 5.0:
            self.freqs[i] = (self.freqs[i] + [fm])[-24:]
        if np.min(np.abs(np.array(self.logpw[i]) - lp)) > 0.1:
            self.logpw[i] = (self.logpw[i] + [lp])[-8:]
        return i

    def associate(self, toa: np.ndarray, freq: np.ndarray, pw: np.ndarray, aoa: np.ndarray, end_t: float
                  ) -> tuple[dict[int, np.ndarray], dict[int, np.ndarray], dict[int, np.ndarray], dict[int, float],
                             dict[int, np.ndarray]]:
        """Returns detections, freqs, pws (track id -> per-pulse arrays), partial (track id, or a negative
        key for an unknown group -> last ToA for 1..n_min-1 pulses) and members (track id -> pulse indices)."""
        det, fq, pws, partial, members = {}, {}, {}, {}, {}
        if len(toa) == 0:
            return det, fq, pws, partial, members
        lab = cluster_pulses(freq, pw, aoa)
        taken: set[int] = set()
        sizes = np.bincount(lab)
        for g in np.argsort(-sizes, kind="stable"):
            idx = np.flatnonzero(lab == g)
            a = _circ_mean_deg(aoa[idx])
            lp = float(np.median(np.log(np.maximum(pw[idx], 1e-4))))
            tid = self._match(end_t, a, freq[idx], lp, taken)
            if len(idx) < self.n_min:
                # too few pulses to declare anything; only used to decide whether to keep listening
                key = tid if tid is not None else -1 - int(g)
                partial[key] = max(partial.get(key, -np.inf), float(toa[idx].max()))
                continue
            tid = self._update(tid, end_t, a, freq[idx], lp)
            taken.add(tid)
            idx = idx[np.argsort(toa[idx], kind="stable")]
            det[tid], fq[tid], pws[tid], members[tid] = toa[idx], freq[idx], pw[idx], idx
        partial = {k: v for k, v in partial.items() if k not in det}
        return det, fq, pws, partial, members

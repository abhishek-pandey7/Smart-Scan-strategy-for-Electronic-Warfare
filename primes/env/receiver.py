"""Scanning ES receiver model: tune to a centre for a dwell, return detected pulses by emitter."""

from __future__ import annotations

import numpy as np

from primes.core.types import (ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES, Action, Look,
                               Truth)


class Receiver:
    def __init__(self, truth: Truth, rng: np.random.Generator, p_d: float = 1.0,
                 p_fa: float = 0.0, n_min: int = N_MIN_PULSES, pdw: bool = False):
        self.truth, self.rng = truth, rng
        self.p_d, self.p_fa, self.n_min = p_d, p_fa, n_min
        self._false_alarms = 0
        # pdw=True: also report every in-band pulse as an unlabelled PDW, and end stop-on-detect dwells
        # when a feature cluster (not a truth emitter) reaches n_min pulses.
        self.pdw = pdw
        if pdw:
            from primes.associate.pdw import pdw_features
            self._feat = pdw_features(truth)

    def observe(self, t: float, action: Action, window_start: float | None = None) -> Look:
        """Listen on `action.centre` from `t` for `action.dwell_s`.

        window_start: for an extension, the start of the contiguous listening window on this centre;
        pulses count towards detection across the whole window.
        stop_on_detect: the dwell ends as soon as the first emitter reaches n_min pulses; the returned
        Look's action carries the actual (shortened) dwell.
        """
        tr = self.truth
        ws = t if window_start is None else window_start
        if action.stop_on_detect:
            lo, hi = np.searchsorted(tr.toa, [ws, t + action.dwell_s])
            inband = np.abs(tr.freq[lo:hi] - CENTRES_MHZ[action.centre]) <= ACCEPT_HALF_WIDTH_MHZ
            toas, ids = tr.toa[lo:hi][inband], tr.emitter[lo:hi][inband]
            t_stop = t + action.dwell_s
            if self.pdw:
                from primes.associate.deinterleave import cluster_pulses
                sl = np.arange(lo, hi)[inband]
                ids = cluster_pulses(self._feat[0][sl], self._feat[1][sl], self._feat[2][sl])
            for e in np.unique(ids):
                te = toas[ids == e]
                if len(te) >= self.n_min and te[self.n_min - 1] >= t:   # newly confirmed in this segment
                    t_stop = min(t_stop, te[self.n_min - 1] + 1e-4)
            action = Action(action.centre, max(t_stop - t, 1e-3), action.extend, action.stop_on_detect)
        lo, hi = np.searchsorted(tr.toa, [ws, t + action.dwell_s])
        inband = np.abs(tr.freq[lo:hi] - CENTRES_MHZ[action.centre]) <= ACCEPT_HALF_WIDTH_MHZ
        toas = tr.toa[lo:hi][inband]
        freqs = tr.freq[lo:hi][inband]
        ids = tr.emitter[lo:hi][inband]
        widths = tr.pw[lo:hi][inband] if tr.pw is not None else None

        detections: dict[int, np.ndarray] = {}
        measured: dict[int, np.ndarray] = {}
        measured_pw: dict[int, np.ndarray] = {}
        partial: dict[int, float] = {}
        heard = np.ones(len(toas), dtype=bool)          # pulses that reach the processor (missed detections drop them)
        for e in np.unique(ids):
            sel = ids == e
            if sel.sum() >= self.n_min and self.rng.random() < self.p_d:
                detections[int(e)], measured[int(e)] = toas[sel], freqs[sel]
                if widths is not None:
                    measured_pw[int(e)] = widths[sel]
            elif 0 < sel.sum() < self.n_min:
                partial[int(e)] = float(toas[sel][-1])
            else:
                heard[sel] = False
        pdw = pdw_truth = None
        if self.pdw:
            sl = np.arange(lo, hi)[inband][heard]
            pdw = np.stack([toas[heard], self._feat[0][sl], self._feat[1][sl], self._feat[2][sl]], axis=1)
            pdw_truth = ids[heard].astype(np.int64)
        if self.p_fa > 0 and self.rng.random() < self.p_fa:
            # A false alarm is indistinguishable from a new emitter to the scheduler: it gets a fresh
            # negative id (never matching truth), a random in-band frequency and a plausible pulse train.
            self._false_alarms += 1
            fid = -1 - self._false_alarms
            pri = float(self.rng.uniform(2e-4, 2e-3))
            detections[fid] = t + self.rng.random() * max(action.dwell_s - self.n_min * pri, 0.0) + np.arange(self.n_min) * pri
            measured[fid] = np.full(self.n_min, CENTRES_MHZ[action.centre] + self.rng.uniform(-450, 450), dtype=np.float32)
            if self.pdw:
                fa = np.stack([detections[fid], measured[fid].astype(np.float64),
                               np.full(self.n_min, np.exp(self.rng.uniform(np.log(0.2), np.log(30.0)))),
                               np.full(self.n_min, self.rng.uniform(-180, 180))], axis=1)
                order = np.argsort(np.r_[pdw[:, 0], fa[:, 0]], kind="stable")
                pdw = np.vstack([pdw, fa])[order]
                pdw_truth = np.r_[pdw_truth, np.full(self.n_min, fid)][order]
        return Look(t=ws, action=Action(action.centre, t + action.dwell_s - ws, action.extend, action.stop_on_detect),
                    detections=detections, freqs=measured, partial=partial, pws=measured_pw,
                    pdw=pdw, pdw_truth=pdw_truth)

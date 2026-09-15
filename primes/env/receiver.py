"""Scanning ES receiver model: tune to a centre for a dwell, return detected pulses by emitter."""

from __future__ import annotations

import numpy as np

from primes.core.types import (ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES, Action, Look,
                               Truth)


class Receiver:
    def __init__(self, truth: Truth, rng: np.random.Generator, p_d: float = 1.0,
                 p_fa: float = 0.0, n_min: int = N_MIN_PULSES):
        self.truth, self.rng = truth, rng
        self.p_d, self.p_fa, self.n_min = p_d, p_fa, n_min

    def observe(self, t: float, action: Action) -> Look:
        tr = self.truth
        lo, hi = np.searchsorted(tr.toa, [t, t + action.dwell_s])
        inband = np.abs(tr.freq[lo:hi] - CENTRES_MHZ[action.centre]) <= ACCEPT_HALF_WIDTH_MHZ
        toas = tr.toa[lo:hi][inband]
        freqs = tr.freq[lo:hi][inband]
        ids = tr.emitter[lo:hi][inband]

        detections: dict[int, np.ndarray] = {}
        measured: dict[int, np.ndarray] = {}
        for e in np.unique(ids):
            sel = ids == e
            if sel.sum() >= self.n_min and self.rng.random() < self.p_d:
                detections[int(e)], measured[int(e)] = toas[sel], freqs[sel]
        if self.p_fa > 0 and self.rng.random() < self.p_fa:
            detections[-1] = np.sort(t + self.rng.random(self.n_min) * action.dwell_s)
            measured[-1] = np.full(self.n_min, CENTRES_MHZ[action.centre], dtype=np.float32)
        return Look(t=t, action=action, detections=detections, freqs=measured)

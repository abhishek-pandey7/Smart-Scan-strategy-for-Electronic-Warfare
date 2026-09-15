"""Gilbert–Elliott (two-state on/off Markov) visibility model with a Bayesian grid over rates.

Each grid cell is a hypothesis (mean on-duration, mean off-duration). Between looks the belief
b = P(visible) relaxes towards the stationary share pi; a look is an observation of the state.
This is the model for emitters that are intermittently visible for long stretches (sidelobes,
sector scans, bursts) rather than as short periodic main-beam flashes.
"""

from __future__ import annotations

import numpy as np

DURATIONS_S = np.array([0.05, 0.15, 0.5, 1.5, 5.0, 15.0])
_ON, _OFF = np.meshgrid(DURATIONS_S, DURATIONS_S, indexing="ij")
MEAN_ON, MEAN_OFF = _ON.ravel(), _OFF.ravel()
RATE = 1.0 / MEAN_ON + 1.0 / MEAN_OFF                 # relaxation rate of the belief
PI_ON = (1.0 / MEAN_OFF) / RATE                       # stationary P(visible)


class MarkovBank:
    def __init__(self, t0: float):
        self.t = t0
        self.b = np.ones(len(RATE))                    # just detected: visible
        self.logw = np.zeros(len(RATE))

    @property
    def weights(self) -> np.ndarray:
        e = np.exp(self.logw - self.logw.max())
        return e / e.sum()

    def belief_at(self, t: float) -> np.ndarray:
        return PI_ON + (self.b - PI_ON) * np.exp(-RATE * max(t - self.t, 0.0))

    def belief_matrix(self, times: np.ndarray) -> np.ndarray:
        """(cells, len(times)) beliefs at several future times."""
        dt = np.maximum(times - self.t, 0.0)[None, :]
        return PI_ON[:, None] + (self.b - PI_ON)[:, None] * np.exp(-RATE[:, None] * dt)

    def peak_bound(self) -> float:
        """Upper bound on the belief at any future time (it relaxes monotonically towards PI_ON)."""
        return float(max(self.b.max(), PI_ON.max()))

    def observe(self, t: float, hit: bool, p_detect: float) -> float:
        """Update with one look (p_detect = P_d x coverage). Returns the class predictive probability
        of the observed outcome, for model comparison against the periodic bank."""
        b = self.belief_at(t)
        p = p_detect * b
        lik = np.maximum(p, 1e-4) if hit else np.maximum(1.0 - p, 1e-4)
        predictive = float(self.weights @ lik)
        self.logw += np.log(lik)
        self.b = np.ones_like(b) if hit else b * (1.0 - p_detect) / np.maximum(1.0 - p, 1e-9)
        self.t = t
        return predictive

    def summary(self) -> dict:
        i = int(np.argmax(self.logw))
        return {"mean_on_s": float(MEAN_ON[i]), "mean_off_s": float(MEAN_OFF[i]), "duty": float(PI_ON[i])}

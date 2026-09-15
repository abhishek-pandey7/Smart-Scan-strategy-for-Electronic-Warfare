"""Observation features for learned schedulers (DQN comparator)."""

from __future__ import annotations

import numpy as np

from primes.core.types import N_CENTRES, Action, Look

N_FEATURES = 6
OBS_DIM = N_CENTRES * N_FEATURES + 1
# The comparator selects bands at a fixed 25 ms dwell. A fixed step duration keeps the per-step
# discount consistent with elapsed time (variable dwells would make it a semi-MDP).
DQN_DWELLS_S = (0.025,)
N_ACTIONS = N_CENTRES * len(DQN_DWELLS_S)


def decode_action(a: int) -> Action:
    return Action(int(a // len(DQN_DWELLS_S)), float(DQN_DWELLS_S[a % len(DQN_DWELLS_S)]))


class ObsBuilder:
    """Per-centre history: time since look, time since detection, detections, emitters seen,
    last dwell, last outcome. Model-free: no timing or period model."""

    def __init__(self, horizon_s: float):
        self.horizon = horizon_s
        self.last_look = np.full(N_CENTRES, -10.0)
        self.last_hit = np.full(N_CENTRES, -60.0)
        self.hits = np.zeros(N_CENTRES)
        self.emitters: list[set[int]] = [set() for _ in range(N_CENTRES)]
        self.last_dwell = np.zeros(N_CENTRES)
        self.last_outcome = np.zeros(N_CENTRES)

    def update(self, look: Look) -> None:
        c = look.action.centre
        found = [e for e in look.detections if e >= 0]
        self.last_look[c] = look.t
        self.last_dwell[c] = look.action.dwell_s
        self.last_outcome[c] = 1.0 if found else 0.0
        if found:
            self.last_hit[c] = look.t
            self.hits[c] += 1
            self.emitters[c].update(found)

    def obs(self, t: float) -> np.ndarray:
        f = np.stack([
            np.log1p(np.maximum(t - self.last_look, 0.0)) / 4.0,
            np.log1p(np.maximum(t - self.last_hit, 0.0)) / 4.0,
            np.log1p(self.hits) / 5.0,
            np.log1p([len(s) for s in self.emitters]) / 3.0,
            self.last_dwell * 10.0,
            self.last_outcome,
        ], axis=1)
        return np.r_[f.ravel(), t / self.horizon].astype(np.float32)

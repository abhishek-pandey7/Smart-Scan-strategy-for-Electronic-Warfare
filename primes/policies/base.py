"""Scheduler policy interface."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from primes.core.types import Action, Look
from primes.data.priors import Priors


@dataclass
class Context:
    horizon_s: float
    rng: np.random.Generator
    priors: Priors


@dataclass
class PolicyLogs:
    """Optional outputs a policy exposes for metrics and the UI."""

    predictions: list[tuple[float, int, float]] = field(default_factory=list)   # (t_now, emitter, predicted next flash start)
    tracks: list[tuple[float, int, float, float]] = field(default_factory=list)  # (t, emitter, period estimate, confidence)
    threats: list[tuple[float, int, list[float]]] = field(default_factory=list)   # (t, emitter, [p_low, p_medium, p_high])
    rejections: list[tuple[float, int, float]] = field(default_factory=list)      # (t, emitter, seconds since first detection) when a track is dropped
    association: list[tuple[int, dict[int, int]]] = field(default_factory=list)  # (track id, {truth emitter: pulses}) per detection; scoring only


class Policy:
    name = "policy"

    def reset(self, ctx: Context) -> None:
        self.ctx = ctx
        self.logs = PolicyLogs()

    def act(self, t: float) -> Action:
        raise NotImplementedError

    def update(self, look: Look) -> None:
        pass

    def explain(self) -> dict:
        return {}

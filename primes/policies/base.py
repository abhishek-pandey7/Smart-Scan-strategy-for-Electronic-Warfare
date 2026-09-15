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

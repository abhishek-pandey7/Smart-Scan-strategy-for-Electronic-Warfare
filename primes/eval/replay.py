"""Exact replay of a scheduler against stored pulse-level truth."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from primes.core.types import DWELL_OPTIONS_S, N_CENTRES, Action, Look, Truth
from primes.data.priors import Priors
from primes.env.receiver import Receiver
from primes.policies.base import Context, Policy, PolicyLogs


@dataclass
class Trace:
    policy: str
    scenario: str
    seed: int
    looks: list[Look]
    explanations: list[tuple[float, dict]] = field(default_factory=list)
    logs: PolicyLogs = field(default_factory=PolicyLogs)

    @property
    def t(self) -> np.ndarray:
        return np.array([lk.t for lk in self.looks])


def replay(policy: Policy, truth: Truth, priors: Priors, seed: int = 0, p_d: float = 1.0,
           p_fa: float = 0.0, retune_s: float = 0.0, explain_every: int = 1) -> Trace:
    rx_rng, pol_rng = (np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(2))
    if hasattr(policy, "bind_truth"):
        policy.bind_truth(truth)
    policy.reset(Context(horizon_s=truth.horizon_s, rng=pol_rng, priors=priors))
    rx = Receiver(truth, rx_rng, p_d=p_d, p_fa=p_fa)

    looks, explanations = [], []
    t, prev, window_start = 0.0, None, 0.0
    while t < truth.horizon_s:
        a = policy.act(t)
        if not (0 <= a.centre < N_CENTRES) or a.dwell_s <= 0:
            raise ValueError(f"{policy.name}: invalid action {a}")
        a = Action(a.centre, min(a.dwell_s, truth.horizon_s - t), a.extend, a.stop_on_detect)
        contiguous = a.extend and prev == a.centre
        if not contiguous:
            window_start = t
        look = rx.observe(t, a, window_start=window_start if contiguous else None)
        spent = look.t + look.action.dwell_s - t          # actual time used this step (stop_on_detect may shorten it)
        policy.update(look)
        looks.append(look)
        if explain_every and len(looks) % explain_every == 0:
            ex = policy.explain()
            if ex:
                explanations.append((t, ex))
        retune = max(retune_s, getattr(policy, "retune_s", 0.0))
        t += spent + (retune if prev is not None and prev != a.centre else 0.0)
        prev = a.centre
    return Trace(policy=policy.name, scenario=truth.name, seed=seed, looks=looks,
                 explanations=explanations, logs=policy.logs)


__all__ = ["Trace", "replay", "DWELL_OPTIONS_S"]

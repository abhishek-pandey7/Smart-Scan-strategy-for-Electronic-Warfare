"""Reference schedulers: open-loop raster, random, hit-rate bandit, and a clairvoyant oracle."""

from __future__ import annotations

import numpy as np

from primes.core.types import (ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, DWELL_OPTIONS_S, N_CENTRES,
                               N_MIN_PULSES, RASTER_DWELL_S, Action, Look, Truth)
from primes.policies.base import Context, Policy


class Raster(Policy):
    """Open-loop sweep with the exact Turing dwell schedule (2.15 s cycle)."""

    name = "raster"

    def reset(self, ctx: Context) -> None:
        super().reset(ctx)
        self.i = 0

    def act(self, t: float) -> Action:
        a = Action(self.i % N_CENTRES, float(RASTER_DWELL_S[self.i % N_CENTRES]))
        self.i += 1
        return a


class RandomScan(Policy):
    name = "random"

    def act(self, t: float) -> Action:
        return Action(int(self.ctx.rng.integers(N_CENTRES)), 0.050)


class HitRateBandit(Policy):
    """Stationary bandit: favours centres that produced detections before (Beta posterior, ε-greedy)."""

    name = "greedy"

    def __init__(self, epsilon: float = 0.1):
        self.epsilon = epsilon

    def reset(self, ctx: Context) -> None:
        super().reset(ctx)
        self.hits = np.ones(N_CENTRES)
        self.looks = np.full(N_CENTRES, 2.0)

    def act(self, t: float) -> Action:
        rng = self.ctx.rng
        if rng.random() < self.epsilon:
            return Action(int(rng.integers(N_CENTRES)), 0.050)
        score = self.hits / self.looks + 1e-6 * rng.random(N_CENTRES)
        return Action(int(np.argmax(score)), 0.050)

    def update(self, look: Look) -> None:
        c = look.action.centre
        self.looks[c] += 1
        self.hits[c] += any(e >= 0 for e in look.detections)


class Oracle(Policy):
    """Clairvoyant greedy reference: sees future flashes and catches the soonest catchable ones.

    A strong heuristic upper reference, not a proven optimum.
    """

    name = "oracle"

    def bind_truth(self, truth: Truth) -> None:
        self.truth = truth

    def reset(self, ctx: Context) -> None:
        super().reset(ctx)
        rows = [(e, k, *fl[k]) for e, fl in self.truth.flashes.items() for k in range(len(fl))
                if e >= 0 and fl[k, 2] >= N_MIN_PULSES]
        arr = np.array(rows, dtype=float).reshape(-1, 6)
        self.f_em, self.f_k = arr[:, 0].astype(int), arr[:, 1].astype(int)
        self.f_start, self.f_end, self.f_freq = arr[:, 2], arr[:, 3], arr[:, 5]
        self.caught = np.zeros(len(arr), dtype=bool)
        self.toas = {e: self.truth.emitter_toas(e) for e in np.unique(self.f_em)}
        self.cover = np.abs(self.f_freq[:, None] - CENTRES_MHZ[None, :]) <= ACCEPT_HALF_WIDTH_MHZ
        self.caught |= ~self.cover.any(axis=1)          # outside receiver coverage: never catchable

    def _ready_time(self, idx: np.ndarray, t: float) -> np.ndarray:
        """Time by which N_MIN_PULSES of each flash will have arrived, starting to listen at t."""
        out = np.full(len(idx), np.inf)
        for j, i in enumerate(idx):
            toa = self.toas[self.f_em[i]]
            a = np.searchsorted(toa, max(t, self.f_start[i]))
            b = a + N_MIN_PULSES - 1
            if b < len(toa) and toa[b] <= self.f_end[i]:
                out[j] = toa[b]
        return out

    def act(self, t: float) -> Action:
        live = np.flatnonzero(~self.caught & (self.f_end >= t))
        if len(live) == 0:
            return Action(0, DWELL_OPTIONS_S[-1])
        soon = live[self.f_start[live] <= t + DWELL_OPTIONS_S[-1]]
        if len(soon):
            ready = self._ready_time(soon, t)
            best, best_score = None, 0.0
            for d in DWELL_OPTIONS_S:
                ok = soon[ready <= t + d]
                if len(ok) == 0:
                    continue
                counts = self.cover[ok].sum(axis=0)
                c = int(np.argmax(counts))
                if counts[c] / d > best_score:
                    best, best_score = Action(c, d), counts[c] / d
            if best is not None:
                return best
        nxt = live[np.argmin(self.f_start[live])]
        wait = max(self.f_start[nxt] - t, DWELL_OPTIONS_S[0])
        d = max([x for x in DWELL_OPTIONS_S if x <= wait] or [DWELL_OPTIONS_S[0]])
        return Action(int(np.flatnonzero(self.cover[nxt])[0]), d)

    def update(self, look: Look) -> None:
        for e, pulses in look.detections.items():
            sel = np.flatnonzero((self.f_em == e) & ~self.caught)
            for i in sel:
                if np.any((pulses >= self.f_start[i]) & (pulses <= self.f_end[i])):
                    self.caught[i] = True

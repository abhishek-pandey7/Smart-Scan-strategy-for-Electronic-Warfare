"""Gymnasium environment for training learned schedulers on randomised simulated scenarios."""

from __future__ import annotations

import gymnasium as gym
import numpy as np

from primes.core.types import ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES, Truth
from primes.data.priors import Priors
from primes.env.receiver import Receiver
from primes.env.scenarios import SIM_FAMILIES, make_scenario
from primes.rl.features import N_ACTIONS, OBS_DIM, ObsBuilder, decode_action

NEW_EMITTER_BONUS = 2.0          # same weighting as PRIMES (W_new = 2 per discovery, 1 per flash)


class ScanEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, priors: Priors, families=SIM_FAMILIES, horizon_s: float = 60.0,
                 seed_offset: int = 10_000, p_d: float = 1.0):
        self.priors, self.families, self.horizon = priors, tuple(families), horizon_s
        self.seed_offset, self.p_d = seed_offset, p_d
        self.observation_space = gym.spaces.Box(-1.0, 10.0, shape=(OBS_DIM,), dtype=np.float32)
        self.action_space = gym.spaces.Discrete(N_ACTIONS)
        self.episode = 0

    def _load(self, truth: Truth) -> None:
        self.truth = truth
        self.flashes = {}
        for e, fl in truth.flashes.items():
            coverable = np.abs(fl[:, 3:4] - CENTRES_MHZ[None, :]).min(axis=1) <= ACCEPT_HALF_WIDTH_MHZ
            self.flashes[e] = (fl[:, 0], (fl[:, 2] >= N_MIN_PULSES) & coverable)
        self.caught = {e: set() for e in truth.flashes}
        self.seen: set[int] = set()

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        truth = (options or {}).get("truth")
        if truth is None:
            fam = self.families[self.np_random.integers(len(self.families))]
            truth = make_scenario(fam, self.seed_offset + self.episode, self.priors, self.horizon)
        self.episode += 1
        self._load(truth)
        self.rx = Receiver(truth, np.random.default_rng(self.np_random.integers(2**31)), p_d=self.p_d)
        self.features = ObsBuilder(truth.horizon_s)
        self.t = 0.0
        return self.features.obs(0.0), {}

    def step(self, action: int):
        a = decode_action(int(action))
        a = type(a)(a.centre, min(a.dwell_s, self.truth.horizon_s - self.t))
        look = self.rx.observe(self.t, a)
        reward = 0.0
        for e, pulses in look.detections.items():
            if e < 0 or e not in self.flashes:
                continue
            starts, able = self.flashes[e]
            for k in np.unique(np.searchsorted(starts, pulses, side="right") - 1):
                if k >= 0 and able[k] and k not in self.caught[e]:
                    self.caught[e].add(int(k))
                    reward += 1.0
            if e not in self.seen:
                self.seen.add(e)
                reward += NEW_EMITTER_BONUS
        self.features.update(look)
        self.t += a.dwell_s
        done = self.t >= self.truth.horizon_s - 1e-9
        return self.features.obs(self.t), reward, done, False, {}

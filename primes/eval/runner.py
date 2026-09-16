"""Shared helpers to build scenarios and policies by name."""

from __future__ import annotations

from functools import lru_cache

from primes.core.types import Truth
from primes.data.priors import Priors
from primes.env.scenarios import SIM_FAMILIES, make_scenario
from primes.policies.base import Policy
from primes.policies.baselines import HitRateBandit, Oracle, RandomScan, Raster
from primes.policies.dqn import DEFAULT_MODEL
from primes.policies.primes_lite import PrimesLite

POLICY_INFO = {
    "raster": "Open-loop sweep, exact Turing schedule (2.15 s cycle)",
    "random": "Uniformly random centre, 50 ms dwells",
    "greedy": "Hit-rate bandit: revisits centres that produced detections",
    "dqn": "Double-DQN: model-free deep RL scheduler (published ML approach)",
    "primes": "PRIMES-lite: learned priors + periodic/Markov tracks + value-per-time index",
    "primes_flat": "PRIMES-lite ablation: flat (unlearned) period prior",
    "primes_no_ig": "PRIMES-lite ablation: no information-gain term",
    "primes_fprior": "PRIMES-lite variant: search seeded with the learned frequency distribution",
    "primes_no_micro": "PRIMES-lite ablation: no micro dwell controller (no 5 ms search looks)",
    "oracle": "Clairvoyant reference: sees the truth (upper bound)",
}

SCENARIO_INFO = {
    "easy": "8 fixed-frequency circular scanners",
    "lockout": "Emitters whose periods lock out the raster sweep (exact and near-commensurate)",
    "popup": "8 scanners plus 4 that appear mid-engagement",
    "dense": "40 emitters sampled from the learned Turing population",
    "mixed": "20 periodic scanners + 20 intermittent (on/off) emitters",
}


@lru_cache(maxsize=1)
def priors() -> Priors:
    return Priors.load_or_flat()


def available_policies() -> list[str]:
    names = list(POLICY_INFO)
    if not DEFAULT_MODEL.exists():
        names.remove("dqn")
    return names


def make_policy(name: str) -> Policy:
    if name == "raster":
        return Raster()
    if name == "random":
        return RandomScan()
    if name == "greedy":
        return HitRateBandit()
    if name == "oracle":
        return Oracle()
    if name == "primes":
        return PrimesLite()
    if name == "primes_flat":
        return PrimesLite(priors=Priors.flat(), name="primes_flat")
    if name == "primes_no_ig":
        return PrimesLite(use_info_gain=False, name="primes_no_ig")
    if name == "primes_fprior":
        return PrimesLite(use_freq_prior=True, name="primes_fprior")
    if name == "primes_no_micro":
        from primes.core.types import DWELL_OPTIONS_S
        return PrimesLite(micro_dwell=False, dwells_s=DWELL_OPTIONS_S, name="primes_no_micro")
    if name == "dqn":
        from primes.policies.dqn import DQNPolicy
        return DQNPolicy()
    raise ValueError(f"unknown policy {name!r}")


def load_scenario(scenario: str, seed: int) -> Truth:
    if scenario.startswith("turing:"):
        from primes.data.turing import load_stare
        return load_stare(int(scenario.split(":")[1]))
    if scenario not in SIM_FAMILIES:
        raise ValueError(f"unknown scenario {scenario!r}")
    return make_scenario(scenario, seed, priors())

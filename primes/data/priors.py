"""Emitter-population priors: learned from Turing metadata, or a flat fallback for ablation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

import numpy as np

from primes.core.types import N_MIN_PULSES

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "assets" / "priors.json"
PERIOD_RANGE_S = (0.5, 30.0)


def p_overlap(d: np.ndarray | float, w: np.ndarray, period: np.ndarray, min_overlap: np.ndarray):
    """P(a dwell of length d overlaps a flash of width w by >= min_overlap), phase uniform over period."""
    d = np.asarray(d, dtype=float)
    ok = min_overlap <= np.minimum(d, w)
    return np.where(ok, np.clip((d + w - 2 * min_overlap) / period, 0.0, 1.0), 0.0)


@dataclass
class Priors:
    name: str
    period_s: np.ndarray          # joint samples
    flash_s: np.ndarray
    pri_s: np.ndarray
    freqs_mhz: list[list[float]]
    freq_mode: list[str]
    emitters_per_scenario: float
    omni_fraction: float

    # ------------------------------------------------------------------ construction
    @classmethod
    def load(cls, path: str | Path = DEFAULT_PATH) -> "Priors":
        raw = json.loads(Path(path).read_text())
        s = raw["samples"]
        period = np.array([x["period_s"] for x in s])
        return cls(
            name="learned",
            period_s=period,
            flash_s=period * np.array([x["beamwidth_deg"] for x in s]) / 360.0,
            pri_s=np.array([x["pri_s"] for x in s]),
            freqs_mhz=[x["freqs_mhz"] for x in s],
            freq_mode=[x["freq_mode"] for x in s],
            emitters_per_scenario=float(np.mean(raw["emitters_per_scenario"])),
            omni_fraction=float(raw["omni_fraction"]),
        )

    @classmethod
    def flat(cls, n: int = 4000, seed: int = 0) -> "Priors":
        """Uninformed prior: log-uniform period, fixed typical flash and PRI."""
        rng = np.random.default_rng(seed)
        period = np.exp(rng.uniform(np.log(0.5), np.log(15.0), n))
        freqs = rng.uniform(500, 18000, n)
        return cls(name="flat", period_s=period, flash_s=np.full(n, 0.014), pri_s=np.full(n, 0.0005),
                   freqs_mhz=[[f] for f in freqs], freq_mode=["FixedSingle"] * n,
                   emitters_per_scenario=50.0, omni_fraction=0.0)

    @classmethod
    def load_or_flat(cls, path: str | Path = DEFAULT_PATH) -> "Priors":
        return cls.load(path) if Path(path).exists() else cls.flat()

    # ------------------------------------------------------------------ derived quantities
    @cached_property
    def median_flash_s(self) -> float:
        return float(np.median(self.flash_s))

    def p_detect_search(self, dwell_s: float, n_min: int = N_MIN_PULSES) -> float:
        """Chance a dwell detects an unknown emitter of this population, given it is in coverage."""
        return float(np.mean(p_overlap(dwell_s, self.flash_s, self.period_s, (n_min - 1) * self.pri_s)))

    def period_hypotheses(self, n_grid: int = 48, min_mass: float = 0.004) -> tuple[np.ndarray, np.ndarray]:
        """Discrete + continuous period hypotheses with prior weights (sum to 1).

        Scan rates cluster on a few values (e.g. 6, 12, 15, 30, 60 rpm), so each common
        period becomes its own hypothesis; the remaining mass is spread over a log grid.
        """
        lo, hi = PERIOD_RANGE_S
        p = self.period_s[(self.period_s >= lo) & (self.period_s <= hi)]
        vals, counts = np.unique(np.round(p, 4), return_counts=True)
        share = counts / len(p)
        discrete = share >= min_mass
        grid_edges = np.exp(np.linspace(np.log(lo), np.log(hi), n_grid + 1))
        rest = np.isin(np.round(p, 4), vals[~discrete])
        hist, _ = np.histogram(p[rest], bins=grid_edges)
        grid_w = (hist + 0.5) / (hist.sum() + 0.5 * n_grid) * (1.0 - share[discrete].sum())
        periods = np.r_[vals[discrete], np.sqrt(grid_edges[:-1] * grid_edges[1:])]
        weights = np.r_[share[discrete], grid_w]
        return periods, weights / weights.sum()

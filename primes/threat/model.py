"""Runtime threat estimation from a track's own observations."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

from primes.threat.features import feature_vector
from primes.threat.taxonomy import LEVELS, threat_weight

MODEL = Path(__file__).resolve().parents[1] / "assets" / "threat_model.joblib"


@lru_cache(maxsize=1)
def _load():
    if not MODEL.exists():
        return None
    from joblib import load
    return load(MODEL)


def available() -> bool:
    return _load() is not None


@lru_cache(maxsize=1)
def mean_weight() -> float:
    """Average priority weight over the training population, used to normalise weights to mean 1."""
    m = _load()
    prior = np.asarray(m["class_prior"]) if m and "class_prior" in m else np.array([13, 33, 22]) / 68
    return float(prior @ np.array([threat_weight(l) for l in LEVELS]))


def cluster_levels(values: np.ndarray, rel_tol: float = 0.03, min_share: float = 0.05) -> np.ndarray:
    """Group noisy measurements into distinct levels (e.g. the PRIs of a staggered train)."""
    v = np.sort(np.asarray(values, float))
    v = v[np.isfinite(v) & (v > 0)]
    if len(v) == 0:
        return v
    breaks = np.flatnonzero(np.diff(v) / v[:-1] > rel_tol) + 1
    groups = np.split(v, breaks)
    keep = [g for g in groups if len(g) >= max(1, min_share * len(v))]
    return np.array([np.median(g) for g in (keep or groups)])


def predict(freqs_mhz, pri_diffs_us, pws_us, period_s, flash_s) -> np.ndarray | None:
    """Class probabilities (low, medium, high) or None if no model is available."""
    m = _load()
    if m is None:
        return None
    fv = feature_vector(cluster_levels(freqs_mhz, rel_tol=0.001), cluster_levels(pri_diffs_us),
                        cluster_levels(pws_us), period_s, flash_s)
    return m["model"].predict_proba(fv[None, :])[0]


def expected_weight(probs: np.ndarray | None) -> float:
    """Priority weight normalised so that the average emitter weighs 1."""
    if probs is None:
        return 1.0
    return float(probs @ np.array([threat_weight(l) for l in LEVELS])) / mean_weight()

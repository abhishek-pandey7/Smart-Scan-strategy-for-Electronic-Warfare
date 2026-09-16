"""Pulse descriptor words (PDWs) as a real ES receiver reports them: no emitter labels.

Turing stare files already carry measured frequency, pulse width and angle of arrival with realistic
noise. Simulated scenarios have none, so each emitter gets a bearing and a pulse width, and every pulse
gets measurement noise. Generation is seeded from the scenario name, so it never disturbs the scenario's
own random stream and ideal-association runs are unchanged.
"""

from __future__ import annotations

import zlib

import numpy as np

from primes.core.types import Truth

AOA_NOISE_DEG = 2.0          # 1-sigma; Turing emitters show 0.5-5 deg
PW_NOISE_REL = 0.03
FREQ_NOISE_MHZ = 1.0


def pdw_features(truth: Truth) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(frequency MHz, pulse width µs, AoA deg) for every truth pulse, cached on the truth object."""
    cached = getattr(truth, "_pdw_cache", None)
    if cached is not None:
        return cached
    if truth.pw is not None and truth.aoa is not None:
        out = (truth.freq.astype(np.float64), truth.pw.astype(np.float64), truth.aoa.astype(np.float64))
    else:
        rng = np.random.default_rng(zlib.crc32(truth.name.encode()))
        ids = np.unique(truth.emitter)
        bearing = dict(zip(ids.tolist(), rng.uniform(-180.0, 180.0, len(ids))))
        width = dict(zip(ids.tolist(), np.exp(rng.uniform(np.log(0.2), np.log(30.0), len(ids)))))
        n = len(truth.toa)
        aoa = np.array([bearing[e] for e in truth.emitter.tolist()]) + rng.normal(0, AOA_NOISE_DEG, n)
        pw = np.array([width[e] for e in truth.emitter.tolist()]) * (1 + rng.normal(0, PW_NOISE_REL, n))
        freq = truth.freq.astype(np.float64) + rng.normal(0, FREQ_NOISE_MHZ, n)
        out = (freq, np.maximum(pw, 1e-3), (aoa + 180.0) % 360.0 - 180.0)
    object.__setattr__(truth, "_pdw_cache", out)
    return out

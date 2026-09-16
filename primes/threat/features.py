"""Observable emitter features for threat classification.

Only quantities an ES receiver can estimate from intercepted pulses are used: frequency set, pulse
repetition interval (PRI) set, pulse width (PW) set, scan period and main-beam flash width. Power,
position and platform speed are excluded (range-dependent or not directly observable).

Training features are generated from metadata with a measurement model (multiplicative noise and
randomly unobserved levels), so the classifier learns from the same kind of imperfect estimates the
scheduler produces online.
"""

from __future__ import annotations

import numpy as np

FEATURES = [
    "log_freq_ghz", "log1p_freq_span_mhz", "n_freqs",
    "log_pri_us", "pri_cv", "n_pri_levels",
    "log_pw_us", "log_pw_max_us", "n_pw_levels", "log_duty",
    "omni", "log_period_s", "log_flash_ms",
]


def feature_vector(freqs_mhz, pris_us, pws_us, period_s: float | None, flash_s: float | None) -> np.ndarray:
    """Features from (possibly partial, noisy) observed parameter sets."""
    f = np.asarray(freqs_mhz, float)
    pri = np.asarray(pris_us, float)
    pw = np.asarray(pws_us, float)
    pri_mean = float(pri.mean()) if len(pri) else np.nan
    pw_mean = float(pw.mean()) if len(pw) else np.nan
    omni = period_s is None or not np.isfinite(period_s) or period_s <= 0
    return np.array([
        np.log(max(f.mean() / 1000.0, 1e-3)) if len(f) else np.nan,
        np.log1p(f.max() - f.min()) if len(f) else np.nan,
        float(len(np.unique(np.round(f, 0)))) if len(f) else np.nan,
        np.log(max(pri_mean, 1e-3)) if len(pri) else np.nan,
        float(pri.std() / pri_mean) if len(pri) > 1 and pri_mean > 0 else 0.0,
        float(len(np.unique(np.round(pri, 1)))) if len(pri) else np.nan,
        np.log(max(pw_mean, 1e-4)) if len(pw) else np.nan,
        np.log(max(float(pw.max()), 1e-4)) if len(pw) else np.nan,
        float(len(np.unique(np.round(pw, 3)))) if len(pw) else np.nan,
        np.log(max(pw_mean / pri_mean, 1e-6)) if len(pw) and len(pri) and pri_mean > 0 else np.nan,
        1.0 if omni else 0.0,
        np.nan if omni else np.log(period_s),
        np.nan if omni or flash_s is None else np.log(max(flash_s * 1e3, 1e-3)),
    ])


def observe(emitter: dict, rng: np.random.Generator, noise: float = 0.05, keep: float = 0.8) -> np.ndarray:
    """Simulate what a receiver would estimate for this emitter after a handful of intercepts."""
    def partial(values, sigma):
        v = np.asarray(values, float)
        if len(v) == 0:
            return v
        mask = rng.random(len(v)) < keep
        if not mask.any():
            mask[rng.integers(len(v))] = True
        return v[mask] * np.exp(rng.normal(0.0, sigma, mask.sum()))

    freqs = np.asarray(emitter["freqs_mhz"], float)
    freqs = freqs[rng.random(len(freqs)) < keep] if len(freqs) > 1 else freqs
    if len(freqs) == 0:
        freqs = np.asarray(emitter["freqs_mhz"][:1], float)
    freqs = freqs + rng.normal(0.0, 1.0, len(freqs))

    circular = emitter["scan_type"] == "Circular" and emitter["rpm"] > 0
    period = 60.0 / emitter["rpm"] * np.exp(rng.normal(0.0, noise)) if circular else None
    flash = period * emitter["beamwidth_deg"] / 360.0 * np.exp(rng.normal(0.0, 2 * noise)) if circular else None
    return feature_vector(freqs, partial(emitter["pris_us"], noise), partial(emitter["pws_us"], noise), period, flash)

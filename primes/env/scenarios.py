"""Scenario generation: simulated emitter families and Turing stare-mode files."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from primes.core.types import (ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_CENTRES, RASTER_DWELL_S,
                               EmitterInfo, Truth)
from primes.data.priors import Priors
from primes.threat.taxonomy import threat_level

SIM_FAMILIES = ("easy", "lockout", "popup", "dense", "mixed")
MAX_PULSES_PER_FLASH = 200


@dataclass
class EmitterSpec:
    id: int
    kind: str                 # "circular" | "omni" | "markov"
    freqs_mhz: list[float]
    freq_mode: str = "FixedSingle"
    period_s: float = 4.0
    flash_s: float = 0.014
    phase_s: float = 0.0
    pri_s: float = 0.001
    appear_s: float = 0.0
    label: str = ""
    role: str = ""
    threat: str = ""
    mean_on_s: float = 1.0    # markov emitters: mean visible / invisible durations
    mean_off_s: float = 3.0


def _pulses(spec: EmitterSpec, horizon: float, rng: np.random.Generator):
    if spec.kind == "markov":
        pri = max(spec.pri_s, 0.001)
        toas, t, on = [], spec.appear_s, bool(rng.random() < spec.mean_on_s / (spec.mean_on_s + spec.mean_off_s))
        while t < horizon:
            dur = rng.exponential(spec.mean_on_s if on else spec.mean_off_s)
            if on:
                toas.append(np.arange(t, min(t + dur, horizon), pri))
            t, on = t + dur, not on
        toa = np.concatenate(toas) if toas else np.empty(0)
        return toa, np.full(len(toa), spec.freqs_mhz[0])
    if spec.kind == "omni":
        pri = max(spec.pri_s, 0.001)
        toa = np.arange(spec.appear_s, horizon, pri)
        return toa, np.full(len(toa), spec.freqs_mhz[0])

    pri = max(spec.pri_s, spec.flash_s / MAX_PULSES_PER_FLASH)
    k0 = int(np.ceil((spec.appear_s - spec.phase_s) / spec.period_s))
    k1 = int(np.floor((horizon - spec.phase_s) / spec.period_s))
    offsets = np.arange(0.0, spec.flash_s, pri)
    toas, freqs = [], []
    for k in range(max(k0, 0), k1 + 1):
        start = spec.phase_s + k * spec.period_s
        t = start + offsets + rng.normal(0.0, 0.01 * pri, len(offsets))
        if spec.freq_mode in ("HoppingLinear", "HoppingSawtooth", "RandomFixed", "RandomRange"):
            f = [spec.freqs_mhz[k % len(spec.freqs_mhz)]] if spec.freq_mode.startswith("Hopping") \
                else [spec.freqs_mhz[rng.integers(len(spec.freqs_mhz))]]
        elif spec.freq_mode == "FixedMultiSimultaneous":
            f = spec.freqs_mhz
        else:
            f = spec.freqs_mhz[:1]
        for fi in f:
            toas.append(t)
            freqs.append(np.full(len(t), fi))
    if not toas:
        return np.empty(0), np.empty(0)
    return np.concatenate(toas), np.concatenate(freqs)


def build_truth(name: str, specs: list[EmitterSpec], horizon: float, rng: np.random.Generator) -> Truth:
    toa, freq, emitter = [], [], []
    for s in specs:
        t, f = _pulses(s, horizon, rng)
        keep = (t >= 0) & (t < horizon)
        toa.append(t[keep]); freq.append(f[keep]); emitter.append(np.full(keep.sum(), s.id))
    toa, freq, emitter = np.concatenate(toa), np.concatenate(freq), np.concatenate(emitter)
    order = np.argsort(toa, kind="stable")
    infos = [EmitterInfo(id=s.id, kind=s.kind, freqs_mhz=list(s.freqs_mhz),
                         period_s=s.period_s if s.kind == "circular" else None,
                         flash_s=s.flash_s if s.kind == "circular" else None,
                         appear_s=s.appear_s, label=s.label, role=s.role, threat=s.threat) for s in specs]
    return Truth(name=name, horizon_s=horizon, toa=toa[order], freq=freq[order].astype(np.float32),
                 emitter=emitter[order].astype(np.int32), emitters=infos)


# ---------------------------------------------------------------------- raster geometry
def raster_windows(freq_mhz: float) -> list[tuple[float, float]]:
    """Time windows (within one 2.15 s cycle) when the raster schedule covers `freq_mhz`, merged."""
    edges = np.r_[0.0, np.cumsum(RASTER_DWELL_S)]
    cover = np.flatnonzero(np.abs(CENTRES_MHZ - freq_mhz) <= ACCEPT_HALF_WIDTH_MHZ)
    windows = sorted((edges[i], edges[i + 1]) for i in cover)
    merged: list[list[float]] = []
    for a, b in windows:
        if merged and a <= merged[-1][1] + 1e-9:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [tuple(w) for w in merged]


def largest_raster_gap(freq_mhz: float) -> tuple[float, float]:
    """(start, length) of the longest stretch of the raster cycle that does not cover `freq_mhz`."""
    cycle = float(RASTER_DWELL_S.sum())
    w = raster_windows(freq_mhz)
    gaps = [(w[i][1], (w[(i + 1) % len(w)][0] - w[i][1]) % cycle) for i in range(len(w))]
    return max(gaps, key=lambda g: g[1])


# ---------------------------------------------------------------------- families
def _sample_population(priors: Priors, n: int, rng: np.random.Generator, first_id: int = 0,
                       max_period: float = 60.0) -> list[EmitterSpec]:
    specs = []
    while len(specs) < n:
        if rng.random() < priors.omni_fraction:
            specs.append(EmitterSpec(id=first_id + len(specs), kind="omni",
                                     freqs_mhz=[float(rng.uniform(500, 18000))],
                                     pri_s=float(rng.choice(priors.pri_s)), label="omni"))
            continue
        i = rng.integers(len(priors.period_s))
        if priors.period_s[i] > max_period:
            continue
        specs.append(EmitterSpec(
            id=first_id + len(specs), kind="circular", freqs_mhz=list(priors.freqs_mhz[i]),
            freq_mode=priors.freq_mode[i], period_s=float(priors.period_s[i]),
            flash_s=float(max(priors.flash_s[i], 2e-4)), pri_s=float(priors.pri_s[i]),
            phase_s=float(rng.uniform(0, priors.period_s[i])), label="population",
            threat=threat_level(priors.function[i]) if priors.function else ""))
    return specs


def _easy_specs(rng: np.random.Generator, n: int = 8, first_id: int = 0) -> list[EmitterSpec]:
    periods = rng.choice([1.0, 2.0, 2.5, 4.0, 5.0, 6.0, 8.0], n)
    centres = rng.choice(N_CENTRES, n, replace=False)
    return [EmitterSpec(id=first_id + i, kind="circular",
                        freqs_mhz=[float(CENTRES_MHZ[c] + rng.uniform(-200, 200))],
                        period_s=float(T), flash_s=float(T * rng.uniform(1.0, 3.0) / 360.0),
                        pri_s=float(rng.uniform(0.0005, 0.002)), phase_s=float(rng.uniform(0, T)),
                        label=f"scanner T={T:g}s")
            for i, (T, c) in enumerate(zip(periods, centres))]


def make_scenario(family: str, seed: int, priors: Priors, horizon: float = 60.0) -> Truth:
    rng = np.random.default_rng([seed, SIM_FAMILIES.index(family) if family in SIM_FAMILIES else 99])

    if family == "easy":
        specs = _easy_specs(rng)

    elif family == "popup":
        specs = _easy_specs(rng, n=8)
        for s in _easy_specs(rng, n=4, first_id=8):
            s.appear_s = float(rng.uniform(10.0, 40.0))
            s.phase_s = s.appear_s + float(rng.uniform(0, s.period_s))
            s.role, s.label = "popup", f"pop-up T={s.period_s:g}s"
            specs.append(s)

    elif family == "lockout":
        cycle = float(RASTER_DWELL_S.sum())
        centres = rng.choice(np.arange(2, N_CENTRES - 2), 6, replace=False)
        specs = []
        for i, c in enumerate(centres):
            f = float(CENTRES_MHZ[c] + rng.uniform(-150, 150))
            flash = 0.014
            gap_start, gap_len = largest_raster_gap(f)
            if i < 2:      # exactly commensurate: flash parked mid-gap every cycle
                T, phase, role = cycle, (gap_start + (gap_len - flash) / 2) % cycle, "lockout-exact"
            elif i < 4:    # near-commensurate: starts just after coverage and drifts away slowly
                T, phase, role = cycle + 0.05, (gap_start + 0.005) % cycle, "lockout-near"
            else:
                T = float(rng.choice([3.0, 4.0, 5.0])); phase, role = float(rng.uniform(0, T)), "regular"
            specs.append(EmitterSpec(id=i, kind="circular", freqs_mhz=[f], period_s=T, flash_s=flash,
                                     pri_s=0.001, phase_s=phase, role=role, label=f"{role} T={T:.2f}s"))

    elif family == "dense":
        specs = _sample_population(priors, 40, rng)

    elif family == "mixed":
        specs = _sample_population(priors, 20, rng)
        for i in range(20):
            on, off = float(rng.choice([0.5, 1.5, 5.0])), float(rng.choice([1.5, 5.0, 15.0]))
            specs.append(EmitterSpec(id=20 + i, kind="markov", freqs_mhz=[float(rng.uniform(500, 18000))],
                                     pri_s=0.002, mean_on_s=on, mean_off_s=off, role="intermittent",
                                     label=f"intermittent on={on:g}s off={off:g}s"))

    else:
        raise ValueError(f"unknown scenario family {family!r}")

    return build_truth(f"{family}#{seed}", specs, horizon, rng)

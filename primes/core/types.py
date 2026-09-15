"""Shared data types and receiver constants for the PRIMES prototype."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Receiver geometry replicates the Turing Scan-Mode receiver (see docs/DATASET_NOTES.md).
N_CENTRES = 36
CENTRES_MHZ = 250.0 + 500.0 * np.arange(N_CENTRES)
ACCEPT_HALF_WIDTH_MHZ = 500.0
DWELL_OPTIONS_S = (0.010, 0.025, 0.050, 0.100)
N_MIN_PULSES = 3                     # pulses needed inside one dwell to declare a detection
FLASH_GAP_S = 0.050                  # pulses further apart than this belong to different flashes
MAX_SEGMENT_S = 0.250                # long illuminations (omni, wide beams) are scored in segments

# Exact Turing raster dwell times, in centre order: 36 dwells, 2.15 s cycle.
RASTER_DWELL_S = np.array([0.10, 0.10, 0.05, 0.05, 0.05, 0.05, 0.10, 0.10,
                           *[0.05] * 9, 0.10, 0.10, 0.10, *[0.05] * 16])


def covering_centres(freq_mhz: float) -> np.ndarray:
    """Indices of dwell centres whose acceptance window contains `freq_mhz`."""
    return np.flatnonzero(np.abs(CENTRES_MHZ - freq_mhz) <= ACCEPT_HALF_WIDTH_MHZ)


@dataclass(frozen=True)
class Action:
    centre: int
    dwell_s: float


@dataclass
class Look:
    t: float
    action: Action
    detections: dict[int, np.ndarray]    # emitter id -> received pulse ToAs (s); id -1 is a false alarm


@dataclass
class EmitterInfo:
    id: int
    kind: str                            # "circular" | "omni"
    freqs_mhz: list[float]
    period_s: float | None = None
    flash_s: float | None = None
    appear_s: float = 0.0
    label: str = ""
    role: str = ""                       # scenario-specific tag, e.g. "lockout-exact"


@dataclass
class Truth:
    """Pulse-level ground truth. Hidden from schedulers; used by the receiver and the metrics."""

    name: str
    horizon_s: float
    toa: np.ndarray                      # float64, sorted
    freq: np.ndarray                     # float32
    emitter: np.ndarray                  # int32
    emitters: list[EmitterInfo]
    flashes: dict[int, np.ndarray] = field(default_factory=dict)   # id -> (k, 4): start, end, n_pulses, freq

    def __post_init__(self) -> None:
        if not self.flashes:
            self.flashes = build_flashes(self.toa, self.freq, self.emitter)

    def emitter_toas(self, emitter_id: int) -> np.ndarray:
        return self.toa[self.emitter == emitter_id]


def build_flashes(toa: np.ndarray, freq: np.ndarray, emitter: np.ndarray) -> dict[int, np.ndarray]:
    """Split each emitter's pulses into flashes (gap > FLASH_GAP_S), chunking long ones."""
    out: dict[int, np.ndarray] = {}
    for e in np.unique(emitter):
        sel = emitter == e
        t, f = toa[sel], freq[sel]
        if len(t) == 0:
            continue
        cuts = np.flatnonzero(np.diff(t) > FLASH_GAP_S) + 1
        rows = []
        for a, b in zip(np.r_[0, cuts], np.r_[cuts, len(t)]):
            ts, fs = t[a:b], f[a:b]
            # chunk long illuminations so a continuously visible emitter is not a single "flash"
            seg = np.floor((ts - ts[0]) / MAX_SEGMENT_S).astype(int)
            for s in np.unique(seg):
                m = seg == s
                rows.append((ts[m][0], ts[m][-1], m.sum(), float(np.median(fs[m]))))
        out[int(e)] = np.array(rows, dtype=float)
    return out

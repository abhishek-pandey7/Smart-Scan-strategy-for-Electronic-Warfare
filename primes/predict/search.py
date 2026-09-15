"""Belief over emitters not yet discovered, per 250 MHz cell (Poisson thinning + pop-up hazard).

The per-look chance of detecting an undiscovered emitter starts from the learned population prior
(short main-beam flashes) and is rescaled online by a visibility factor kappa, estimated from how
often looks actually discover new emitters:

    kappa = (discoveries + A) / (sum over looks of expected discoveries under the prior + A)

so a population that is visible far more often than its metadata suggests (e.g. sidelobes) is
recognised within a few seconds of search.
"""

from __future__ import annotations

import numpy as np

from primes.core.types import ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, DWELL_OPTIONS_S
from primes.data.priors import Priors

N_CELLS = 72
CELL_CENTRES_MHZ = 125.0 + 250.0 * np.arange(N_CELLS)
VISIBLE_FRACTION = 0.6          # share of listed emitters that are ever interceptable (Turing stare data)
PSEUDO_EXPOSURE = 2.0           # prior strength of kappa = 1, in expected discoveries
KAPPA_RANGE = (0.5, 100.0)
MAX_P_DETECT = 0.9


class UndiscoveredBelief:
    def __init__(self, priors: Priors, popup_rate_per_s: float = 0.05):
        self.m = np.full(N_CELLS, VISIBLE_FRACTION * priors.emitters_per_scenario / N_CELLS)
        self.rho = popup_rate_per_s / N_CELLS
        self.cover = (np.abs(CELL_CENTRES_MHZ[None, :] - CENTRES_MHZ[:, None]) < ACCEPT_HALF_WIDTH_MHZ).astype(float)
        self.p_prior = np.array([priors.p_detect_search(d) for d in DWELL_OPTIONS_S])
        self.discoveries = 0.0
        self.exposure = 0.0
        self.t = 0.0

    @property
    def kappa(self) -> float:
        k = (self.discoveries + PSEUDO_EXPOSURE) / (self.exposure + PSEUDO_EXPOSURE)
        return float(np.clip(k, *KAPPA_RANGE))

    def p_detect(self) -> np.ndarray:
        return np.minimum(self.p_prior * self.kappa, MAX_P_DETECT)

    def advance(self, t: float) -> None:
        self.m += self.rho * max(t - self.t, 0.0)
        self.t = t

    def observe(self, centre: int, dwell_s: float, new_emitters: int) -> None:
        """Update after a look: learn kappa from discoveries, then thin undiscovered emitters in its cells."""
        prior_p = float(np.interp(dwell_s, DWELL_OPTIONS_S, self.p_prior))
        in_cover = float(self.cover[centre] @ self.m)
        self.exposure += in_cover * prior_p
        self.discoveries += new_emitters
        p = min(prior_p * self.kappa, MAX_P_DETECT)
        self.m *= 1.0 - p * self.cover[centre]

    def value(self) -> np.ndarray:
        """(centres, dwell options): expected number of new discoveries."""
        return (self.cover @ self.m)[:, None] * self.p_detect()[None, :]

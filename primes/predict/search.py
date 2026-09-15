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
    def __init__(self, priors: Priors, popup_rate_per_s: float = 0.05, use_freq_prior: bool = False):
        # The learned frequency density (78 % of emitters in 12 of 72 cells) is available but off by
        # default: within a 30-60 s engagement it over-focuses search on the hot bands and starves the
        # rest (measured: Turing discovery +4 pts but interception -3 pts). Kept as an ablation.
        density = priors.cell_density(N_CELLS) if use_freq_prior else np.full(N_CELLS, 1.0 / N_CELLS)
        self.m = VISIBLE_FRACTION * priors.emitters_per_scenario * density
        self.rho = popup_rate_per_s * density
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

    def observe(self, centre: int, dwell_s: float, new_freqs_mhz: list[float]) -> None:
        """Update after a look: learn kappa from discoveries, then thin the undiscovered mass in the
        covered cells. Undiscovered emitters are a Poisson count, so a discovery does *not* lower the
        expected number still hidden (independent increments); subtracting one per discovery was tried
        and measured worse (easy 65.5% -> 57.6%). Only the look-based thinning is a valid update."""
        prior_p = float(np.interp(dwell_s, DWELL_OPTIONS_S, self.p_prior))
        in_cover = float(self.cover[centre] @ self.m)
        self.exposure += in_cover * prior_p
        self.discoveries += len(new_freqs_mhz)
        p = min(prior_p * self.kappa, MAX_P_DETECT)
        self.m *= 1.0 - p * self.cover[centre]

    def value(self) -> np.ndarray:
        """(centres, dwell options): expected number of new discoveries."""
        return (self.cover @ self.m)[:, None] * self.p_detect()[None, :]

"""Per-emitter temporal model: a weighted bank of periodic-flash hypotheses plus a continuous one.

A flash of emitter e starts at  s_k = phi + k*T  and lasts  w.
Evidence is interval-censored:
  * a detection yields a flash-start *anchor* (tight when the flash start is inside the dwell,
    inferred with larger uncertainty when the dwell clipped it);
  * a look that covered the emitter's frequency without detecting it lowers every hypothesis that
    predicted a flash inside that dwell.

A second model class, a Gilbert–Elliott on/off Markov bank (see markov.py), covers emitters that
are intermittently visible for long stretches. The two classes compete through log-odds updated
with the Bayes factor of every new-flash hit and every miss.
"""

from __future__ import annotations

import numpy as np

from primes.core.types import ACCEPT_HALF_WIDTH_MHZ, CENTRES_MHZ, N_MIN_PULSES
from primes.data.priors import N_GRID, PERIOD_RANGE_S, Priors
from primes.predict.markov import MarkovBank

P_D_MODEL = 0.95            # detection probability assumed by the scheduler
MISS_FLOOR = 0.05           # a single miss never fully vetoes a hypothesis (P_d < 1, timing noise)
HIT_FLOOR = 0.02
SAME_FLASH_S = 0.05
MAX_HYPOTHESES = 64
RESOLVE_FRACTION = 0.8      # share of an emitter's future flashes we expect to catch once its period is pinned down
MAX_FUTURE_FLASHES = 30.0
CONFIDENT = 0.6             # posterior weight above which a track's next flash is treated as an appointment
MIN_UNCERTAINTY_S = 0.0005
PRE_DETECTION_S = 10.0       # misses this long before a first detection still count as evidence
P_FA_ASSUMED = 0.01          # per-look false-alarm rate assumed when weighing whether a track is real
EXIST_PRIOR_LOGODDS = 1.4    # a single unconfirmed detection is real with probability ~0.8; a 2nd catch confirms
DEAD_BELOW = 0.1             # tracks below this existence probability are dropped from scheduling (revived by a hit)
REL_BIN = (PERIOD_RANGE_S[1] / PERIOD_RANGE_S[0]) ** (1 / N_GRID) - 1


def overlap_prob(t: float, d: np.ndarray, start: np.ndarray, u: np.ndarray, w: float, L: float) -> np.ndarray:
    """P(dwell [t, t+d] overlaps a flash of width w by >= L) with flash start ~ U[start-u, start+u]."""
    lo = np.maximum(t - w + L, start - u)
    hi = np.minimum(t + d - L, start + u)
    return np.minimum(np.maximum((hi - lo) / (2.0 * u), 0.0), 1.0) * (L <= np.minimum(d, w))


def binary_entropy(p: np.ndarray) -> np.ndarray:
    p = np.minimum(np.maximum(p, 1e-9), 1 - 1e-9)
    return -(p * np.log2(p) + (1 - p) * np.log2(1 - p))


def _softmax(lw: np.ndarray) -> np.ndarray:
    if len(lw) == 0:
        return lw
    e = np.exp(lw - lw.max())
    return e / e.sum()


class Track:
    def __init__(self, emitter_id: int, priors: Priors):
        self.id = emitter_id
        self.priors = priors
        self.anchors: list[float] = []
        self.anchor_sigma: list[float] = []
        self.flash_freqs: list[float] = []
        self.full_widths: list[float] = []
        self.partial_width = 0.0
        self._width = min(priors.median_flash_s, 0.05)
        self.pri = 0.001
        self.last_hit = -np.inf
        self.n_hits = 0
        self.cover = np.zeros(len(CENTRES_MHZ))
        self.markov: MarkovBank | None = None
        self.log_odds_markov = 0.0                      # neutral prior between the two classes
        self.hit_looks: set[int] = set()
        # observables for threat estimation (bounded buffers)
        self.pri_obs: list[float] = []        # µs, pulse-to-pulse intervals within detections
        self.pw_obs: list[float] = []         # µs
        self.threat_probs: np.ndarray | None = None
        # Existence: log-odds that this track is a real emitter rather than a false alarm. Every
        # unexplained miss lowers it (a phantom never re-appears); every catch raises it.
        self.log_odds_exist = EXIST_PRIOR_LOGODDS
        self.first_hit = np.inf
        self._next_relevant = -np.inf
        self._set_bank(*(np.empty(0),) * 7)

    # ------------------------------------------------------------------ state helpers
    def _set_bank(self, T, phi, k_ref, var_phi, var_T, cov, logw) -> None:
        self.T, self.phi, self.k_ref = T, phi, k_ref
        self.var_phi, self.var_T, self.cov, self.logw = var_phi, var_T, cov, logw
        self._next_relevant = -np.inf

    def relevant(self, t: float, horizon: float) -> bool:
        """False only if no periodic hypothesis can place a new flash in [t, t + horizon] and the
        continuous class is negligible. Cached until t reaches the next possible flash."""
        if self.markov is not None and self.p_markov * self.markov.belief_at(t).max() > 1e-3:
            return True
        if len(self.T) == 0:
            return False
        if t + horizon < self._next_relevant:
            return False
        after = self.last_hit + max(self.width, SAME_FLASH_S)
        k = np.floor((t - self.phi) / self.T)
        start, u = self.phi + k * self.T, self._uncertainty(k)
        if np.any((start + self.width + u > t) & (start > after)):
            self._next_relevant = t
            return True
        nxt = self.phi + (k + 1) * self.T
        cand = np.where(nxt > after, nxt - self._uncertainty(k + 1), np.inf)
        self._next_relevant = float(cand.min()) - self.width
        return t + horizon >= self._next_relevant

    def update_threat(self) -> None:
        """Re-estimate threat class probabilities from this track's own observations."""
        from primes.threat.model import predict
        T, _, _ = self.best()
        periodic = np.isfinite(T)
        self.threat_probs = predict(self.flash_freqs, self.pri_obs, self.pw_obs,
                                    T if periodic else None, self.width if periodic else None)

    @property
    def threat_weight(self) -> float:
        from primes.threat.model import expected_weight
        return expected_weight(self.threat_probs)

    @property
    def p_exist(self) -> float:
        return float(1.0 / (1.0 + np.exp(-np.clip(self.log_odds_exist, -30.0, 30.0))))

    @property
    def dead(self) -> bool:
        return self.p_exist < DEAD_BELOW

    @property
    def p_markov(self) -> float:
        if self.markov is None:
            return 0.0
        return float(1.0 / (1.0 + np.exp(-np.clip(self.log_odds_markov, -50.0, 50.0))))

    @property
    def model(self) -> str:
        T, _, _ = self.best()
        return "periodic" if np.isfinite(T) else "intermittent"

    @property
    def width(self) -> float:
        return self._width

    def _update_width(self) -> None:
        if self.full_widths:
            self._width = float(np.median(self.full_widths))
        else:
            self._width = max(self.partial_width, min(self.priors.median_flash_s, 0.05))

    @property
    def min_overlap(self) -> float:
        return (N_MIN_PULSES - 1) * self.pri

    @property
    def reliable_dwell(self) -> float:
        """Shortest dwell that reliably contains N_MIN_PULSES of this emitter's pulse train."""
        return N_MIN_PULSES * self.pri * 1.5 + 1e-4

    def best(self) -> tuple[float, float, float]:
        """(period, phase, posterior weight) of the MAP hypothesis; period is inf if continuous wins."""
        pm = self.p_markov
        w = _softmax(self.logw) * (1 - pm)
        if len(w) == 0 or pm >= w.max():
            return np.inf, (self.anchors[-1] if self.anchors else 0.0), pm
        i = int(np.argmax(w))
        return float(self.T[i]), float(self.phi[i]), float(w[i])

    def next_flash(self, t_now: float) -> float | None:
        T, phi, _ = self.best()
        if not np.isfinite(T):
            return None
        return float(phi + np.ceil((t_now - phi) / T) * T)

    # ------------------------------------------------------------------ hypothesis bank
    def _uncertainty(self, k: np.ndarray) -> np.ndarray:
        dk = k - self.k_ref
        var = self.var_phi + dk ** 2 * self.var_T + 2 * dk * self.cov
        return np.sqrt(np.maximum(var, 0.0)) + MIN_UNCERTAINTY_S

    def _flash_prob(self, t: float, d: np.ndarray, after: float | None = None) -> np.ndarray:
        """(n_hyp, n_dwell): probability each periodic hypothesis puts a flash starting after
        `after` (default: the flash already caught) inside [t, t+d]."""
        if len(self.T) == 0:
            return np.zeros((0, len(d)))
        after = self.last_hit + max(self.width, SAME_FLASH_S) if after is None else after
        k1 = np.floor((t - self.phi) / self.T)
        out = np.zeros((len(self.T), len(d)))
        for dk in (0.0, 1.0):
            k = k1 + dk
            start = self.phi + k * self.T
            p = overlap_prob(t, d[None, :], start[:, None], self._uncertainty(k)[:, None],
                             self.width, self.min_overlap)
            out += p * (start > after)[:, None]
        return np.minimum(out, 1.0)

    def _init_from_prior(self, anchor: float, sigma: float) -> None:
        periods, prior, n_disc = self.priors.hypotheses
        n = len(periods)
        discrete = np.arange(n) < n_disc
        var_T = np.where(discrete, (0.001 * periods) ** 2, (REL_BIN * periods) ** 2 / 3)
        self._set_bank(periods.astype(float), np.full(n, anchor), np.zeros(n), np.full(n, sigma ** 2),
                       var_T, np.zeros(n), np.log(prior))

    def _log_prior(self, T: np.ndarray) -> np.ndarray:
        periods, prior, n_disc = self.priors.hypotheses
        grid_T, grid_p = periods[n_disc:], prior[n_disc:]
        j = np.clip(np.searchsorted(np.log(grid_T), np.log(T)), 0, len(grid_T) - 1)
        cont = np.log(grid_p[j] * 0.01 / REL_BIN + 1e-12)          # density over a 1 % period cell
        if n_disc == 0:
            return cont
        rel = np.abs(T[:, None] / periods[None, :n_disc] - 1.0)
        near = rel.min(axis=1) < 0.005
        disc = np.log(prior[:n_disc][rel.argmin(axis=1)])
        return np.where(near, np.maximum(disc, cont), cont)

    def _refit(self, looks) -> None:
        """Regenerate periodic hypotheses from all anchors (>= 2), then re-apply miss evidence."""
        a = np.array(self.anchors); s = np.array(self.anchor_sigma)
        order = np.argsort(a); a, s = a[order], s[order]
        wts = 1.0 / (s ** 2 + 1e-6)
        cands = set()
        for i, j in {(0, len(a) - 1), (len(a) - 2, len(a) - 1)}:
            gap = a[j] - a[i]
            for k in range(1, int(gap / PERIOD_RANGE_S[0]) + 1):
                if gap / k <= PERIOD_RANGE_S[1]:
                    cands.add(gap / k)

        rows = []
        for T0 in sorted(cands):
            k = np.round((a - a[0]) / T0)
            if len(np.unique(k)) < len(a):          # two anchors mapped onto the same flash
                continue
            X = np.c_[np.ones(len(a)), k]
            XtW = X.T * wts
            C = np.linalg.pinv(XtW @ X)
            phi, T = C @ (XtW @ a)
            resid = a - (phi + k * T)
            if T <= 0 or np.any(np.abs(resid) > 3 * s + 0.003):
                continue
            kr = float(np.round(np.average(k, weights=wts)))
            rows.append((T, phi + kr * T,                                   # phase at reference flash
                         C[0, 0] + 2 * kr * C[0, 1] + kr ** 2 * C[1, 1],    # var(phi_ref)
                         max(C[1, 1], 1e-10), C[0, 1] + kr * C[1, 1],       # var(T), cov(phi_ref, T)
                         float(np.sum(resid ** 2 * wts))))

        if not rows:        # no periodic explanation of every anchor: restart from the latest flash
            self._init_from_prior(self.anchors[-1], self.anchor_sigma[-1])
            self._apply_misses(looks, since=self.anchors[-1] - PRE_DETECTION_S)
            return

        R = np.array(sorted(rows, key=lambda r: r[5]))
        keep = []
        for r in R:
            if all(abs(r[0] / q[0] - 1) >= 0.002 for q in keep):
                keep.append(r)
        R = np.array(keep)
        self._set_bank(R[:, 0], R[:, 1], np.zeros(len(R)), R[:, 2], R[:, 3], R[:, 4],
                       self._log_prior(R[:, 0]) - 0.5 * R[:, 5])
        self._apply_misses(looks, since=self.anchors[0] - 2.0)
        self._prune()

    def _apply_misses(self, looks, since: float) -> None:
        """Vectorised miss evidence from past looks. `looks` = (t, d, centre) arrays."""
        t, d, c = looks
        if len(t) == 0 or len(self.T) == 0:
            return
        idx = np.flatnonzero((t >= since) & (self.cover[c] > 0))
        idx = idx[~np.isin(idx, list(self.hit_looks))]
        if len(idx) == 0:
            return
        t, d, cw = t[idx][None, :], d[idx][None, :], self.cover[c[idx]][None, :]
        T, phi = self.T[:, None], self.phi[:, None]
        p = np.zeros((len(self.T), len(idx)))
        k1 = np.floor((t - phi) / T)
        for dk in (0.0, 1.0):
            k = k1 + dk
            dkr = k - self.k_ref[:, None]
            u = np.sqrt(np.maximum(self.var_phi[:, None] + dkr ** 2 * self.var_T[:, None]
                                   + 2 * dkr * self.cov[:, None], 0.0)) + MIN_UNCERTAINTY_S
            p += overlap_prob(t, d, phi + k * T, u, self.width, self.min_overlap)
        p = np.clip(p, 0.0, 1.0) * cw * P_D_MODEL
        self.logw = self.logw + np.log(np.maximum(1.0 - p, MISS_FLOOR)).sum(axis=1)

    def _prune(self) -> None:
        if len(self.T) == 0:
            return
        keep = np.flatnonzero(self.logw > self.logw.max() - 12.0)          # drop < 6e-6 relative weight
        if len(keep) > MAX_HYPOTHESES:
            keep = keep[np.argsort(-self.logw[keep])[:MAX_HYPOTHESES]]
        if len(keep) < len(self.T):
            names = ("T", "phi", "k_ref", "var_phi", "var_T", "cov", "logw")
            self._set_bank(*(getattr(self, n)[keep] for n in names))

    # ------------------------------------------------------------------ evidence
    def hit(self, look_t: float, dwell: float, pulses: np.ndarray, freqs: np.ndarray, looks,
            look_index: int = -1, pws: np.ndarray | None = None) -> bool:
        """Incorporate a detection. `looks` = (t, d, centre) arrays of all past looks.
        Returns True if it started a new flash anchor."""
        self.hit_looks.add(look_index)
        if self.n_hits > 0:
            # a repeat detection is strong evidence of a real emitter over a phantom
            self.log_odds_exist = min(self.log_odds_exist + np.log(0.5 / P_FA_ASSUMED), 30.0)
        else:
            self.first_hit = look_t
        pri = float(np.median(np.diff(pulses))) if len(pulses) > 1 else self.pri
        self.pri = pri if self.n_hits == 0 else 0.8 * self.pri + 0.2 * pri
        edge = 1.5 * pri + 1e-4
        start_seen = pulses[0] - look_t > edge
        end_seen = (look_t + dwell) - pulses[-1] > edge
        span = float(pulses[-1] - pulses[0]) + pri
        if start_seen and end_seen:
            self.full_widths.append(span)
        self.partial_width = max(self.partial_width, span)
        self._update_width()

        w = self.width
        if start_seen:
            anchor, sigma = float(pulses[0]), 0.5 * pri + 2e-4
        elif end_seen:
            anchor = float(pulses[-1]) - w + pri
            sigma = 1e-3 if self.full_widths else max(0.25 * w, 1e-3)
        else:
            anchor, sigma = float(pulses[0]) - max(w - span, 0.0) / 2, max((w - span) / 2, 1e-3)

        self.flash_freqs.append(float(np.median(freqs)))
        diffs = np.diff(np.sort(pulses)) * 1e6
        self.pri_obs = (self.pri_obs + diffs[(diffs > 0) & (diffs < 50_000)].tolist())[-400:]
        if pws is not None and len(pws):
            self.pw_obs = (self.pw_obs + np.asarray(pws, float).tolist())[-400:]
        fr = np.array(self.flash_freqs[-8:])
        c = int(np.argmin(np.abs(CENTRES_MHZ - fr[-1])))
        cover_at_hit = 1.0 if not self.anchors else max(self.cover[c], 0.25)
        self.cover = (np.abs(fr[:, None] - CENTRES_MHZ[None, :]) <= ACCEPT_HALF_WIDTH_MHZ).mean(axis=0)
        self.n_hits += 1

        new_flash = not self.anchors or abs(anchor - self.anchors[-1]) > max(w, SAME_FLASH_S)
        if self.markov is None:
            self.markov = MarkovBank(look_t)
        else:
            p_markov_hit = self.markov.observe(look_t, True, P_D_MODEL * cover_at_hit)
            if new_flash and self.anchors:
                # Bayes factor of this hit: Markov class vs current periodic mixture
                p_mix = float(_softmax(self.logw) @ self._flash_prob(look_t, np.array([dwell]))[:, 0]) \
                    if len(self.T) else 0.0
                self.log_odds_markov += np.log(p_markov_hit) - np.log(max(P_D_MODEL * p_mix, HIT_FLOOR))
        self.last_hit = max(self.last_hit, float(pulses[-1]))
        self._next_relevant = -np.inf

        if new_flash:
            self.anchors.append(anchor); self.anchor_sigma.append(sigma)
            if len(self.anchors) == 1:
                self._init_from_prior(anchor, sigma)
                self._apply_misses(looks, since=anchor - PRE_DETECTION_S)
                self._prune()
            elif self.p_markov < 0.9:
                self._refit(looks)
        elif sigma < self.anchor_sigma[-1]:
            self.anchors[-1], self.anchor_sigma[-1] = anchor, sigma
        return new_flash

    def miss(self, t: float, d: float, c: int, p_d: float = P_D_MODEL) -> None:
        """`p_d`: detection probability of this dwell length given the emitter is receivable; the
        scheduler passes a calibrated value, so an unreliable short dwell is weak evidence of absence."""
        cover = self.cover[c]
        if cover <= 0:
            return
        p_mix = 0.0
        if len(self.T) and self.relevant(t, d):
            p = self._flash_prob(t, np.array([d]))[:, 0] * cover * p_d
            p_mix = float(_softmax(self.logw) @ p)
            if p.max() > 0:
                self.logw = self.logw + np.log(np.maximum(1.0 - p, MISS_FLOOR))
                self._prune()
        p_markov_miss = None
        if self.markov is not None and d >= self.reliable_dwell:
            p_markov_miss = self.markov.observe(t, False, p_d * cover)
            self.log_odds_markov += np.log(max(p_markov_miss, MISS_FLOOR)) - np.log(max(1.0 - p_mix, MISS_FLOOR))
        # existence evidence: P(miss | real) vs P(miss | phantom) = 1
        pm = self.p_markov
        p_miss_real = (1.0 - pm) * (1.0 - p_mix) + pm * (p_markov_miss if p_markov_miss is not None else 1.0)
        self.log_odds_exist += np.log(max(p_miss_real, 1e-3))

    # ------------------------------------------------------------------ prediction
    def action_terms(self, t: float, dwells: np.ndarray, horizon: float | None = None
                     ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Per dwell option, assuming full coverage: (detection probability, value, information gain).

        Value counts a detection as 1 flash plus the future flashes that *resolving* the track would
        unlock: an unconfirmed periodic emitter caught now yields ~RESOLVE_FRACTION of its remaining
        flashes, scaled by how unresolved the track still is (1 - max posterior weight).
        """
        pm = self.p_markov
        rows, wts = [self._flash_prob(t, dwells) * P_D_MODEL], [_softmax(self.logw) * (1 - pm)]
        n_per = len(self.T)
        if self.markov is not None:
            # a dwell only confirms an on emitter if it comfortably holds N_MIN_PULSES of its pulse
            # train; at the bare minimum overlap the pulses land inside only about half the time
            feasible = (dwells >= self.reliable_dwell).astype(float)
            rows.append(P_D_MODEL * self.markov.belief_matrix(t + dwells / 2) * feasible[None, :])
            wts.append(self.markov.weights * pm)
        P, w = np.vstack(rows), np.concatenate(wts)
        mean = w @ P
        ig = binary_entropy(mean) - w @ binary_entropy(P)
        value = mean
        if horizon is not None and n_per:
            unresolved = 1.0 - float(w.max()) if len(w) else 0.0
            future = np.zeros(len(w))
            future[:n_per] = np.minimum((horizon - t) / self.T, MAX_FUTURE_FLASHES)
            value = w @ (P * (1.0 + RESOLVE_FRACTION * unresolved * future)[:, None])
        return mean, value, np.maximum(ig, 0.0)

    def appointment(self, t: float) -> float | None:
        """Start time of the next flash if the periodic model is confident, else None."""
        if self.p_markov > 0.5 or len(self.T) == 0:
            return None
        w = _softmax(self.logw)
        i = int(np.argmax(w))
        if w[i] < CONFIDENT:
            return None
        k = np.ceil((t - self.phi[i]) / self.T[i])
        start = self.phi[i] + k * self.T[i]
        if start <= self.last_hit + max(self.width, SAME_FLASH_S):
            start += self.T[i]
        return float(start - self._uncertainty(np.array([k]))[0])

"""PRIMES-lite: predict flash timing per emitter, then pick the dwell with the best value per unit time.

    I(c, d) = [ Σ_tracks cover·W·g(staleness)·P(intercept) + W_new·E[new discoveries] + λ·Σ cover·IG ] / (d + τ·[c ≠ c_prev])
"""

from __future__ import annotations

import numpy as np

from primes.core.types import CENTRES_MHZ, DWELL_OPTIONS_S, N_CENTRES, Action, Look
from primes.data.priors import Priors
from primes.policies.base import Context, Policy
from primes.predict.search import UndiscoveredBelief
from primes.predict.track import Track

GOLDEN = 0.6180339887


class PrimesLite(Policy):
    name = "primes"

    def __init__(self, lam: float = 0.3, w_new: float = 2.0, stale_s: float = 2.0, retune_s: float = 0.0,
                 search_threshold: float = 0.15, dither: float = 0.10, priors: Priors | None = None,
                 use_info_gain: bool = True, use_dither: bool = True, name: str | None = None):
        self.lam, self.w_new, self.stale_s, self.retune_s = lam, w_new, stale_s, retune_s
        self.search_threshold, self.dither = search_threshold, dither
        self.priors_override = priors
        self.use_info_gain, self.use_dither = use_info_gain, use_dither
        if name:
            self.name = name

    def reset(self, ctx: Context) -> None:
        super().reset(ctx)
        self.priors = self.priors_override or ctx.priors
        self.tracks: dict[int, Track] = {}
        self.search = UndiscoveredBelief(self.priors)
        self.look_t: list[float] = []
        self.look_d: list[float] = []
        self.look_c: list[int] = []
        self.dwells = np.array(DWELL_OPTIONS_S)
        self.prev_centre: int | None = None
        self.step = 0
        self.centre_phase = ctx.rng.random(N_CENTRES)
        self._last = {}

    # ------------------------------------------------------------------ decision
    def act(self, t: float) -> Action:
        self.search.advance(t)
        n_d = len(self.dwells)
        exploit = np.zeros((N_CENTRES, n_d))
        info = np.zeros((N_CENTRES, n_d))
        best_track, best_p = None, 0.0
        horizon = float(self.dwells[-1])
        next_appt, appt_cover = np.inf, None
        for tr in self.tracks.values():
            appt = tr.appointment(t)
            if appt is not None and appt < next_appt:
                next_appt, appt_cover = appt, tr.cover
            if not tr.relevant(t, horizon):
                continue
            p, v, ig = tr.action_terms(t, self.dwells, self.ctx.horizon_s)
            g = min(1.0, (t - tr.last_hit) / self.stale_s)
            exploit += np.outer(tr.cover, g * v)
            info += np.outer(tr.cover, ig)
            if p.max() * g > best_p:
                best_track, best_p = tr, float(p.max() * g)

        discovery = self.w_new * self.search.value()
        value = exploit + discovery + (self.lam * info if self.use_info_gain else 0.0)
        cost = self.dwells[None, :] + self.retune_s * (np.arange(N_CENTRES) != self.prev_centre)[:, None]
        index = value / cost
        if appt_cover is not None and next_appt > t:
            # never be busy elsewhere when a confident track's flash is due: a dwell may not run past
            # the appointment unless it covers that emitter
            blocked = (t + self.dwells[None, :] + self.retune_s > next_appt) & (appt_cover[:, None] <= 0)
            index = np.where(blocked, -np.inf, index)

        search_mode = best_p < self.search_threshold
        if search_mode and self.use_dither:
            # golden-ratio low-discrepancy perturbation breaks periodic revisits among near-ties
            jitter = np.mod(self.step * GOLDEN + self.centre_phase, 1.0) - 0.5
            index = index * (1.0 + self.dither * jitter)[:, None]

        c, j = np.unravel_index(int(np.argmax(index)), index.shape)
        self.step += 1
        self._last = {
            "t": round(t, 4), "centre_mhz": float(CENTRES_MHZ[c]), "dwell_ms": float(self.dwells[j] * 1e3),
            "mode": "search" if search_mode else "track", "index": float(index[c, j]),
            "terms": {"exploit": float(exploit[c, j]), "discovery": float(discovery[c, j]),
                      "info_gain": float(self.lam * info[c, j])},
            "tracks": len(self.tracks), "kappa": round(self.search.kappa, 2),
        }
        if best_track is not None and not search_mode:
            T, _, conf = best_track.best()
            nxt = best_track.next_flash(t)
            self._last["track"] = {"emitter": best_track.id, "p": round(best_p, 3), "model": best_track.model,
                                   "period_s": None if not np.isfinite(T) else round(T, 4),
                                   "confidence": round(conf, 3),
                                   "next_flash_in_ms": None if nxt is None else round((nxt - t) * 1e3, 1)}
        return Action(int(c), float(self.dwells[j]))

    # ------------------------------------------------------------------ learning from hits and misses
    def update(self, look: Look) -> None:
        a = look.action
        detected = frozenset(e for e in look.detections if e >= 0)
        self.search.observe(a.centre, a.dwell_s, new_emitters=sum(1 for e in detected if e not in self.tracks))

        idx = len(self.look_t)
        self.look_t.append(look.t)
        self.look_d.append(a.dwell_s)
        self.look_c.append(a.centre)
        history = None
        for e in detected:
            tr = self.tracks.get(e)
            if tr is None:
                tr = self.tracks[e] = Track(e, self.priors)
            if history is None:
                history = (np.array(self.look_t), np.array(self.look_d), np.array(self.look_c))
            new_flash = tr.hit(look.t, a.dwell_s, look.detections[e],
                               look.freqs.get(e, np.array([CENTRES_MHZ[a.centre]])), history, look_index=idx)
            if new_flash and len(tr.anchors) >= 2:
                t_end = look.t + a.dwell_s
                nxt = tr.next_flash(t_end + 0.02)
                if nxt is not None:
                    self.logs.predictions.append((t_end, e, nxt))
            T, _, conf = tr.best()
            if new_flash:
                self.logs.tracks.append((look.t, e, float(T) if np.isfinite(T) else -1.0, conf))

        for e, tr in self.tracks.items():
            if e not in detected:
                tr.miss(look.t, a.dwell_s, a.centre)

        self.prev_centre = a.centre

    def explain(self) -> dict:
        return self._last

"""PRIMES-lite: predict flash timing per emitter, then pick the dwell with the best value per unit time.

    I(c, d) = [ Σ_tracks cover·W·g(staleness)·P(intercept) + W_new·E[new discoveries] + λ·Σ cover·IG ] / (d + τ·[c ≠ c_prev])
"""

from __future__ import annotations

import numpy as np

from primes.core.types import CENTRES_MHZ, N_CENTRES, Action, Look

# 5 ms looks make search much faster; the micro dwell controller keeps them honest by extending a
# look that heard only part of a flash and by never using one on an emitter whose pulses are too
# sparse to confirm in that time.
PRIMES_DWELLS_S = (0.005, 0.010, 0.025, 0.050, 0.100)
from primes.data.priors import Priors
from primes.policies.base import Context, Policy
from primes.predict.search import UndiscoveredBelief
from primes.predict.track import P_D_MODEL, Track

GOLDEN = 0.6180339887


class PrimesLite(Policy):
    name = "primes"

    def __init__(self, lam: float = 0.3, w_new: float = 2.0, stale_s: float = 2.0, retune_s: float = 0.0,
                 search_threshold: float = 0.15, dither: float = 0.10, priors: Priors | None = None,
                 use_info_gain: bool = True, use_dither: bool = True, use_freq_prior: bool = False,
                 stale_intermittent_s: float | None = None, dwells_s=PRIMES_DWELLS_S,
                 retune_in_index: bool = True, min_track_dwell_s: float = 0.0, calibrate_dwells: bool = False,
                 micro_dwell: bool = True, extend_s: float = 0.005, max_extensions: int = 3,
                 use_threat: bool = False, threat_strength: float = 1.0, threat_confidence: float = 0.0,
                 use_existence: bool = False,
                 name: str | None = None):
        # Micro dwell controller: search looks end as soon as an emitter is confirmed, and a look that
        # heard 1-2 pulses near its end is extended on the same centre instead of hopping away.
        self.micro_dwell, self.extend_s, self.max_extensions = micro_dwell, extend_s, max_extensions
        # Threat-aware priority: each emitter's value is scaled by the weight of its predicted threat class
        # (learned classifier on the track's own observed PRI / PW / frequency / scan parameters).
        self.use_threat = use_threat
        # strength 1 applies the full 0.3x-3x weight range; 0.5 halves the deviation from 1.
        # confidence: apply weighting only when the classifier's top class probability exceeds it.
        self.threat_strength, self.threat_confidence = threat_strength, threat_confidence
        # Existence-weighted scheduling (drop tracks that look like false alarms). Measured: rejects
        # phantoms in 15-40 s but penalises genuine single-detection emitters (easy 86% -> 66% with no
        # false alarms at all), so it is off; existence odds are still estimated and logged.
        self.use_existence = use_existence
        # Online calibration per dwell length: observed detections of known emitters / predicted ones.
        # Learns, e.g., that very short looks under-deliver on bursty real emitters.
        self.calibrate_dwells = calibrate_dwells
        self.dwells_s = tuple(dwells_s)
        # retune_in_index=False: the retune time is still charged in replay, but the score does not
        # favour staying on the same centre (that bias makes search camp on one band).
        self.retune_in_index = retune_in_index
        # dwells shorter than this are used for search only: too short to reliably catch n_min pulses
        # of a known emitter, so they carry no exploit or information value.
        self.min_track_dwell_s = min_track_dwell_s
        self.use_freq_prior = use_freq_prior
        # Revisit interval for on/off emitters. Shorter values (0.25-0.5 s) were tested and make PRIMES
        # camp on visible emitters instead of searching (Turing interception 74% -> 56%); keep = stale_s.
        self.stale_intermittent_s = stale_s if stale_intermittent_s is None else stale_intermittent_s
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
        self.search = UndiscoveredBelief(self.priors, use_freq_prior=self.use_freq_prior, dwells_s=self.dwells_s)
        self.look_t: list[float] = []
        self.look_d: list[float] = []
        self.look_c: list[int] = []
        self.dwells = np.array(self.dwells_s)
        self.prev_centre: int | None = None
        self.cal_pred = np.zeros(len(self.dwells))
        self.cal_hits = np.zeros(len(self.dwells))
        self._pred_look = 0.0
        self._extend_centre: int | None = None
        self._extensions = 0
        self.step = 0
        self.centre_phase = ctx.rng.random(N_CENTRES)
        self._last = {}

    # ------------------------------------------------------------------ decision
    def act(self, t: float) -> Action:
        self.search.advance(t)
        if self.micro_dwell and self._extend_centre is not None:
            c = self._extend_centre
            self._pred_look = 0.0
            self._last = {"t": round(t, 4), "centre_mhz": float(CENTRES_MHZ[c]), "dwell_ms": self.extend_s * 1e3,
                          "mode": "extend", "index": 0.0, "terms": {"exploit": 0.0, "discovery": 0.0, "info_gain": 0.0},
                          "tracks": len(self.tracks), "kappa": round(self.search.kappa, 2)}
            return Action(c, self.extend_s, extend=True, stop_on_detect=True)
        n_d = len(self.dwells)
        exploit = np.zeros((N_CENTRES, n_d))
        info = np.zeros((N_CENTRES, n_d))
        expected = np.zeros((N_CENTRES, n_d))     # raw expected detections of known emitters
        best_track, best_p = None, 0.0
        horizon = float(self.dwells[-1])
        next_appt, appt_cover = np.inf, None
        for tr in self.tracks.values():
            if self.use_existence and tr.dead:
                continue
            appt = tr.appointment(t)
            if appt is not None and appt < next_appt:
                next_appt, appt_cover = appt, tr.cover
            if not tr.relevant(t, horizon):
                continue
            p, v, ig = tr.action_terms(t, self.dwells, self.ctx.horizon_s)
            stale = self.stale_s if tr.model == "periodic" else self.stale_intermittent_s
            g = min(1.0, (t - tr.last_hit) / stale) * (tr.p_exist if self.use_existence else 1.0)
            if self.use_threat:
                probs = tr.threat_probs
                if probs is not None and float(np.max(probs)) >= self.threat_confidence:
                    g *= 1.0 + self.threat_strength * (tr.threat_weight - 1.0)
            exploit += np.outer(tr.cover, g * v)
            info += np.outer(tr.cover, ig)
            expected += np.outer(tr.cover, p)
            if p.max() * g > best_p:
                best_track, best_p = tr, float(p.max() * g)

        if self.calibrate_dwells:
            exploit = exploit * self.dwell_calibration()[None, :]
        discovery = self.w_new * self.search.value()
        if self.min_track_dwell_s > 0:
            search_only = self.dwells < self.min_track_dwell_s
            exploit[:, search_only] = 0.0
            info[:, search_only] = 0.0
        value = exploit + discovery + (self.lam * info if self.use_info_gain else 0.0)
        retune_bias = self.retune_s if self.retune_in_index else 0.0
        cost = self.dwells[None, :] + retune_bias * (np.arange(N_CENTRES) != self.prev_centre)[:, None]
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
        self._pred_look = float(expected[c, j])
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
        return Action(int(c), float(self.dwells[j]), stop_on_detect=self.micro_dwell and search_mode)

    # ------------------------------------------------------------------ learning from hits and misses
    def update(self, look: Look) -> None:
        a = look.action
        detected = frozenset(look.detections)        # false alarms carry unique negative ids and are tracked like any emitter
        new_freqs = [float(np.median(look.freqs[e])) if e in look.freqs else float(CENTRES_MHZ[a.centre])
                     for e in detected if e not in self.tracks]
        self.search.observe(a.centre, a.dwell_s, new_freqs)

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
                               look.freqs.get(e, np.array([CENTRES_MHZ[a.centre]])), history, look_index=idx,
                               pws=look.pws.get(e))
            if new_flash and self.use_threat:
                tr.update_threat()
                if tr.threat_probs is not None:
                    self.logs.threats.append((look.t, e, [round(float(x), 3) for x in tr.threat_probs]))
            if new_flash and len(tr.anchors) >= 2:
                t_end = look.t + a.dwell_s
                nxt = tr.next_flash(t_end + 0.02)
                if nxt is not None:
                    self.logs.predictions.append((t_end, e, nxt))
            T, _, conf = tr.best()
            if new_flash:
                self.logs.tracks.append((look.t, e, float(T) if np.isfinite(T) else -1.0, conf))

        j = int(np.argmin(np.abs(self.dwells - a.dwell_s)))
        known_hits = sum(1 for e in detected if e in self.tracks and self.tracks[e].n_hits > 1)
        self.cal_pred[j] += self._pred_look
        self.cal_hits[j] += known_hits
        p_d = min(0.99, P_D_MODEL * self.dwell_calibration()[j]) if self.calibrate_dwells else P_D_MODEL
        for e, tr in self.tracks.items():
            if e not in detected and not (self.use_existence and tr.dead):
                was_dead = tr.dead
                tr.miss(look.t, a.dwell_s, a.centre, p_d=p_d)
                if tr.dead and not was_dead:
                    self.logs.rejections.append((look.t + a.dwell_s, e, look.t + a.dwell_s - tr.first_hit))

        self.prev_centre = a.centre
        if self.micro_dwell:
            end = look.t + a.dwell_s
            near_end = [e for e, last in look.partial.items()
                        if e >= 0 and e not in detected and end - last <= 0.003]
            if near_end and self._extensions < self.max_extensions:
                self._extend_centre, self._extensions = a.centre, self._extensions + 1
            else:
                self._extend_centre, self._extensions = None, 0

    def dwell_calibration(self, pseudo: float = 3.0) -> np.ndarray:
        return np.clip((self.cal_hits + pseudo) / (self.cal_pred + pseudo), 0.2, 1.2)

    def explain(self) -> dict:
        return self._last

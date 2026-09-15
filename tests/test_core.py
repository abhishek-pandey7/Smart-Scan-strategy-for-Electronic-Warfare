import numpy as np
import pytest

from primes.core.types import (CENTRES_MHZ, RASTER_DWELL_S, Action, EmitterInfo, Truth,
                               build_flashes, covering_centres)
from primes.data.priors import Priors, p_overlap
from primes.env.receiver import Receiver
from primes.env.scenarios import make_scenario, raster_windows
from primes.eval.metrics import compute_metrics, intercepted_flashes
from primes.eval.replay import replay
from primes.policies.baselines import HitRateBandit, Oracle, RandomScan, Raster

PRIORS = Priors.flat()


def _truth(toa, freq, emitter, horizon=1.0):
    toa, freq, emitter = map(np.asarray, (toa, freq, emitter))
    o = np.argsort(toa)
    infos = [EmitterInfo(id=int(e), kind="circular", freqs_mhz=[1000.0]) for e in np.unique(emitter)]
    return Truth("unit", horizon, toa[o].astype(float), freq[o].astype(np.float32),
                 emitter[o].astype(np.int32), infos)


def test_raster_cycle_is_turing_schedule():
    assert len(RASTER_DWELL_S) == 36
    assert RASTER_DWELL_S.sum() == pytest.approx(2.15)


def test_every_frequency_covered_by_two_or_three_centres():
    for f in np.linspace(760, 17240, 500):
        assert 2 <= len(covering_centres(f)) <= 3


def test_receiver_acceptance_and_min_pulses():
    t = np.array([0.001, 0.002, 0.003, 0.004, 0.005, 0.006])
    tr = _truth(t, [3000, 3000, 3000, 4600, 4600, 3000], [0, 0, 0, 1, 1, 0])
    rx = Receiver(tr, np.random.default_rng(0))
    look = rx.observe(0.0, Action(int(np.argmin(abs(CENTRES_MHZ - 3250))), 0.010))
    assert set(look.detections) == {0}          # emitter 1 is out of band (and has only 2 pulses)
    assert len(look.detections[0]) == 4


def test_flash_splitting_and_segments():
    toa = np.r_[np.arange(0, 0.01, 0.001), np.arange(1.0, 1.01, 0.001), np.arange(2.0, 2.6, 0.001)]
    fl = build_flashes(toa, np.full(len(toa), 1000.0), np.zeros(len(toa), int))[0]
    assert fl[0, 0] == 0 and fl[1, 0] == pytest.approx(1.0)
    assert len(fl) == 2 + 3                      # 0.6 s continuous illumination -> 3 segments of <= 0.25 s


def test_p_overlap_closed_form():
    # dwell 10 ms, flash 14 ms, period 1 s, need 0 overlap: (10 + 14) / 1000
    assert p_overlap(0.010, np.array([0.014]), np.array([1.0]), np.array([0.0]))[0] == pytest.approx(0.024)


def test_lockout_scenario_defeats_raster():
    tr = make_scenario("lockout", 3, PRIORS)
    caught = intercepted_flashes(replay(Raster(), tr, PRIORS, seed=0), tr)
    for e in tr.emitters:
        if e.role.startswith("lockout"):
            assert not caught.get(e.id), f"raster intercepted {e.role} emitter {e.id}"


def test_lockout_flash_sits_outside_raster_windows():
    tr = make_scenario("lockout", 5, PRIORS)
    cycle = RASTER_DWELL_S.sum()
    for e in tr.emitters:
        if e.role == "lockout-exact":
            start = tr.flashes[e.id][0, 0] % cycle
            for a, b in raster_windows(e.freqs_mhz[0]):
                assert not (a - 0.014 < start < b)


def test_replay_is_deterministic():
    tr = make_scenario("dense", 2, PRIORS)
    m1 = compute_metrics(replay(RandomScan(), tr, PRIORS, seed=7, p_d=0.9), tr)
    m2 = compute_metrics(replay(RandomScan(), tr, PRIORS, seed=7, p_d=0.9), tr)
    assert m1 == m2


@pytest.mark.parametrize("family", ["easy", "popup", "lockout"])
def test_oracle_dominates_baselines(family):
    tr = make_scenario(family, 11, PRIORS)
    oracle = compute_metrics(replay(Oracle(), tr, PRIORS), tr)["interception_ratio"]
    for pol in (Raster(), RandomScan(), HitRateBandit()):
        assert oracle >= compute_metrics(replay(pol, tr, PRIORS), tr)["interception_ratio"]

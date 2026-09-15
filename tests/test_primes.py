import numpy as np
import pytest

from primes.data.priors import Priors
from primes.env.scenarios import make_scenario
from primes.eval.metrics import compute_metrics, intercepted_flashes
from primes.eval.replay import replay
from primes.policies.baselines import Raster
from primes.policies.primes_lite import PrimesLite
from primes.predict.markov import MarkovBank
from primes.predict.track import Track, binary_entropy, overlap_prob

PRIORS = Priors.load_or_flat()


def _flash_pulses(start, width=0.012, pri=0.001):
    return np.arange(start, start + width, pri)


def _no_looks():
    return np.empty(0), np.empty(0), np.empty(0, dtype=int)


def test_overlap_prob_bounds():
    # dwell fully covers the uncertain start interval -> certain overlap
    p = overlap_prob(1.0, np.array([0.1]), np.array([1.05]), np.array([0.01]), w=0.012, L=0.002)
    assert p[0] == pytest.approx(1.0)
    # flash predicted far away -> zero
    assert overlap_prob(1.0, np.array([0.01]), np.array([3.0]), np.array([0.01]), 0.012, 0.002)[0] == 0.0


def test_information_gain_zero_when_hypotheses_agree():
    w = np.array([0.5, 0.5])
    P = np.array([[0.7], [0.7]])
    ig = binary_entropy(w @ P) - w @ binary_entropy(P)
    assert ig[0] == pytest.approx(0.0, abs=1e-9)


def _observe_sequence(true_T, phase, look_times, dwell=0.025, width=0.012, centre=6):
    """Feed a Track the hits and misses a receiver parked on one centre would produce."""
    tr, lt, ld, lc = Track(0, PRIORS), [], [], []
    for i, t in enumerate(look_times):
        lt.append(t); ld.append(dwell); lc.append(centre)
        k = np.floor((t + dwell - phase) / true_T)
        start = phase + k * true_T
        pulses = _flash_pulses(start, width)
        pulses = pulses[(pulses >= t) & (pulses < t + dwell)]
        if len(pulses) >= 3:
            tr.hit(t, dwell, pulses, np.array([3250.0]), (np.array(lt), np.array(ld), np.array(lc)), look_index=i)
        elif tr.anchors:
            tr.miss(t, dwell, centre)
    return tr


def _best_periodic(tr):
    return float(tr.T[np.argmax(tr.logw)])


@pytest.mark.parametrize("true_T", [2.0, 4.0, 2.5])
def test_period_recovered_from_hits_and_misses(true_T):
    phase = 0.337
    flashes = [phase + k * true_T - 0.004 for k in (0, 1, 3)]               # three caught flashes
    # misses at sub-harmonic times (T/2, T/3, ...): the looks information gain would choose
    probes = [phase + f * true_T - 0.004 for f in (1 / 3, 1 / 2, 2 / 3, 3 / 2, 5 / 2)]
    tr = _observe_sequence(true_T, phase, sorted(flashes + probes))
    assert _best_periodic(tr) == pytest.approx(true_T, rel=0.01)
    T, _, _ = tr.best()
    assert np.isfinite(T), "periodic class should beat the intermittent class once misses are seen"
    assert tr.next_flash(phase + 3 * true_T + 0.5) == pytest.approx(phase + 4 * true_T, abs=0.01)


def test_miss_suppresses_subharmonic_period():
    # flashes every 4 s; hits at 10 s and 14 s are equally explained by T = 2 s until a look at 12 s misses
    tr = _observe_sequence(4.0, 2.0, [9.996, 13.996])
    ambiguous = {round(T, 3) for T in tr.T[tr.logw > tr.logw.max() - 1.0]}
    assert {2.0, 4.0} <= ambiguous
    tr = _observe_sequence(4.0, 2.0, [9.996, 11.99, 13.996])
    assert _best_periodic(tr) == pytest.approx(4.0, rel=0.01)


def test_markov_bank_learns_long_visibility():
    bank = MarkovBank(0.0)
    t = 0.0
    for _ in range(40):                                   # visible at every look, 100 ms apart
        t += 0.1
        bank.observe(t, True, 0.95)
    assert bank.summary()["duty"] > 0.5


def test_primes_breaks_raster_lockout():
    tr = make_scenario("lockout", 4, PRIORS)
    raster = intercepted_flashes(replay(Raster(), tr, PRIORS), tr)
    primes = intercepted_flashes(replay(PrimesLite(), tr, PRIORS, seed=1), tr)
    locked = [e.id for e in tr.emitters if e.role.startswith("lockout")]
    assert all(not raster.get(e) for e in locked)
    assert sum(1 for e in locked if primes.get(e)) >= len(locked) // 2


def test_primes_beats_raster_on_easy():
    tr = make_scenario("easy", 21, PRIORS)
    r = compute_metrics(replay(Raster(), tr, PRIORS), tr)["interception_ratio"]
    p = compute_metrics(replay(PrimesLite(), tr, PRIORS, seed=1), tr)["interception_ratio"]
    assert p > 2 * r

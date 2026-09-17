import numpy as np

from primes.associate.deinterleave import Associator, cluster_pulses
from primes.core.types import CENTRES_MHZ, Action, EmitterInfo, Truth
from primes.env.receiver import Receiver


def _pulses(n, t0, pri, freq, pw, aoa, rng):
    t = t0 + pri * np.arange(n)
    return t, np.full(n, freq) + rng.normal(0, 1, n), np.full(n, pw) * (1 + rng.normal(0, 0.03, n)), aoa + rng.normal(0, 2, n)


def test_bearing_separates_emitters_and_keeps_a_hopper_together():
    rng = np.random.default_rng(0)
    a = _pulses(6, 0.0, 1e-3, 3000.0, 1.0, 40.0, rng)
    b = _pulses(6, 0.0003, 1e-3, 3010.0, 1.0, -90.0, rng)           # same frequency and PW, other bearing
    hop_f = np.array([3100.0, 3400.0, 3700.0, 3100.0, 3400.0, 3700.0])
    c = (0.0006 + 1e-3 * np.arange(6), hop_f, np.full(6, 0.5), 150.0 + rng.normal(0, 2, 6))
    freq, pw, aoa = (np.concatenate([x[k] for x in (a, b, c)]) for k in (1, 2, 3))
    lab = cluster_pulses(freq, pw, aoa)
    assert len(set(lab[:6])) == 1 and len(set(lab[6:12])) == 1 and len(set(lab[12:])) == 1
    assert len({lab[0], lab[6], lab[12]}) == 3


def test_association_is_stable_across_dwells_and_follows_bearing_drift():
    rng = np.random.default_rng(1)
    assoc = Associator(3)
    ids = []
    for k, t0 in enumerate([0.0, 1.0, 2.0, 3.0]):
        t, f, p, a = _pulses(5, t0, 1e-3, 5000.0, 2.0, 10.0 + 6.0 * k, rng)   # 6 deg/s drift
        det, *_ = assoc.associate(t, f, p, a, t0 + 0.01)
        ids.append(set(det))
    assert all(s == ids[0] and len(s) == 1 for s in ids)


def test_too_few_pulses_are_partial_not_detections():
    rng = np.random.default_rng(2)
    t, f, p, a = _pulses(2, 0.0, 1e-3, 5000.0, 2.0, 0.0, rng)
    det, _, _, partial, _ = Associator(3).associate(t, f, p, a, 0.005)
    assert not det and len(partial) == 1


def test_receiver_pdw_mode_reports_unlabelled_pulses_and_keeps_truth_detections():
    toa = np.array([0.001, 0.002, 0.003, 0.0015, 0.0025, 0.0035])
    emitter = np.array([0, 0, 0, 1, 1, 1])
    freq = np.array([3000, 3000, 3000, 3100, 3100, 3100], dtype=np.float32)
    o = np.argsort(toa)
    truth = Truth("unit-pdw", 1.0, toa[o], freq[o], emitter[o].astype(np.int32),
                  [EmitterInfo(id=e, kind="circular", freqs_mhz=[3000.0]) for e in (0, 1)])
    look = Receiver(truth, np.random.default_rng(0), pdw=True).observe(
        0.0, Action(int(np.argmin(abs(CENTRES_MHZ - 3250))), 0.010))
    assert set(look.detections) == {0, 1}
    assert look.pdw.shape == (6, 4) and np.all(np.diff(look.pdw[:, 0]) >= 0)

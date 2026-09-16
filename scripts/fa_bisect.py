"""Isolate what changed nominal (p_fa = 0) performance: python -m scripts.fa_bisect"""
import primes.predict.track as T
from primes.eval.metrics import compute_metrics
from primes.eval.replay import replay
from primes.eval.runner import load_scenario, make_policy, priors

tr = load_scenario("easy", 0)


def run(label):
    m = compute_metrics(replay(make_policy("primes"), tr, priors(), seed=0), tr)
    print(f"{label:40s} interception {m['interception_ratio']:.3f} disc {m['discovery_fraction']:.2f} dropped {m['real_tracks_dropped']}", flush=True)


run("current (existence on)")
T.Track.p_exist = property(lambda self: 1.0)
T.Track.dead = property(lambda self: False)
run("existence disabled")
print("done", flush=True)

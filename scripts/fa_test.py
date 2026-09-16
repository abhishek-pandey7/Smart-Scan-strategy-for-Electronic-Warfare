"""Quick false-alarm sanity check for PRIMES: python -m scripts.fa_test"""
from primes.eval.metrics import compute_metrics
from primes.eval.replay import replay
from primes.eval.runner import load_scenario, make_policy, priors

for sc in ("easy", "turing:192"):
    tr = load_scenario(sc, 0)
    for pfa in (0.0, 0.005, 0.02):
        m = compute_metrics(replay(make_policy("primes"), tr, priors(), seed=0, p_fa=pfa), tr)
        r = m["false_alarm_rejection_s"]
        print(f"{sc:11s} p_fa={pfa}: interception {m['interception_ratio']:.3f} disc {m['discovery_fraction']:.2f} "
              f"false alarms {m['false_alarms']} rejected after {r and round(r, 1)} s, real tracks dropped {m['real_tracks_dropped']}",
              flush=True)
print("done", flush=True)

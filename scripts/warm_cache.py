"""Precompute default-lineup demo runs into artifacts/runs.

Builds the same payload as POST /api/runs with RunRequest defaults, so cache keys
match what the web demo requests.

Note (--include-dqn): if artifacts/models/dqn.zip is absent, available_policies()
drops Double-DQN from the default lineup and those cache files exclude it. After
DQN training finishes, rerun this script so lineup caches include dqn.

Usage:
    python -m scripts.warm_cache
"""

from __future__ import annotations

from api.main import RunRequest, create_run
from primes.data.turing import available_configs
from primes.policies.dqn import DEFAULT_MODEL

SIM_SCENARIOS = ["easy", "lockout", "popup", "dense", "mixed"]
EKLAVYA_SCENARIOS = ["lockout", "easy", "mixed"]


def main() -> None:
    configs = available_configs()
    scenarios = list(SIM_SCENARIOS)
    if configs:
        scenarios.append(f"turing:{configs[0]}")
    else:
        print("warning: no local Turing configs; skipping turing scenario", flush=True)

    if not DEFAULT_MODEL.exists():
        print("note: dqn.zip missing — lineup excludes Double-DQN; "
              "rerun warm_cache after training finishes", flush=True)

    for sc in scenarios:
        print(f"warming {sc} ...", flush=True)
        payload = create_run(RunRequest(scenario=sc))
        print(f"  id={payload['id']} policies={list(payload['runs'])}", flush=True)
    # /how-it-decides and /eklavya request Eklavya on its own
    for sc in EKLAVYA_SCENARIOS:
        print(f"warming {sc} (Eklavya only) ...", flush=True)
        payload = create_run(RunRequest(scenario=sc, policies=["primes"]))
        print(f"  id={payload['id']}", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()

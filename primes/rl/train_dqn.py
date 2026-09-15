"""Train the Double-DQN comparator on randomised simulated scenarios.

Double-Q targets (primes.rl.double_dqn), target network, Huber loss. Training scenario seeds
start at 10_000 and never overlap evaluation seeds.

Usage:
    python -m primes.rl.train_dqn --steps 300000
"""

from __future__ import annotations

import argparse
from pathlib import Path

from primes.data.priors import Priors
from primes.policies.dqn import DEFAULT_MODEL
from primes.rl.env import ScanEnv


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=300_000)
    ap.add_argument("--out", default=str(DEFAULT_MODEL))
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    from primes.rl.double_dqn import DoubleDQN

    env = ScanEnv(Priors.load())
    model = DoubleDQN("MlpPolicy", env, learning_rate=1e-4, buffer_size=200_000, learning_starts=5_000,
                batch_size=128, gamma=0.99, train_freq=4, target_update_interval=2_000,
                exploration_fraction=0.25, exploration_final_eps=0.02,
                policy_kwargs={"net_arch": [256, 256]}, seed=args.seed, verbose=1, device="cpu")
    model.learn(total_timesteps=args.steps, log_interval=20)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    model.save(args.out)
    print(f"saved {args.out}")


if __name__ == "__main__":
    main()

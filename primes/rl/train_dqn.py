"""Train the Double-DQN comparator on randomised simulated scenarios.

Double-Q targets (primes.rl.double_dqn), 5-step returns, target network, Huber loss. The model
with the best mean reward on held-out validation scenarios is kept, not the last one.
Scenario seeds: training 10_000+, validation 20_000+, evaluation 0-999, so they never overlap.

Usage:
    python -m primes.rl.train_dqn --steps 600000
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from primes.data.priors import Priors
from primes.policies.dqn import DEFAULT_MODEL
from primes.rl.env import ScanEnv


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=600_000)
    ap.add_argument("--out", default=str(DEFAULT_MODEL))
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    from stable_baselines3.common.callbacks import EvalCallback
    from stable_baselines3.common.monitor import Monitor

    from primes.rl.double_dqn import DoubleDQN

    priors = Priors.load()
    env = Monitor(ScanEnv(priors, seed_offset=10_000))
    val_env = Monitor(ScanEnv(priors, seed_offset=20_000, fixed_set=10))
    out = Path(args.out)
    best_dir = out.parent / "dqn_best"

    model = DoubleDQN("MlpPolicy", env, learning_rate=1e-4, buffer_size=200_000, learning_starts=20_000,
                      batch_size=256, gamma=0.99, n_steps=5, train_freq=4, target_update_interval=5_000,
                      exploration_fraction=0.3, exploration_initial_eps=1.0, exploration_final_eps=0.05,
                      policy_kwargs={"net_arch": [256, 256]}, seed=args.seed, verbose=1, device="cpu")
    callback = EvalCallback(val_env, n_eval_episodes=10, eval_freq=25_000, deterministic=True,
                            best_model_save_path=str(best_dir), log_path=str(out.parent), verbose=1)
    model.learn(total_timesteps=args.steps, log_interval=20, callback=callback)

    out.parent.mkdir(parents=True, exist_ok=True)
    best = best_dir / "best_model.zip"
    if best.exists():
        shutil.copy(best, out)
    else:
        model.save(str(out))
    print(f"saved {out} (best validation mean reward {callback.best_mean_reward:.1f})")


if __name__ == "__main__":
    main()

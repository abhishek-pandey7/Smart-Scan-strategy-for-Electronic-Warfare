"""Double-DQN scheduler (model-free comparator) wrapped as a replayable policy."""

from __future__ import annotations

from pathlib import Path

from primes.core.types import Action, Look
from primes.policies.base import Context, Policy
from primes.rl.features import ObsBuilder, decode_action

DEFAULT_MODEL = Path(__file__).resolve().parents[2] / "artifacts" / "models" / "dqn.zip"


class DQNPolicy(Policy):
    name = "dqn"

    def __init__(self, model_path: str | Path = DEFAULT_MODEL):
        from primes.rl.double_dqn import DoubleDQN

        self.model = DoubleDQN.load(str(model_path), device="cpu")

    def reset(self, ctx: Context) -> None:
        super().reset(ctx)
        self.features = ObsBuilder(ctx.horizon_s)

    def act(self, t: float) -> Action:
        a, _ = self.model.predict(self.features.obs(t), deterministic=True)
        return decode_action(int(a))

    def update(self, look: Look) -> None:
        self.features.update(look)

"""Double DQN on top of Stable-Baselines3 DQN (van Hasselt et al., 2016).

The only change from SB3's DQN is the TD target: the online network selects the next action and
the target network evaluates it, which removes the max-operator overestimation bias.
"""

from __future__ import annotations

import numpy as np
import torch as th
import torch.nn.functional as F
from stable_baselines3 import DQN


class DoubleDQN(DQN):
    def train(self, gradient_steps: int, batch_size: int = 100) -> None:
        self.policy.set_training_mode(True)
        self._update_learning_rate(self.policy.optimizer)

        losses = []
        for _ in range(gradient_steps):
            data = self.replay_buffer.sample(batch_size, env=self._vec_normalize_env)
            discounts = data.discounts if data.discounts is not None else self.gamma

            with th.no_grad():
                next_actions = self.q_net(data.next_observations).argmax(dim=1, keepdim=True)
                next_q = th.gather(self.q_net_target(data.next_observations), 1, next_actions)
                target = data.rewards + (1 - data.dones) * discounts * next_q

            current = th.gather(self.q_net(data.observations), 1, data.actions.long())
            loss = F.smooth_l1_loss(current, target)
            losses.append(loss.item())

            self.policy.optimizer.zero_grad()
            loss.backward()
            th.nn.utils.clip_grad_norm_(self.policy.parameters(), self.max_grad_norm)
            self.policy.optimizer.step()

        self._n_updates += gradient_steps
        self.logger.record("train/n_updates", self._n_updates, exclude="tensorboard")
        self.logger.record("train/loss", np.mean(losses))

"""
Q-Learning Reinforcement Learning Agent (Stage B & Stage C).
Provides discrete state-space discretization, epsilon-greedy action selection,
Bellman temporal difference updates, and persistent Q-table checkpoints.
100% CPU-compatible with fast tabular inference.
"""
import json
import os
import random
from typing import Dict, Any, Tuple, List
from .base_agent import BaseAgent
try:
    from config.settings import ACTIONS, RL_GAMMA, RL_LR, RL_EPSILON_START, RL_EPSILON_MIN, RL_EPSILON_DECAY
except (ImportError, ValueError):
    from ..config.settings import ACTIONS, RL_GAMMA, RL_LR, RL_EPSILON_START, RL_EPSILON_MIN, RL_EPSILON_DECAY


class QLearningAgent(BaseAgent):
    def __init__(
        self,
        alpha: float = RL_LR,
        gamma: float = RL_GAMMA,
        epsilon: float = RL_EPSILON_START,
        epsilon_min: float = RL_EPSILON_MIN,
        epsilon_decay: float = RL_EPSILON_DECAY
    ):
        super().__init__(name="QLearningAgent")
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay

        self.actions = ACTIONS
        self.num_actions = len(self.actions)

        # Q-table: Dict[str, List[float]] where key is discretized state string
        self.q_table: Dict[str, List[float]] = {}
        self.training_steps = 0

    def discretize_state(self, obs) -> str:
        """
        Discretizes high-dimensional GameObservation into a compact state key string:
        'map:x_bin:y_bin:battle:dialogue:hp_bin'
        """
        # Bin coordinates in 2x2 macro-tiles to allow generalized spatial learning
        x_bin = obs.x // 2
        y_bin = obs.y // 2
        battle_bit = 1 if (obs.battle_status != 0 or obs.mode == "BATTLE") else 0
        dialogue_bit = 1 if (obs.dialogue_open or obs.mode in ("INTRO", "DIALOGUE", "MENU")) else 0
        hp_bin = int(obs.party_hp_ratio * 4)  # 0: 0-25%, 1: 25-50%, 2: 50-75%, 3: 75-100%, 4: 100%

        return f"{obs.map_id}:{x_bin}:{y_bin}:{battle_bit}:{dialogue_bit}:{hp_bin}"

    def get_q_values(self, state_key: str) -> List[float]:
        """
        Returns Q-values for all actions in state. Initializes with 0.0 if unvisited.
        """
        if state_key not in self.q_table:
            self.q_table[state_key] = [0.0] * self.num_actions
        return self.q_table[state_key]

    def act(self, obs) -> str:
        """
        Epsilon-greedy action selection.
        """
        # During screen transitions / fades, pass to avoid interrupting hardware registers
        if obs.mode == "FADING":
            return "pass"

        state_key = self.discretize_state(obs)

        # Explore
        if random.random() < self.epsilon:
            action_idx = random.randint(0, self.num_actions - 1)
        else:
            # Exploit
            q_values = self.get_q_values(state_key)
            max_q = max(q_values)
            # Break ties uniformly at random
            best_actions = [i for i, q in enumerate(q_values) if q == max_q]
            action_idx = random.choice(best_actions)

        return self.actions[action_idx]

    def learn(self, transition: Dict[str, Any]) -> None:
        """
        Bellman Q-Learning update:
        Q(s, a) = Q(s, a) + alpha * [r + gamma * max_a' Q(s', a') - Q(s, a)]
        """
        state_key = transition["state"]
        action = transition["action"]
        reward = float(transition["reward"])
        next_state_key = transition["next_state"]
        done = bool(transition.get("done", False))

        if action not in self.actions:
            return
        action_idx = self.actions.index(action)

        q_values = self.get_q_values(state_key)
        curr_q = q_values[action_idx]

        if done:
            target = reward
        else:
            next_q_values = self.get_q_values(next_state_key)
            target = reward + self.gamma * max(next_q_values)

        td_error = target - curr_q
        self.q_table[state_key][action_idx] = curr_q + self.alpha * td_error

        # Decay epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

        self.training_steps += 1

    def save(self, filepath: str) -> None:
        """
        Saves Q-table and metadata to JSON file.
        """
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        data = {
            "training_steps": self.training_steps,
            "epsilon": self.epsilon,
            "alpha": self.alpha,
            "gamma": self.gamma,
            "state_count": len(self.q_table),
            "q_table": self.q_table
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self, filepath: str) -> None:
        """
        Loads Q-table and metadata from JSON file.
        """
        if not os.path.exists(filepath):
            return
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.training_steps = data.get("training_steps", 0)
            self.epsilon = data.get("epsilon", self.epsilon_min)
            self.alpha = data.get("alpha", self.alpha)
            self.gamma = data.get("gamma", self.gamma)
            self.q_table = data.get("q_table", {})

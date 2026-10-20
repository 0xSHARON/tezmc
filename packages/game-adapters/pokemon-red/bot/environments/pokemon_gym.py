"""
Gymnasium Reinforcement Learning Environment for Pokémon Red.
Implements the standard gym.Env interface with step(), reset(), render(), and close().
"""
import os
import numpy as np
from typing import Optional, Tuple, Dict, Any

import importlib

try:
    import gymnasium as gym
    from gymnasium import spaces
except ImportError:
    gym = None
    spaces = None
    if importlib.util.find_spec("gym"):
        gym_mod = importlib.import_module("gym")
        gym = gym_mod
        spaces = getattr(gym_mod, "spaces", None)
    
    if gym is None or spaces is None:
        class DummySpaces:
            class Discrete:
                def __init__(self, n):
                    self.n = n
            class Box:
                def __init__(self, low, high, shape, dtype=None):
                    self.shape = shape
                    self.low = low
                    self.high = high
        spaces = DummySpaces()
        class DummyEnv:
            def __init__(self):
                pass
            def reset(self, **kwargs):
                pass
            def step(self, action):
                pass
            def render(self):
                pass
            def close(self):
                pass
        class DummyGym:
            Env = DummyEnv
        gym = DummyGym()

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from emulator.pyboy_adapter import PyBoyAdapter
from observations.state_builder import StateBuilder, GameObservation
from training.reward_calculator import RewardCalculator
from config.settings import DEFAULT_ROM_PATH, ACTIONS, EMULATOR_SPEED, HEADLESS_DEFAULT


class PokemonRedEnv(gym.Env):
    metadata = {"render_modes": ["rgb_array", "human"]}

    def __init__(
        self,
        rom_path: str = DEFAULT_ROM_PATH,
        headless: bool = HEADLESS_DEFAULT,
        speed: int = EMULATOR_SPEED,
        init_state_path: Optional[str] = None,
        max_episode_steps: int = 1000,
        action_repeat: int = 24
    ):
        super().__init__()
        self.rom_path = rom_path
        self.headless = headless
        self.speed = speed
        self.init_state_path = init_state_path
        self.max_episode_steps = max_episode_steps
        self.action_repeat = action_repeat

        # Action Space: 0: pass, 1: up, 2: down, 3: left, 4: right, 5: a, 6: b, 7: start, 8: select
        self.actions = ACTIONS
        self.action_space = spaces.Discrete(len(self.actions))

        # Observation Space: 10-dimensional continuous feature vector
        # [mode_idx, map_id, x, y, party_count, party_hp_ratio, battle_status, dialogue_open, badges, confidence]
        self.observation_space = spaces.Box(
            low=0.0,
            high=255.0,
            shape=(10,),
            dtype=np.float32
        )

        self.adapter: Optional[PyBoyAdapter] = None
        self.state_builder = StateBuilder()
        self.reward_calculator = RewardCalculator()

        self.current_step = 0
        self.last_obs: Optional[GameObservation] = None

    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        self.current_step = 0
        self.reward_calculator.reset()

        # Initialize or restart emulator
        if self.adapter is None:
            self.adapter = PyBoyAdapter(
                rom_path=self.rom_path,
                headless=self.headless,
                speed=self.speed
            )
            self.adapter.start()
        else:
            if self.init_state_path and os.path.exists(self.init_state_path):
                self.adapter.load_state(self.init_state_path)
            else:
                self.adapter.reset()

        # Load initial checkpoint if supplied
        if self.init_state_path and os.path.exists(self.init_state_path):
            self.adapter.load_state(self.init_state_path)

        # Allow emulator to warm up
        self.adapter.tick(30)
        self.last_obs = self.state_builder.build(self.adapter)

        info = {
            "mode": self.last_obs.mode,
            "map_id": self.last_obs.map_id,
            "x": self.last_obs.x,
            "y": self.last_obs.y,
            "party_count": self.last_obs.party_count,
            "party_hp_ratio": self.last_obs.party_hp_ratio
        }

        return self.last_obs.to_feature_vector(), info

    def step(self, action_idx: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        self.current_step += 1
        action_name = self.actions[action_idx]

        # Execute action on Game Boy
        if action_name != "pass":
            self.adapter.send_input(action_name, hold_frames=10)
        
        # Advance emulator frames
        self.adapter.tick(self.action_repeat)

        curr_obs = self.state_builder.build(self.adapter)
        reward = self.reward_calculator.calculate(self.last_obs, curr_obs, action_name)

        self.last_obs = curr_obs

        # Check termination & truncation
        terminated = False
        truncated = self.current_step >= self.max_episode_steps

        # Check for emulator crash / freeze
        if self.adapter.is_frozen(check_frames=120):
            truncated = True
            reward -= 5.0

        info = {
            "mode": curr_obs.mode,
            "map_id": curr_obs.map_id,
            "x": curr_obs.x,
            "y": curr_obs.y,
            "party_count": curr_obs.party_count,
            "badges": curr_obs.badges,
            "confidence": curr_obs.confidence,
            "action_taken": action_name
        }

        return curr_obs.to_feature_vector(), reward, terminated, truncated, info

    def render(self) -> np.ndarray:
        if self.adapter:
            return self.adapter.get_screen_ndarray()
        return np.zeros((144, 160, 3), dtype=np.uint8)

    def close(self):
        if self.adapter:
            self.adapter.close()
            self.adapter = None

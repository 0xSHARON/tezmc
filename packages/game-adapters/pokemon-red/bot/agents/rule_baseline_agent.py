"""
Rule-Based Baseline Agent (Stage A).
Coordinates dialogue progression, collision recovery, overworld waypoint pathing,
and turn-based battles deterministically.
"""
from typing import Tuple, List, Optional
from .base_agent import BaseAgent
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from controllers.dialogue import DialogueController
from controllers.navigation import NavigationController
from controllers.battle import BattleController
from controllers.healing import HealingController


class RuleBaselineAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="RuleBaselineAgent")
        self.dialogue_ctrl = DialogueController()
        self.nav_ctrl = NavigationController()
        self.battle_ctrl = BattleController()
        self.healing_ctrl = HealingController()

        self.last_pos: Tuple[int, int, int] = (-1, -1, -1)  # (map, x, y)
        self.stuck_counter = 0
        self.just_closed_dialogue_ticks = 0

    def act(self, obs) -> str:
        """
        Determines the best action for the current GameObservation.
        """
        # 1. Respect screen transitions / fades: never spam buttons during fade
        if obs.mode == "FADING":
            return "pass"

        # 2. Track stuck state in overworld
        current_pos = (obs.map_id, obs.x, obs.y)
        if obs.mode == "OVERWORLD":
            if current_pos == self.last_pos:
                self.stuck_counter += 1
            else:
                self.stuck_counter = 0
                self.last_pos = current_pos
        else:
            self.stuck_counter = 0

        # 3. Post-dialogue anti-interaction cooldown:
        # If a dialogue/menu just closed, force a directional step away to prevent
        # immediately re-triggering interactive tiles (TVs, PCs, Bookshelves, Signs).
        if not obs.dialogue_open and self.just_closed_dialogue_ticks > 0:
            self.just_closed_dialogue_ticks -= 1
            # Step in last direction to move off interaction tile
            return self.nav_ctrl.last_direction or "down"

        # 4. Dialogue and Intro Handling
        if obs.mode in ("INTRO", "DIALOGUE", "MENU") or obs.dialogue_open:
            self.just_closed_dialogue_ticks = 3
            return self.dialogue_ctrl.handle(obs, self.stuck_counter)

        # 5. Battle Handling
        if obs.mode == "BATTLE" or obs.battle_status != 0:
            return self.battle_ctrl.handle(obs, self.stuck_counter)

        # 6. Overworld Navigation Handling
        # Check if inside a Pokémon Center (Map IDs: Viridian Center 0x18, Pewter Center 0x3A, etc.)
        if obs.map_id in (0x18, 0x3A, 0x33, 0x3C, 0x48):
            return self.healing_ctrl.handle_center(obs, self.stuck_counter)

        # Standard navigation to milestone waypoint
        tx, ty, desc = self.nav_ctrl.get_objective(obs)
        return self.nav_ctrl.get_move(obs, tx, ty, self.stuck_counter)

"""
Rule-Based Baseline Agent with Anti-Stuck Avoidance and Structured Logging.
Coordinates dialogue progression, collision recovery, overworld waypoint pathing,
and turn-based battles deterministically without random choices.
"""
from typing import Tuple, List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .base_agent import BaseAgent
from controllers.dialogue import DialogueController
from controllers.navigation import NavigationController
from controllers.battle import BattleController
from controllers.healing import HealingController
from controllers.structured_logger import StructuredDecisionLogger


class RuleBaselineAgent(BaseAgent):
    def __init__(self):
        super().__init__(name="RuleBaselineAgent")
        self.dialogue_ctrl = DialogueController()
        self.nav_ctrl = NavigationController()
        self.battle_ctrl = BattleController()
        self.healing_ctrl = HealingController()
        self.logger = StructuredDecisionLogger()

        self.last_pos: Tuple[int, int, int] = (-1, -1, -1)  # (map, x, y)
        self.stuck_counter = 0
        self.just_closed_dialogue_ticks = 0

    def act(self, obs) -> str:
        """
        Determines the best deterministic action for the current GameObservation.
        """
        # 1. Respect screen transitions / fades: never spam buttons during fade
        if getattr(obs, "is_fading", False) or getattr(obs, "mode", "") == "FADING":
            self.logger.log_decision(
                obs=obs,
                selected_action="pass",
                current_objective="WAIT_FOR_FADE",
                expected_state_change="Wait for BGP palette fade-in",
                actual_state_change="Fading"
            )
            return "pass"

        # 2. Track stuck state in overworld
        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        map_id = getattr(obs, "map_id", 0)
        current_pos = (map_id, curr_x, curr_y)

        if getattr(obs, "mode", "OVERWORLD") == "OVERWORLD":
            if current_pos == self.last_pos:
                self.stuck_counter += 1
            else:
                self.stuck_counter = 0
                self.last_pos = current_pos
        else:
            self.stuck_counter = 0

        action = "pass"
        objective_name = "OVERWORLD_NAVIGATION"
        has_dialogue = getattr(obs, "dialogue_open", getattr(obs, "has_dialogue", False))
        mode = getattr(obs, "mode", "OVERWORLD")
        battle_status = getattr(obs, "battle_status", 0)

        # 3. Post-dialogue anti-interaction cooldown:
        # Step away immediately to prevent re-opening dialogue on interactive tiles
        if not has_dialogue and self.just_closed_dialogue_ticks > 0:
            self.just_closed_dialogue_ticks -= 1
            action = self.nav_ctrl.last_direction or "down"
            objective_name = "COOLDOWN_STEP_AWAY"

        # 4. Dialogue and Intro Handling
        elif mode in ("INTRO", "DIALOGUE", "MENU") or has_dialogue:
            self.just_closed_dialogue_ticks = 3
            action = self.dialogue_ctrl.handle(obs, self.stuck_counter)
            objective_name = "ADVANCE_DIALOGUE"

        # 5. Battle Handling
        elif mode == "BATTLE" or battle_status != 0:
            lead_pp = getattr(obs, "lead_move_pps", None)
            action = self.battle_ctrl.handle(obs, self.stuck_counter, lead_pp=lead_pp)
            objective_name = "BATTLE_ACTION"

        # 6. Pokémon Center Healing Handling
        elif map_id in (0x18, 0x29, 0x3A, 0x40):
            action = self.healing_ctrl.handle_center(obs, self.stuck_counter)
            objective_name = "HEALING_CENTER"

        # 7. Standard Navigation with Collision Detour
        else:
            tx, ty, desc = self.nav_ctrl.get_objective(obs)
            action = self.nav_ctrl.get_move(obs, tx, ty, self.stuck_counter)
            objective_name = desc

        # Log decision
        self.logger.log_decision(
            obs=obs,
            selected_action=action,
            current_objective=objective_name,
            expected_state_change="State advancement",
            actual_state_change="Pending",
            retry_count=self.stuck_counter,
            lead_pp=getattr(obs, "lead_move_pps", None)
        )

        return action

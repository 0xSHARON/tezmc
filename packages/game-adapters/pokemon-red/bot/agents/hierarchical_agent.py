"""
Hierarchical Multi-Controller Agent with Multi-Signal Loop Detection and Intelligent Recovery.
Coordinates dialogue progression, overworld waypoint pathing, turn-based battle,
anti-stuck avoidance penalties, and structured decision logging without random choices.
"""
from typing import Optional, Tuple, List, Dict, Any
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .base_agent import BaseAgent
from .q_learning_agent import QLearningAgent
from controllers.dialogue import DialogueController
from controllers.navigation import NavigationController
from controllers.battle import BattleController
from controllers.healing import HealingController
from controllers.loop_detector import LoopDetector, LoopReport
from controllers.structured_logger import StructuredDecisionLogger


class HierarchicalAgent(BaseAgent):
    def __init__(self, q_agent: Optional[QLearningAgent] = None):
        super().__init__(name="HierarchicalAgent")
        self.dialogue_ctrl = DialogueController()
        self.nav_ctrl = NavigationController()
        self.battle_ctrl = BattleController()
        self.healing_ctrl = HealingController()
        self.q_agent = q_agent or QLearningAgent()
        
        # Diagnostics, loop detection & structured logging
        self.loop_detector = LoopDetector()
        self.logger = StructuredDecisionLogger()

        self.current_goal: str = "INITIALIZE"
        self.active_controller: str = "NONE"
        self.stuck_counter = 0
        self.last_pos = (-1, -1, -1)
        self.cooldown_ticks = 0
        self.recovery_mode = False
        self.recovery_attempts = 0

    def evaluate_meta_goal(self, obs) -> str:
        """
        Determines the high-level objective of the agent based on game state.
        """
        mode = getattr(obs, "mode", "OVERWORLD")
        battle_status = getattr(obs, "battle_status", 0)
        dialogue_open = getattr(obs, "dialogue_open", getattr(obs, "has_dialogue", False))
        map_id = getattr(obs, "map_id", 0)
        party_count = getattr(obs, "party_count", 0)
        party_hp_ratio = float(getattr(obs, "party_hp_ratio", getattr(obs, "lead_hp_ratio", 1.0)))

        if mode == "INTRO":
            return "COMPLETE_INTRO"
        if mode == "BATTLE" or battle_status != 0:
            return "WIN_BATTLE"
        if dialogue_open or mode in ("DIALOGUE", "MENU"):
            return "ADVANCE_DIALOGUE"
        if self.stuck_counter > 8:
            return "ESCAPE_STUCK_LOOP"
        if map_id in (0x18, 0x29, 0x3A, 0x40) and party_hp_ratio < 0.99:
            return "HEAL_PARTY"
        if party_count == 0:
            return "ACQUIRE_STARTER"
        if map_id == 0x00:
            return "EXIT_PALLET_TOWN"
        if map_id == 0x0C:
            return "TRAVERSE_ROUTE_1"
        if map_id == 0x01:
            return "EXPLORE_VIRIDIAN"
        return "GENERAL_EXPLORATION"

    def act(self, obs) -> str:
        """
        Meta-policy routing with multi-signal loop detection, 10-step recovery,
        and structured decision logging.
        """
        # Respect hardware screen fading
        if getattr(obs, "is_fading", False) or getattr(obs, "mode", "") == "FADING":
            self.active_controller = "FADE_GUARD"
            self.logger.log_decision(
                obs=obs,
                selected_action="pass",
                current_objective=self.current_goal,
                expected_state_change="Wait for palette fade-in to complete",
                actual_state_change="Screen fading"
            )
            return "pass"

        # Update position & stuck tracking
        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        map_id = getattr(obs, "map_id", 0)
        current_pos = (map_id, curr_x, curr_y)

        if getattr(obs, "mode", "OVERWORLD") == "OVERWORLD":
            if current_pos == self.last_pos:
                self.stuck_counter += 1
            else:
                self.stuck_counter = 0
                self.recovery_attempts = 0
                self.last_pos = current_pos
        else:
            self.stuck_counter = 0

        self.current_goal = self.evaluate_meta_goal(obs)

        # Preliminary action proposal
        proposed_action = "pass"
        recovery_reason = ""
        recovery_attempt = False

        # 1. Battle Mode
        if self.current_goal == "WIN_BATTLE":
            self.active_controller = "BATTLE_CONTROLLER"
            lead_pp = getattr(obs, "lead_move_pps", None)
            proposed_action = self.battle_ctrl.handle(obs, self.stuck_counter, lead_pp=lead_pp)

        # 2. Dialogue & Menu Mode
        elif self.current_goal in ("COMPLETE_INTRO", "ADVANCE_DIALOGUE"):
            self.active_controller = "DIALOGUE_CONTROLLER"
            self.cooldown_ticks = 3
            proposed_action = self.dialogue_ctrl.handle(obs, self.stuck_counter)

        # 3. Anti-interaction cooldown: step away immediately after dialogue closes
        elif not getattr(obs, "dialogue_open", False) and self.cooldown_ticks > 0:
            self.cooldown_ticks -= 1
            self.active_controller = "COOLDOWN_STEP"
            proposed_action = self.nav_ctrl.last_direction or "down"

        # 4. Healing Mode in Pokémon Center
        elif self.current_goal == "HEAL_PARTY":
            self.active_controller = "HEALING_CONTROLLER"
            proposed_action = self.healing_ctrl.handle_center(obs, self.stuck_counter)

        # 5. Overworld Navigation Planning
        else:
            self.active_controller = "NAVIGATION_PLANNER"
            tx, ty, desc = self.nav_ctrl.get_objective(obs)
            proposed_action = self.nav_ctrl.get_move(obs, tx, ty, self.stuck_counter)

        # 6. Multi-Signal Loop Detection Analysis
        loop_report: LoopReport = self.loop_detector.record_step(obs, proposed_action, self.current_goal)

        # 7. Intelligent Recovery Sequence (if loop or severe stuck detected)
        final_action = proposed_action
        if loop_report.is_loop or self.stuck_counter > 8:
            recovery_attempt = True
            self.recovery_attempts += 1
            recovery_reason = loop_report.suggested_recovery or "STUCK_COUNTER_EXCEEDED"
            self.active_controller = "INTELLIGENT_RECOVERY"

            # Execute state-appropriate recovery without random choices:
            if loop_report.loop_type in ("OSCILLATION", "WALL_COLLISION") or self.stuck_counter > 8:
                # Apply avoidance penalty to the blocked direction
                if self.nav_ctrl.last_direction:
                    pen_key = (map_id, curr_x, curr_y, self.nav_ctrl.last_direction)
                    self.nav_ctrl.avoidance_penalties[pen_key] = self.nav_ctrl.avoidance_penalties.get(pen_key, 0) + 20

                # Recompute deterministic detour towards objective
                tx, ty, _ = self.nav_ctrl.get_objective(obs)
                final_action = self.nav_ctrl.get_move(obs, tx, ty, self.stuck_counter)

                # Periodic dismissal of any hidden dialogue/interaction prompt
                if self.stuck_counter % 5 == 4:
                    final_action = "b"

            elif loop_report.loop_type == "MENU_STAGNATION":
                # Alternate B to dismiss stuck dialogue or menu
                final_action = "b" if (self.stuck_counter % 2 == 0) else "a"

            elif loop_report.loop_type == "BATTLE_STAGNATION":
                # Advance text or switch move slot
                final_action = "b" if (self.stuck_counter % 2 == 0) else "down"

        # 8. Structured Logging of Decision
        self.logger.log_decision(
            obs=obs,
            selected_action=final_action,
            current_objective=self.current_goal,
            expected_state_change=f"Progress via {self.active_controller}",
            actual_state_change="Pending next frame",
            retry_count=self.stuck_counter,
            recovery_attempt=recovery_attempt,
            recovery_reason=recovery_reason,
            loop_report=loop_report,
            lead_pp=getattr(obs, "lead_move_pps", None)
        )

        return final_action

    def save(self, filepath: str) -> None:
        self.q_agent.save(filepath)

    def load(self, filepath: str) -> None:
        self.q_agent.load(filepath)

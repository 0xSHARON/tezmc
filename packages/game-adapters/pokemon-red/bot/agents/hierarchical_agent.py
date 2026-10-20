"""
Hierarchical Multi-Controller Agent (Stage D).
High-level meta-planner that dynamically dispatches to specialized controllers:
- Dialogue/Menu Controller
- Battle Controller
- Healing Controller
- Navigation Controller
- Stuck Recovery Sub-policy
- Micro-RL Sub-policy
"""
import random
from typing import Optional, Tuple
from .base_agent import BaseAgent
from .rule_baseline_agent import RuleBaselineAgent
from .q_learning_agent import QLearningAgent
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from controllers.dialogue import DialogueController
from controllers.navigation import NavigationController
from controllers.battle import BattleController
from controllers.healing import HealingController


class HierarchicalAgent(BaseAgent):
    def __init__(self, q_agent: Optional[QLearningAgent] = None):
        super().__init__(name="HierarchicalAgent")
        self.dialogue_ctrl = DialogueController()
        self.nav_ctrl = NavigationController()
        self.battle_ctrl = BattleController()
        self.healing_ctrl = HealingController()
        self.q_agent = q_agent or QLearningAgent()

        self.current_goal: str = "INITIALIZE"
        self.active_controller: str = "NONE"
        self.stuck_counter = 0
        self.last_pos = (-1, -1, -1)
        self.cooldown_ticks = 0

    def evaluate_meta_goal(self, obs) -> str:
        """
        Determines the high-level objective of the agent.
        """
        if obs.mode == "INTRO":
            return "COMPLETE_INTRO"
        if obs.mode == "BATTLE" or obs.battle_status != 0:
            return "WIN_BATTLE"
        if obs.dialogue_open or obs.mode in ("DIALOGUE", "MENU"):
            return "ADVANCE_DIALOGUE"
        if self.stuck_counter > 10:
            return "ESCAPE_STUCK_LOOP"
        if obs.map_id in (0x18, 0x3A, 0x33, 0x3C, 0x48) and obs.party_hp_ratio < 0.99:
            return "HEAL_PARTY"
        if obs.party_count == 0:
            return "ACQUIRE_STARTER"
        if obs.map_id == 0x00:
            return "EXIT_PALLET_TOWN"
        if obs.map_id == 0x0C:
            return "TRAVERSE_ROUTE_1"
        if obs.map_id == 0x01:
            return "EXPLORE_VIRIDIAN"
        return "GENERAL_EXPLORATION"

    def act(self, obs) -> str:
        """
        Meta-policy routing: selects and executes specialized sub-controller.
        """
        # Respect hardware screen fading
        if obs.mode == "FADING":
            self.active_controller = "FADE_GUARD"
            return "pass"

        # Update position & stuck tracking
        current_pos = (obs.map_id, obs.x, obs.y)
        if obs.mode == "OVERWORLD":
            if current_pos == self.last_pos:
                self.stuck_counter += 1
            else:
                self.stuck_counter = 0
                self.last_pos = current_pos
        else:
            self.stuck_counter = 0

        self.current_goal = self.evaluate_meta_goal(obs)

        # 1. Recovery Mode when stuck
        if self.current_goal == "ESCAPE_STUCK_LOOP":
            self.active_controller = "STUCK_RECOVERY"
            # Alternate between B (to dismiss any hidden dialogs) and orthogonal jumps
            if self.stuck_counter % 3 == 0:
                return "b"
            return random.choice(["up", "down", "left", "right"])

        # 2. Battle Mode
        if self.current_goal == "WIN_BATTLE":
            self.active_controller = "BATTLE_CONTROLLER"
            return self.battle_ctrl.handle(obs, self.stuck_counter)

        # 3. Dialogue & Menu Mode
        if self.current_goal in ("COMPLETE_INTRO", "ADVANCE_DIALOGUE"):
            self.active_controller = "DIALOGUE_CONTROLLER"
            self.cooldown_ticks = 3
            return self.dialogue_ctrl.handle(obs, self.stuck_counter)

        # 4. Anti-interaction cooldown (moving away from PCs / Bookshelves after dialog closes)
        if not obs.dialogue_open and self.cooldown_ticks > 0:
            self.cooldown_ticks -= 1
            self.active_controller = "COOLDOWN_STEP"
            return self.nav_ctrl.last_direction or "down"

        # 5. Healing Mode in Pokémon Center
        if self.current_goal == "HEAL_PARTY":
            self.active_controller = "HEALING_CONTROLLER"
            return self.healing_ctrl.handle_center(obs, self.stuck_counter)

        # 6. Overworld Navigation with Q-Learning fallback
        self.active_controller = "NAVIGATION_PLANNER"
        tx, ty, desc = self.nav_ctrl.get_objective(obs)
        return self.nav_ctrl.get_move(obs, tx, ty, self.stuck_counter)

    def save(self, filepath: str) -> None:
        self.q_agent.save(filepath)

    def load(self, filepath: str) -> None:
        self.q_agent.load(filepath)

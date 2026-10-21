"""
Loop Detector & Anti-Stagnation Engine for Pokémon Red.
Detects repeated actions, state oscillation, wall collisions, battle stagnation,
and objective prerequisite deadlocks using multi-signal analysis.
"""
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
import time
import json
import os


@dataclass
class LoopReport:
    is_loop: bool = False
    loop_type: str = "NONE"             # REPEATED_ACTION, OSCILLATION, WALL_COLLISION, BATTLE_STAGNATION, OBJECTIVE_STAGNATION, MENU_STAGNATION
    severity: str = "NONE"             # LOW, MEDIUM, HIGH, CRITICAL
    action_pattern: List[str] = field(default_factory=list)
    state_cycle: List[Tuple[Any, ...]] = field(default_factory=list)
    suggested_recovery: str = "CONTINUE"
    details: Dict[str, Any] = field(default_factory=dict)


class LoopDetector:
    """
    Multi-signal loop detector:
    1. Repeated Action Detection (identical actions or period-2 / period-4 oscillations).
    2. State Stagnation Detection (normalized state fingerprints, position cycles).
    3. Objective Stagnation Detection (lack of progress towards milestone).
    """
    def __init__(
        self,
        repeated_action_threshold: int = 6,
        oscillation_window: int = 8,
        stagnation_threshold: int = 5,
        objective_stagnation_steps: int = 40
    ):
        self.repeated_action_threshold = repeated_action_threshold
        self.oscillation_window = oscillation_window
        self.stagnation_threshold = stagnation_threshold
        self.objective_stagnation_steps = objective_stagnation_steps

        self.action_history: List[str] = []
        self.state_history: List[Tuple[int, int, int, int, bool]] = []  # (map_id, x, y, battle, dialogue)
        self.position_history: List[Tuple[int, int]] = []
        self.objective_history: List[Tuple[str, int]] = []  # (obj_id, step)

        self.last_state_fingerprint: Optional[Tuple] = None
        self.stagnant_steps = 0
        self.current_objective_id: str = "NONE"
        self.current_objective_steps = 0
        self.loop_count = 0

    def record_step(self, obs, action: str, objective_id: str = "NONE") -> LoopReport:
        """
        Ingests the current observation and proposed action, updates rolling history,
        and analyzes all signals for loop patterns.
        """
        # 1. Update histories
        self.action_history.append(action)
        if len(self.action_history) > 30:
            self.action_history.pop(0)

        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        map_id = getattr(obs, "map_id", 0)
        in_battle = bool(getattr(obs, "in_battle", getattr(obs, "battle_status", 0) != 0))
        dialogue = bool(getattr(obs, "has_dialogue", getattr(obs, "dialogue_open", False)))
        mode = getattr(obs, "mode", "OVERWORLD")

        fingerprint = (map_id, curr_x, curr_y, int(in_battle), dialogue)
        self.state_history.append(fingerprint)
        if len(self.state_history) > 30:
            self.state_history.pop(0)

        self.position_history.append((curr_x, curr_y))
        if len(self.position_history) > 20:
            self.position_history.pop(0)

        # 2. Objective tracking
        if objective_id != self.current_objective_id:
            self.current_objective_id = objective_id
            self.current_objective_steps = 0
        else:
            self.current_objective_steps += 1

        # 3. Check for Screen Fade or Valid Long Cutscene (Not a loop)
        if getattr(obs, "is_fading", False) or mode == "FADING":
            return LoopReport(is_loop=False, loop_type="NONE", suggested_recovery="WAIT_FOR_FADE")

        # 4. Signal A: Repeated Action Detection
        # Check if same action has been repeated >= threshold times
        if len(self.action_history) >= self.repeated_action_threshold:
            recent_acts = self.action_history[-self.repeated_action_threshold:]
            if len(set(recent_acts)) == 1:
                repeated_act = recent_acts[0]
                # In dialogue or battle text, repeated 'a'/'b' can be normal up to a point,
                # but beyond 16 times it's a menu/dialogue stuck loop
                if repeated_act in ("a", "b"):
                    if len(self.action_history) >= 16 and len(set(self.action_history[-16:])) == 1:
                        self.loop_count += 1
                        return LoopReport(
                            is_loop=True,
                            loop_type="MENU_STAGNATION",
                            severity="HIGH",
                            action_pattern=self.action_history[-8:],
                            suggested_recovery="ALTERNATE_BUTTONS_AND_DISMISS",
                            details={"button": repeated_act, "count": 16}
                        )
                elif repeated_act in ("up", "down", "left", "right"):
                    # Walking in place without changing position
                    if len(self.position_history) >= 4 and len(set(self.position_history[-4:])) == 1:
                        self.loop_count += 1
                        return LoopReport(
                            is_loop=True,
                            loop_type="WALL_COLLISION",
                            severity="MEDIUM",
                            action_pattern=recent_acts,
                            suggested_recovery="APPLY_AVOIDANCE_PENALTY_AND_TURN",
                            details={"direction": repeated_act, "position": (curr_x, curr_y)}
                        )

        # 5. Signal A2: Alternating / Periodic Pattern Detection (e.g. LEFT -> RIGHT -> LEFT -> RIGHT)
        if len(self.action_history) >= 6:
            # Period 2 check: a, b, a, b, a, b
            acts = self.action_history[-6:]
            if acts[0] == acts[2] == acts[4] and acts[1] == acts[3] == acts[5] and acts[0] != acts[1]:
                # Verify positions are also oscillating
                if len(self.position_history) >= 6:
                    unique_pos = len(set(self.position_history[-6:]))
                    if unique_pos <= 2:
                        self.loop_count += 1
                        return LoopReport(
                            is_loop=True,
                            loop_type="OSCILLATION",
                            severity="HIGH",
                            action_pattern=acts,
                            state_cycle=list(self.position_history[-6:]),
                            suggested_recovery="BREAK_PERIODIC_OSCILLATION",
                            details={"period": 2, "pattern": [acts[0], acts[1]]}
                        )

            # Period 4 check: e.g. UP, RIGHT, DOWN, LEFT, UP, RIGHT, DOWN, LEFT
            if len(self.action_history) >= 8:
                acts8 = self.action_history[-8:]
                if acts8[0:4] == acts8[4:8] and len(set(acts8[0:4])) >= 2:
                    self.loop_count += 1
                    return LoopReport(
                        is_loop=True,
                        loop_type="OSCILLATION",
                        severity="HIGH",
                        action_pattern=acts8,
                        suggested_recovery="BREAK_PERIODIC_OSCILLATION",
                        details={"period": 4, "pattern": acts8[0:4]}
                    )

        # 6. Signal B: State Stagnation Detection
        if self.last_state_fingerprint == fingerprint:
            self.stagnant_steps += 1
        else:
            self.stagnant_steps = 0
            self.last_state_fingerprint = fingerprint

        # If overworld position hasn't moved despite 8+ actions
        if mode == "OVERWORLD" and not dialogue and not in_battle:
            if self.stagnant_steps >= 8:
                self.loop_count += 1
                return LoopReport(
                    is_loop=True,
                    loop_type="WALL_COLLISION",
                    severity="HIGH",
                    suggested_recovery="RECALCULATE_ROUTE_WITH_AVOIDANCE",
                    details={"stagnant_steps": self.stagnant_steps, "position": (curr_x, curr_y)}
                )

        # 7. Signal C: Objective Stagnation Detection
        if self.current_objective_steps > self.objective_stagnation_steps:
            # Over 40 steps on single objective without progress
            self.loop_count += 1
            return LoopReport(
                is_loop=True,
                loop_type="OBJECTIVE_STAGNATION",
                severity="MEDIUM",
                suggested_recovery="REEVALUATE_PREREQUISITES",
                details={"objective_id": self.current_objective_id, "steps": self.current_objective_steps}
            )

        return LoopReport(is_loop=False, loop_type="NONE", suggested_recovery="CONTINUE")

    def reset(self):
        """Reset history on map transition or major checkpoint."""
        self.action_history.clear()
        self.state_history.clear()
        self.position_history.clear()
        self.stagnant_steps = 0
        self.last_state_fingerprint = None
        self.current_objective_steps = 0

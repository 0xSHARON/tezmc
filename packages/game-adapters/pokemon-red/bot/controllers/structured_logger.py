"""
Structured Diagnostic Decision Logger for Pokémon Red Autonomous Gameplay.
Logs every decision, state change, battle telemetry, loop detection event,
and recovery attempt as structured JSON lines.
"""
import os
import json
import time
from typing import Dict, Any, Optional, List
from pathlib import Path


class StructuredDecisionLogger:
    def __init__(self, log_path: Optional[str] = None):
        if log_path is None:
            base_dir = Path(__file__).resolve().parent.parent
            log_dir = base_dir / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            self.log_path = str(log_dir / "decision_trace.jsonl")
        else:
            self.log_path = log_path
            Path(self.log_path).parent.mkdir(parents=True, exist_ok=True)

        self.step_index = 0
        self.last_logged_state: Optional[Dict[str, Any]] = None

    def log_decision(
        self,
        obs: Any,
        selected_action: str,
        current_objective: str = "UNKNOWN",
        prerequisites: Optional[List[str]] = None,
        expected_state_change: str = "",
        actual_state_change: str = "",
        retry_count: int = 0,
        recovery_attempt: bool = False,
        recovery_reason: str = "",
        loop_report: Optional[Any] = None,
        lead_pp: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Formats and records a complete structured record of the decision.
        """
        self.step_index += 1

        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        map_id = getattr(obs, "map_id", 0)
        map_name = getattr(obs, "map_name", f"Map-{map_id:#02x}")
        facing = getattr(obs, "facing", "down")
        mode = getattr(obs, "mode", "OVERWORLD")
        in_battle = bool(getattr(obs, "in_battle", getattr(obs, "battle_status", 0) != 0))
        party_hp_ratio = float(getattr(obs, "party_hp_ratio", getattr(obs, "lead_hp_ratio", 1.0)))
        party_count = getattr(obs, "party_count", 0)
        money = getattr(obs, "money", 0)
        badges = getattr(obs, "badges_count", getattr(obs, "badges", 0))

        record = {
            "step": self.step_index,
            "timestamp": time.time(),
            "game_state": {
                "mode": mode,
                "map_id": map_id,
                "map_name": map_name,
                "coordinates": {"x": curr_x, "y": curr_y},
                "facing": facing
            },
            "objective": {
                "name": current_objective,
                "prerequisites": prerequisites or []
            },
            "decision": {
                "selected_action": selected_action,
                "expected_state_change": expected_state_change,
                "actual_state_change": actual_state_change,
                "retry_count": retry_count
            },
            "telemetry": {
                "in_battle": in_battle,
                "party_count": party_count,
                "party_hp_ratio": round(party_hp_ratio, 3),
                "lead_move_pps": lead_pp or [],
                "badges": badges,
                "money": money
            },
            "recovery": {
                "attempted": recovery_attempt,
                "reason": recovery_reason,
                "loop_detected": loop_report.is_loop if loop_report else False,
                "loop_type": loop_report.loop_type if loop_report else "NONE"
            }
        }

        # Write to JSONL
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception as e:
            print(f"[StructuredLogger] Warning: failed to write log: {e}")

        self.last_logged_state = record
        return record

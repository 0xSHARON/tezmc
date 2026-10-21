"""
Unit and Integration Tests for LoopDetector, Intelligent Recovery, and Battle PP.
Verifies repeated action detection, oscillation breaking, wall collision avoidance,
dialogue anti-lock, full-HP nurse guard, and structured logging.
"""
import pytest
from dataclasses import dataclass
from typing import List, Dict, Any

from controllers.loop_detector import LoopDetector, LoopReport
from controllers.navigation import NavigationController
from controllers.battle import BattleController
from controllers.healing import HealingController
from controllers.dialogue import DialogueController
from controllers.structured_logger import StructuredDecisionLogger
from memory.objective_ledger import ObjectiveLedger


@dataclass
class MockObs:
    mode: str = "OVERWORLD"
    map_id: int = 0x00
    x: int = 10
    y: int = 10
    facing: str = "down"
    in_battle: bool = False
    battle_status: int = 0
    dialogue_open: bool = False
    has_dialogue: bool = False
    party_count: int = 1
    party_hp_ratio: float = 1.0
    lead_hp_ratio: float = 1.0
    badges: int = 0
    money: int = 3000
    is_fading: bool = False
    lead_move_pps: List[int] = None

    def __post_init__(self):
        if self.lead_move_pps is None:
            self.lead_move_pps = [35, 20, 0, 0]


def test_repeated_wall_collision_detection():
    detector = LoopDetector(repeated_action_threshold=6)
    obs = MockObs(x=5, y=5)

    # 5 steps walking UP into a wall without changing (x, y)
    for _ in range(5):
        report = detector.record_step(obs, "up")
        assert not report.is_loop

    # 6th step triggers WALL_COLLISION loop
    report = detector.record_step(obs, "up")
    assert report.is_loop
    assert report.loop_type == "WALL_COLLISION"
    assert "AVOIDANCE" in report.suggested_recovery


def test_period_two_oscillation_detection():
    detector = LoopDetector()

    # Agent oscillates left and right between (10, 10) and (11, 10)
    obs_a = MockObs(x=10, y=10)
    obs_b = MockObs(x=11, y=10)

    for i in range(5):
        obs = obs_a if i % 2 == 0 else obs_b
        act = "right" if i % 2 == 0 else "left"
        report = detector.record_step(obs, act)
        assert not report.is_loop

    # 6th alternating action triggers OSCILLATION loop
    report = detector.record_step(obs_b, "left")
    assert report.is_loop
    assert report.loop_type == "OSCILLATION"
    assert report.suggested_recovery == "BREAK_PERIODIC_OSCILLATION"


def test_menu_stagnation_detection():
    detector = LoopDetector()
    obs = MockObs(mode="DIALOGUE", dialogue_open=True)

    for _ in range(15):
        report = detector.record_step(obs, "a")
        assert not report.is_loop

    # 16 consecutive 'a' in menu/dialogue triggers MENU_STAGNATION
    report = detector.record_step(obs, "a")
    assert report.is_loop
    assert report.loop_type == "MENU_STAGNATION"


def test_battle_pp_depletion_and_move_cursor():
    ctrl = BattleController()
    obs = MockObs(mode="BATTLE", in_battle=True, battle_status=1, dialogue_open=False)

    # Move 1 has 0 PP, Move 2 has 20 PP
    depleted_pp = [0, 20, 15, 0]

    # Turn phase 0: select FIGHT
    act0 = ctrl.handle(obs, lead_pp=depleted_pp)
    assert act0 == "a"

    # Turn phase 1: move cursor down to Move 2 because Move 1 has 0 PP
    act1 = ctrl.handle(obs, lead_pp=depleted_pp)
    assert act1 == "down"

    # Turn phase 2: confirm selected move
    act2 = ctrl.handle(obs, lead_pp=depleted_pp)
    assert act2 == "a"


def test_navigation_avoidance_penalties():
    nav = NavigationController()
    obs = MockObs(map_id=0x00, x=10, y=10)

    # Simulate collision: moving 'up' failed to change position
    nav.last_direction = "up"
    nav.last_pos = (10, 10)
    nav.get_move(obs, target_x=10, target_y=5, stuck_counter=1)

    # Avoidance penalty should now be active for moving 'up' from (0x00, 10, 10)
    key = (0x00, 10, 10, "up")
    assert nav.avoidance_penalties.get(key, 0) > 0

    # Next move should choose an unpenalized detour (left or right) instead of repeatedly choosing 'up'
    next_move = nav.get_move(obs, target_x=10, target_y=5, stuck_counter=2)
    assert next_move in ("left", "right")


def test_healing_controller_full_hp_guard():
    ctrl = HealingController()

    # Party is already at 100% HP and not talking to nurse
    full_hp_obs = MockObs(map_id=0x18, x=3, y=4, party_hp_ratio=1.0, dialogue_open=False)
    act = ctrl.handle_center(full_hp_obs)

    # Must immediately step down to exit mat rather than initiating nurse interaction
    assert act == "down"


def test_objective_ledger_mark_blocked():
    ledger = ObjectiveLedger()
    summary_before = ledger.get_summary()

    # Mark starter objective blocked
    ledger.mark_blocked("OBJ_GET_STARTER", "Rival blocked path")
    assert ledger.objectives["OBJ_GET_STARTER"].status == "blocked"
    assert ledger.objectives["OBJ_GET_STARTER"].last_failure_reason == "Rival blocked path"

    # Recovery resets status to available
    ledger.reset_failed_objective("OBJ_GET_STARTER")
    assert ledger.objectives["OBJ_GET_STARTER"].status == "available"


def test_structured_decision_logger(tmp_path):
    log_file = str(tmp_path / "test_decision_trace.jsonl")
    logger = StructuredDecisionLogger(log_path=log_file)
    obs = MockObs(map_id=0x01, x=15, y=20)

    report = LoopReport(is_loop=True, loop_type="WALL_COLLISION", suggested_recovery="AVOID")
    record = logger.log_decision(
        obs=obs,
        selected_action="left",
        current_objective="NAVIGATE_VIRIDIAN",
        loop_report=report,
        recovery_attempt=True,
        recovery_reason="WALL_COLLISION"
    )

    assert record["step"] == 1
    assert record["decision"]["selected_action"] == "left"
    assert record["recovery"]["attempted"] is True
    assert record["recovery"]["loop_type"] == "WALL_COLLISION"
    assert record["game_state"]["coordinates"] == {"x": 15, "y": 20}

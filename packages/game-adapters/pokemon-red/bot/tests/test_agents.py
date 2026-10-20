"""
Unit tests for agents, environment, and persistence.
"""
import pytest
import os
import sys
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config.settings import DEFAULT_ROM_PATH, ACTIONS
from observations.state_builder import GameObservation
from agents.rule_baseline_agent import RuleBaselineAgent
from agents.q_learning_agent import QLearningAgent
from agents.hierarchical_agent import HierarchicalAgent
from environments.pokemon_gym import PokemonRedEnv


def test_rule_baseline_agent():
    agent = RuleBaselineAgent()
    # Mock observation
    mock_obs = GameObservation(
        mode="DIALOGUE",
        map_id=0x00,
        x=5,
        y=5,
        party_count=0,
        party_hp_ratio=1.0,
        party=[],
        money=0,
        badges=0,
        player_name="RED",
        rival_name="BLUE",
        battle_status=0,
        dialogue_open=True,
        confidence=0.9
    )
    action = agent.act(mock_obs)
    assert action in ACTIONS


def test_q_learning_agent_and_checkpoint():
    agent = QLearningAgent(alpha=0.1, gamma=0.9, epsilon=0.5)
    mock_obs = GameObservation(
        mode="OVERWORLD",
        map_id=0x26,
        x=3,
        y=6,
        party_count=0,
        party_hp_ratio=1.0,
        party=[],
        money=0,
        badges=0,
        player_name="RED",
        rival_name="BLUE",
        battle_status=0,
        dialogue_open=False,
        confidence=0.95
    )
    action = agent.act(mock_obs)
    assert action in ACTIONS

    # Test learning step
    state_key = agent.discretize_state(mock_obs)
    agent.learn({
        "state": state_key,
        "action": action,
        "reward": 1.0,
        "next_state": state_key,
        "done": False
    })
    assert len(agent.q_table) > 0

    # Test save and load
    test_ckpt = "tests/test_q_ckpt.json"
    agent.save(test_ckpt)
    assert os.path.exists(test_ckpt)

    new_agent = QLearningAgent()
    new_agent.load(test_ckpt)
    assert len(new_agent.q_table) == len(agent.q_table)

    if os.path.exists(test_ckpt):
        os.remove(test_ckpt)


def test_gym_environment():
    env = PokemonRedEnv(rom_path=DEFAULT_ROM_PATH, headless=True, speed=0, max_episode_steps=10)
    obs_vec, info = env.reset()
    assert obs_vec.shape == (10,)
    assert "map_id" in info

    next_obs_vec, reward, terminated, truncated, next_info = env.step(1)  # Action "up"
    assert next_obs_vec.shape == (10,)
    assert isinstance(reward, float)
    assert isinstance(terminated, bool)
    assert isinstance(truncated, bool)

    env.close()


def test_objective_ledger_progression():
    from memory.objective_ledger import ObjectiveLedger

    ledger = ObjectiveLedger(filepath="tests/test_ledger.json")
    summary = ledger.get_summary()
    assert summary["total_objectives"] > 40
    assert summary["completed_count"] >= 0

    # Simulate game progression telemetry
    mock_obs = GameObservation(
        mode="OVERWORLD",
        map_id=0x01,  # Viridian City
        x=10,
        y=15,
        party_count=1,
        party=[{"name": "CHARMANDER", "level": 6, "hp": 20, "max_hp": 20}],
        badges=1,     # Boulder Badge
        player_name="RED",
        rival_name="BLUE"
    )

    ledger.update_from_telemetry({"has_parcel": True, "pokedex_obtained": True}, mock_obs)
    new_summary = ledger.get_summary()

    # Verify objectives were marked complete based on state
    assert ledger.objectives["OBJ_GET_STARTER"].status == "completed"
    assert ledger.objectives["OBJ_BADGE_1_BOULDER"].status == "completed"
    assert new_summary["completed_count"] > 0
    assert new_summary["gym_badges_completed"] == 1

    # Test failure tracking and recovery
    target_id = "OBJ_BADGE_2_CASCADE"
    ledger.set_in_progress(target_id)
    assert ledger.objectives[target_id].status in ("in_progress", "locked", "available")

    for i in range(5):
        ledger.record_failure(target_id, "Wipeout against Starmie")
    assert ledger.objectives[target_id].status == "failed"
    assert ledger.objectives[target_id].retry_count == 5

    ledger.reset_failed_objective(target_id)
    assert ledger.objectives[target_id].status == "available"
    assert ledger.objectives[target_id].retry_count == 0

    if os.path.exists("tests/test_ledger.json"):
        os.remove("tests/test_ledger.json")


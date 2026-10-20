"""
Unit tests for vision, telemetry, and observation state builder.
"""
import pytest
import os
import sys
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config.settings import DEFAULT_ROM_PATH
from emulator.pyboy_adapter import PyBoyAdapter
from observations.screen_vision import ScreenVisionAnalyzer
from observations.ram_telemetry import RamTelemetryReader
from observations.state_builder import StateBuilder, GameObservation


def test_vision_analyzer():
    analyzer = ScreenVisionAnalyzer()
    # Test on blank frame
    blank = np.zeros((144, 160, 3), dtype=np.uint8)
    res = analyzer.analyze_frame(blank)
    assert "dialogue_box" in res
    assert "battle_screen" in res
    assert res["is_fading"] is True  # All black frame is detected as fading


def test_observation_pipeline():
    adapter = PyBoyAdapter(rom_path=DEFAULT_ROM_PATH, headless=True, speed=0)
    adapter.start()
    try:
        adapter.tick(30)
        builder = StateBuilder()
        obs = builder.build(adapter)

        assert isinstance(obs, GameObservation)
        assert obs.mode in ("INTRO", "FADING", "BATTLE", "DIALOGUE", "MENU", "OVERWORLD")
        assert 0.0 <= obs.confidence <= 1.0

        vec = obs.to_feature_vector()
        assert vec.shape == (10,)
        assert isinstance(vec, np.ndarray)
    finally:
        adapter.close()

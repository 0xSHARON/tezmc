"""
Unit tests for PyBoy emulator adapter.
"""
import pytest
import os
import sys

# Ensure pokemon-red-bot is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config.settings import DEFAULT_ROM_PATH, ADDR_BGP
from emulator.pyboy_adapter import PyBoyAdapter


def test_rom_exists():
    assert os.path.exists(DEFAULT_ROM_PATH), f"ROM not found at {DEFAULT_ROM_PATH}"


def test_emulator_startup_and_screen():
    adapter = PyBoyAdapter(rom_path=DEFAULT_ROM_PATH, headless=True, speed=0)
    adapter.start()
    try:
        # Tick a few frames
        adapter.tick(30)
        
        # Verify screen ndarray
        img = adapter.get_screen_ndarray()
        assert img is not None
        assert img.shape == (144, 160, 3)

        # Verify WRAM read
        bgp = adapter.read_wram(ADDR_BGP)
        assert isinstance(bgp, int)
        assert 0 <= bgp <= 255

        # Verify button input
        adapter.send_input("a", hold_frames=5)
        adapter.tick(10)
    finally:
        adapter.close()

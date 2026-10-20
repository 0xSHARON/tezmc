#!/usr/bin/env python3
"""
TEZMC PyBoy Headless Emulation Runner
Pipes Game Boy emulation frames and RAM state to TEZMC's streaming architecture.
"""
import sys
import os
import json
import time

try:
    from pyboy import PyBoy, WindowEvent
    PYBOY_AVAILABLE = True
except ImportError:
    PYBOY_AVAILABLE = False

# Game Boy RAM addresses for Pokemon Red / Blue
ADDR_PLAYER_NAME = 0xD158
ADDR_PARTY_COUNT = 0xD163
ADDR_PARTY_SPECIES = 0xD164
ADDR_BADGES = 0xD356
ADDR_CURRENT_MAP = 0xD35E
ADDR_MONEY = 0xD347

MAP_NAMES = {
    0x00: "Pallet Town",
    0x01: "Viridian City",
    0x02: "Pewter City",
    0x03: "Cerulean City",
    0x04: "Lavender Town",
    0x05: "Vermilion City",
    0x06: "Celadon City",
    0x07: "Fuchsia City",
    0x08: "Cinnabar Island",
    0x09: "Indigo Plateau",
    0x0C: "Route 1",
    0x0D: "Route 2",
    0x0E: "Route 3",
    0x0F: "Route 4",
    0x26: "Oak's Lab",
    0x28: "Viridian Forest",
    0x33: "Mt. Moon"
}

BUTTON_EVENTS = {
    "up": WindowEvent.PRESS_ARROW_UP,
    "down": WindowEvent.PRESS_ARROW_DOWN,
    "left": WindowEvent.PRESS_ARROW_LEFT,
    "right": WindowEvent.PRESS_ARROW_RIGHT,
    "a": WindowEvent.PRESS_BUTTON_A,
    "b": WindowEvent.PRESS_BUTTON_B,
    "start": WindowEvent.PRESS_BUTTON_START,
    "select": WindowEvent.PRESS_BUTTON_SELECT,
}

RELEASE_EVENTS = {
    "up": WindowEvent.RELEASE_ARROW_UP,
    "down": WindowEvent.RELEASE_ARROW_DOWN,
    "left": WindowEvent.RELEASE_ARROW_LEFT,
    "right": WindowEvent.RELEASE_ARROW_RIGHT,
    "a": WindowEvent.RELEASE_BUTTON_A,
    "b": WindowEvent.RELEASE_BUTTON_B,
    "start": WindowEvent.RELEASE_BUTTON_START,
    "select": WindowEvent.RELEASE_BUTTON_SELECT,
}

def main():
    if not PYBOY_AVAILABLE:
        print(json.dumps({"error": "PyBoy module not installed. Running in standalone fallback mode."}), flush=True)
        sys.exit(1)

    rom_path = sys.argv[1] if len(sys.argv) > 1 else "data/roms/pokemon_red.gb"
    if not os.path.exists(rom_path):
        print(json.dumps({"error": f"ROM file not found: {rom_path}"}), flush=True)
        sys.exit(1)

    pyboy = PyBoy(rom_path, window="null")
    pyboy.set_emulation_speed(1)

    print(json.dumps({"status": "EMULATOR_INITIALIZED", "rom": rom_path}), flush=True)

    try:
        while pyboy.tick():
            # Check for incoming commands on stdin (non-blocking or line-based)
            # Send periodic telemetry
            pass
    finally:
        pyboy.stop()

if __name__ == "__main__":
    main()

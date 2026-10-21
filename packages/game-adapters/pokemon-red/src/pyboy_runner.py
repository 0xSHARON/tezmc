#!/usr/bin/env python3
"""
TEZMC PyBoy Headless Emulation Runner for Pokémon Red
Loads authentic Game Boy ROMs (default: data/roms/pokemon_red_enhanced.gb)
Provides HTTP endpoints for 60FPS screen frames, real-time RAM inspection, and chat inputs.
"""
import sys
import os
import io
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

try:
    from pyboy import PyBoy  # type: ignore
    try:
        from pyboy.utils import WindowEvent  # type: ignore
    except ImportError:
        from pyboy import WindowEvent  # type: ignore
    PYBOY_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    PYBOY_AVAILABLE = False
    PyBoy = None
    WindowEvent = None

# Pokémon Red RAM Addresses
ADDR_BGP = 0xFF47
ADDR_FONT_LOADED = 0xCFC4
ADDR_CURRENT_MAP = 0xD35E
ADDR_PLAYER_X = 0xD362
ADDR_PLAYER_Y = 0xD361
ADDR_BATTLE = 0xD057
ADDR_PLAYER_NAME = 0xD158
ADDR_RIVAL_NAME = 0xD34A
ADDR_PARTY_COUNT = 0xD163
ADDR_PARTY_DATA = 0xD16B
ADDR_BADGES = 0xD356
ADDR_MONEY = 0xD347
ADDR_TEXT_ID = 0xC100

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
    0x25: "Player's House 1F",
    0x26: "Player's House 2F",
    0x27: "Rival's House",
    0x28: "Oak's Lab",
    0x18: "Viridian Pokecenter",
    0x29: "Viridian Pokecenter",
    0x2A: "Viridian Pokemart",
    0x32: "Viridian Forest Gate",
    0x33: "Viridian Forest",
    0x34: "Pewter Museum 1F",
    0x35: "Pewter Gym (Brock)",
    0x3A: "Pewter Pokecenter",
    0x3B: "Mt. Moon 1F",
    0x3C: "Mt. Moon B1F",
    0x3D: "Mt. Moon B2F",
    0x3E: "Cerulean Gym (Misty)",
    0x40: "Cerulean Pokecenter",
}

BADGE_NAMES = [
    "Boulder Badge", "Cascade Badge", "Thunder Badge", "Rainbow Badge",
    "Soul Badge", "Marsh Badge", "Volcano Badge", "Earth Badge"
]

PKMN_NAMES = {
    0x99: "BULBASAUR", 0x09: "IVYSAUR", 0x9A: "VENUSAUR",
    0xB0: "CHARMANDER", 0xB2: "CHARMELEON", 0xB4: "CHARIZARD",
    0xB1: "SQUIRTLE", 0xB3: "WARTORTLE", 0x1C: "BLASTOISE",
    0x24: "PIDGEY", 0x96: "PIDGEOTTO", 0x97: "PIDGEOT",
    0x54: "PIKACHU", 0x55: "RAICHU", 0x7B: "CATERPIE"
}

def decode_pkmn_text(bytes_arr):
    chars = []
    for b in bytes_arr:
        if b == 0x50 or b == 0x00:
            break
        elif 0x80 <= b <= 0x99:
            chars.append(chr(ord('A') + b - 0x80))
        elif 0xA0 <= b <= 0xB9:
            chars.append(chr(ord('a') + b - 0xA0))
        elif 0xF6 <= b <= 0xFF:
            chars.append(str(b - 0xF6))
        elif b == 0x7F:
            chars.append(' ')
        else:
            chars.append('')
    res = ''.join(chars).strip()
    return res if res else "RED"

def decode_bcd_money(b0, b1, b2):
    return (
        ((b0 >> 4) * 100000) + ((b0 & 0x0F) * 10000) +
        ((b1 >> 4) * 1000) + ((b1 & 0x0F) * 100) +
        ((b2 >> 4) * 10) + (b2 & 0x0F)
    )

class EmulationServer:
    def __init__(self, rom_path, port=3010):
        self.rom_path = rom_path
        self.port = port
        self.pyboy = None
        self.running = False
        self.lock = threading.Lock()
        self.latest_jpeg = None
        self.recent_commands = []
        self.last_input_time = time.time()
        self.last_action_desc = "GAME INITIALIZED"
        self.copilot_tick = 0
        self.state_file = rom_path.replace(".gb", ".state")
        self.last_pos = (0, 0, 0)
        self.stuck_counter = 0
        self.was_dialogue = False
        self.starter_picked = False

    def start(self):
        if not PYBOY_AVAILABLE:
            print("ERROR: PyBoy library is not installed.", flush=True)
            return

        print(f"[PyBoy] Initializing authentic Game Boy with {self.rom_path}...", flush=True)
        self.pyboy = PyBoy(self.rom_path, window="null")
        self.pyboy.set_emulation_speed(1)

        # Check if START_FRESH is requested (default 1 to ensure new streams start from beginning)
        start_fresh = os.environ.get("START_FRESH", "1").lower() in ("1", "true", "yes")
        if start_fresh and os.path.exists(self.state_file):
            try:
                os.remove(self.state_file)
                print(f"[PyBoy] START_FRESH active: Removed stale state file {self.state_file}", flush=True)
            except Exception as e:
                print(f"[PyBoy] Note on stale state removal: {e}", flush=True)
        elif not start_fresh and os.path.exists(self.state_file):
            try:
                with open(self.state_file, "rb") as f:
                    self.pyboy.load_state(f)
                print(f"[PyBoy] Loaded saved state from {self.state_file}", flush=True)
            except Exception as e:
                print(f"[PyBoy] Could not load state: {e}", flush=True)

        self.running = True
        self.emu_thread = threading.Thread(target=self._emulation_loop, daemon=True)
        self.emu_thread.start()

        self._start_http()

    def reset_game(self):
        with self.lock:
            if os.path.exists(self.state_file):
                try:
                    os.remove(self.state_file)
                    print(f"[PyBoy] Deleted state file {self.state_file} on reset", flush=True)
                except Exception as e:
                    print(f"[PyBoy] Note on state file removal: {e}", flush=True)
            if self.pyboy:
                try:
                    self.pyboy.stop()
                except Exception:
                    pass
            self.pyboy = PyBoy(self.rom_path, window="null")
            self.pyboy.set_emulation_speed(1)
            self.last_pos = (0, 0, 0)
            self.stuck_counter = 0
            self.starter_picked = False
            self.was_dialogue = False
            self.copilot_tick = 0
            self.last_action_desc = "GAME RESET: PLAYING FROM STARTING"
            print("[PyBoy] Fresh game started from title screen!", flush=True)
            return {"success": True, "message": "Emulation reset to title screen"}

    def _emulation_loop(self):
        fps = 60
        frame_time = 1.0 / fps
        last_save_time = time.time()

        while self.running and self.pyboy:
            t0 = time.time()

            with self.lock:
                self.pyboy.tick()
                self.copilot_tick += 1

                # Autonomous Intelligent Bot takes action if viewer idle > 1.5s
                idle_sec = time.time() - self.last_input_time
                if idle_sec > 1.5 and self.copilot_tick % 16 == 0:
                    self._ai_copilot_step()

                # Update screen buffer every 2 frames (~30 FPS rendering)
                if self.copilot_tick % 2 == 0:
                    img = self.pyboy.screen.image.convert("RGB")
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=85)
                    self.latest_jpeg = buf.getvalue()

            # Periodic state saving every 30 seconds
            if time.time() - last_save_time > 30.0:
                last_save_time = time.time()
                self._save_state()

            elapsed = time.time() - t0
            sleep_needed = frame_time - elapsed
            if sleep_needed > 0:
                time.sleep(sleep_needed)

    def _ai_copilot_step(self):
        """
        Intelligent state-aware Pokémon Red autonomous gameplay logic.
        Inspects exact Game Boy RAM addresses to progress through cutscenes, menus,
        battles, and overworld navigation without loops or getting stuck.
        """
        if not self.pyboy:
            return

        mem = self.pyboy.memory
        bgp = mem[ADDR_BGP]
        font_loaded = mem[ADDR_FONT_LOADED] & 1
        map_id = mem[ADDR_CURRENT_MAP]
        x = mem[ADDR_PLAYER_X]
        y = mem[ADDR_PLAYER_Y]
        in_battle = mem[ADDR_BATTLE]
        party_count = mem[ADDR_PARTY_COUNT]
        player_name_byte = mem[ADDR_PLAYER_NAME]
        rival_name_byte = mem[ADDR_RIVAL_NAME]

        joy_ignore = mem[0xCFCB]
        text_id = mem[0xC100]

        # 1. Screen fade protection: wait for scene to fade in
        if bgp == 0:
            return

        current_pos = (map_id, x, y)
        if current_pos == self.last_pos:
            self.stuck_counter += 1
        else:
            self.stuck_counter = 0
            self.last_pos = current_pos

        # Check if in intro/naming sequence (all joypad buttons blocked by engine)
        in_intro = (joy_ignore == 255 or player_name_byte in (0, 0x50) or rival_name_byte in (0, 0x50))

        # Check inventory for Oak's Parcel (Item ID 0x46)
        num_items = min(20, mem[0xD31D])
        has_parcel = any(mem[0xD31E + (i * 2)] == 0x46 for i in range(num_items))
        pokedex_obtained = bool(mem[0xD2F7] > 0 or (mem[0xD74E] & 0x01))

        # Check Party HP Ratio
        lead_curr_hp = (mem[ADDR_PARTY_DATA + 1] << 8) | mem[ADDR_PARTY_DATA + 2] if party_count > 0 else 20
        lead_max_hp = (mem[ADDR_PARTY_DATA + 34] << 8) | mem[ADDR_PARTY_DATA + 35] if party_count > 0 else 20
        hp_ratio = lead_curr_hp / max(1, lead_max_hp)

        badges_byte = mem[ADDR_BADGES]
        boulder_badge = bool(badges_byte & 1)

        # Decay avoidance penalties periodically
        if not hasattr(self, "avoidance_penalties"):
            self.avoidance_penalties = {}
        if not hasattr(self, "last_map_id"):
            self.last_map_id = map_id
        if not hasattr(self, "last_btn"):
            self.last_btn = "down"

        if map_id != self.last_map_id:
            self.avoidance_penalties.clear()
            self.last_map_id = map_id

        for k in list(self.avoidance_penalties.keys()):
            self.avoidance_penalties[k] = max(0, self.avoidance_penalties[k] - 1)
            if self.avoidance_penalties[k] == 0:
                del self.avoidance_penalties[k]

        # Record collision penalty if previous movement action produced no displacement
        if current_pos == self.last_pos and self.stuck_counter > 0 and self.last_btn in ("up", "down", "left", "right"):
            pen_key = (map_id, x, y, self.last_btn)
            self.avoidance_penalties[pen_key] = self.avoidance_penalties.get(pen_key, 0) + 15

        btn = None

        # 2. Battle State: Auto-fight with Move PP Verification and retreat on critical HP
        if in_battle != 0:
            self.was_dialogue = False
            self.battle_tick = getattr(self, "battle_tick", 0) + 1

            # In wild battles, if health is critical (< 20%), attempt to RUN
            if in_battle == 1 and hp_ratio < 0.20:
                run_phase = self.battle_tick % 4
                if run_phase == 0:
                    btn = "down"
                elif run_phase == 1:
                    btn = "right"
                elif run_phase == 2:
                    btn = "a"
                else:
                    btn = "b"
            else:
                # Combat attack cycle with PP check
                # Read move PPs for lead Pokémon (0xD188..0xD18B)
                pp1 = mem[0xD188] & 0x3F if party_count > 0 else 35
                pp2 = mem[0xD189] & 0x3F if party_count > 0 else 0
                pp3 = mem[0xD18A] & 0x3F if party_count > 0 else 0
                pp4 = mem[0xD18B] & 0x3F if party_count > 0 else 0
                usable = [idx + 1 for idx, p in enumerate([pp1, pp2, pp3, pp4]) if p > 0]
                best_slot = usable[0] if usable else 1

                if font_loaded != 0:
                    # Advance dialogue or battle message
                    btn = "a" if (self.battle_tick % 2 == 0) else "b"
                else:
                    phase = self.battle_tick % 4
                    if phase == 0:
                        btn = "a"  # Select FIGHT
                    elif phase == 1:
                        if best_slot == 2:
                            btn = "down"
                        elif best_slot == 3:
                            btn = "right"
                        elif best_slot == 4:
                            btn = "down"
                        else:
                            btn = "a"  # Confirm Move 1
                    elif phase == 2:
                        btn = "a"  # Execute Move
                    else:
                        btn = "b"  # Fallback text dismiss

        # 3. Intro Cutscene & Naming Screen State (joy_ignore == 255)
        elif in_intro and joy_ignore == 255:
            self.was_dialogue = True
            # Press A to select letters, periodically press START to confirm name
            if self.copilot_tick % 15 == 14:
                btn = "start"
            else:
                btn = "a"

        # 4. Text box or Scripted Dialogue State
        elif font_loaded != 0 or (joy_ignore != 0 and joy_ignore != 1):
            self.was_dialogue = True
            if map_id == 0x28 and party_count > 0 and not self.starter_picked:
                # Starter nickname prompt -> press B to decline nickname
                self.starter_picked = True
                btn = "b"
            elif self.stuck_counter > 20:
                # Menu stuck watchdog -> alternate B (dismiss) and A
                btn = "b" if (self.copilot_tick % 2 == 0) else "a"
            else:
                btn = "a" if (self.copilot_tick % 2 == 0) else "b"

        # 5. Dialogue just closed -> step away immediately to avoid reopening on interactive tiles!
        elif self.was_dialogue:
            self.was_dialogue = False
            if map_id == 0x26:
                btn = "right" if (x == 3 and y == 6) else "up"
            elif map_id == 0x28 and party_count == 0:
                btn = "up"
            else:
                btn = "down"

        # 6. Anti-Stuck Detour with Avoidance Penalties (Deterministic, No Randomness)
        elif self.stuck_counter > 8:
            candidates = ["up", "right", "down", "left"]
            best_dir = "down"
            min_penalty = float("inf")
            for d in candidates:
                pen = self.avoidance_penalties.get((map_id, x, y, d), 0)
                if pen < min_penalty:
                    min_penalty = pen
                    best_dir = d
            btn = best_dir
            if self.stuck_counter > 25 and self.stuck_counter % 5 == 0:
                btn = "b"  # Dismiss any hidden menu or interaction prompt

        # 7. Pokémon Center Healing (Viridian: 0x18, 0x29, Pewter: 0x3A, Cerulean: 0x40)
        elif map_id in (0x18, 0x29, 0x3A, 0x40):
            if hp_ratio < 0.99:
                if x < 3:
                    btn = "right"
                elif x > 3:
                    btn = "left"
                elif y > 4:
                    btn = "up"
                else:
                    btn = "a"  # Talk to nurse
            else:
                # Full health: immediately step down to exit mat to prevent nurse looping
                btn = "down"

        # 8. Overworld Map Progression & Waypoints
        elif map_id == 0x26:
            # Red's House 2F (Bedroom) -> Stairs at (7, 1)
            # Avoid the potted plant at x=4..7, y=6..7 and SNES at (3, 5)
            if x == 7:
                btn = "up"
            elif y > 2:
                if x == 3 and y == 6:
                    btn = "right" # step away from SNES
                elif y == 7:
                    btn = "up" if x >= 4 else "right"
                else:
                    btn = "up"
            elif y < 2:
                btn = "down"
            else:
                # Row 2 (y==2) is completely clear! Walk straight right to column 7
                btn = "right"

        elif map_id == 0x25:
            # Red's House 1F (Living Room) -> Door at (3, 7) or (3, 8)
            if y < 6:
                btn = "down"
            elif x > 3:
                btn = "left"
            elif x < 3:
                btn = "right"
            else:
                btn = "down"

        elif map_id == 0x00:
            # Pallet Town
            if party_count == 0:
                # Walk North into tall grass at (10, 1) to trigger Oak
                if x < 10:
                    btn = "right"
                elif x > 11:
                    btn = "left"
                else:
                    btn = "up"
            elif has_parcel and not pokedex_obtained:
                # Enter Oak's Lab to deliver parcel at (12, 11)
                if x < 12:
                    btn = "right"
                elif x > 12:
                    btn = "left"
                elif y < 11:
                    btn = "down"
                else:
                    btn = "up"
            else:
                # Head North into Route 1
                if x < 10:
                    btn = "right"
                elif x > 10:
                    btn = "left"
                else:
                    btn = "up"

        elif map_id == 0x28:
            # Oak's Lab
            if party_count == 0:
                # Walk to Pokeball table at (6, 3)
                if y > 4:
                    btn = "up"
                elif y < 4:
                    btn = "down"
                elif x < 6:
                    btn = "right"
                elif x > 6:
                    btn = "left"
                else:
                    btn = "a"
            elif has_parcel and not pokedex_obtained:
                # Approach Oak at (5, 2) to deliver parcel
                if y > 3:
                    btn = "up"
                elif x < 5:
                    btn = "right"
                elif x > 5:
                    btn = "left"
                else:
                    btn = "a"
            else:
                # Walk down to exit door at (5, 11)
                if x < 4:
                    btn = "right"
                elif x > 5:
                    btn = "left"
                else:
                    btn = "down"

        elif map_id == 0x0C:
            # Route 1
            if has_parcel and not pokedex_obtained:
                # Return South to Pallet Town (ledges face south, direct downward passage)
                if x < 8:
                    btn = "right"
                elif x > 12:
                    btn = "left"
                else:
                    btn = "down"
            else:
                # Heading North to Viridian City (avoids all south-facing ledges and tree blocks)
                if y >= 27:
                    # Pallet Town exit corridor
                    if x < 10:
                        btn = "right"
                    elif x > 12:
                        btn = "left"
                    else:
                        btn = "up"
                elif y >= 21:
                    # Bypass south-facing ledge/trees at Y=23-24 by moving to open corridor at X=12..14
                    if x < 12:
                        btn = "right"
                    elif x > 14:
                        btn = "left"
                    else:
                        btn = "up"
                elif y >= 15:
                    # Bypass ledge at Y=19: open gap is at X=8..9
                    if x > 9:
                        btn = "left"
                    elif x < 8:
                        btn = "right"
                    else:
                        btn = "up"
                elif y >= 4:
                    # Bypass trees at Y=14 and ledge at Y=4-5: open corridor is at X=14..16
                    if x < 14:
                        btn = "right"
                    elif x > 16:
                        btn = "left"
                    else:
                        btn = "up"
                else:
                    # Approach Viridian City entrance at X=10..11
                    if x < 10:
                        btn = "right"
                    elif x > 11:
                        btn = "left"
                    else:
                        btn = "up"

        elif map_id == 0x01:
            # Viridian City
            if hp_ratio < 0.50:
                # Enter Pokecenter at (13, 25)
                if x < 13:
                    btn = "right"
                elif x > 13:
                    btn = "left"
                elif y < 25:
                    btn = "down"
                elif y > 25:
                    btn = "up"
                else:
                    btn = "up"
            elif not has_parcel and not pokedex_obtained:
                # Enter Viridian Pokémart at (29, 19)
                if x < 29:
                    btn = "right"
                elif x > 29:
                    btn = "left"
                elif y < 19:
                    btn = "down"
                elif y > 19:
                    btn = "up"
                else:
                    btn = "up"
            elif has_parcel and not pokedex_obtained:
                # Exit South to Route 1 at (21, 35)
                if x < 21:
                    btn = "right"
                elif x > 21:
                    btn = "left"
                else:
                    btn = "down"
            else:
                # Pokedex obtained: Head North along the main asphalt road to Route 2 at (21, 0)
                if x < 21:
                    btn = "right"
                elif x > 21:
                    btn = "left"
                else:
                    btn = "up"

        elif map_id == 0x2A:
            # Viridian Pokémart
            if not has_parcel:
                # Approach clerk at counter (3, 5)
                if y > 5:
                    btn = "up"
                elif x > 3:
                    btn = "left"
                else:
                    btn = "a" # Receive Oak's Parcel
            else:
                # Exit Mart down at (3, 7)
                btn = "down"

        elif map_id == 0x0D:
            # Route 2 -> Head North to Viridian Forest South Gate (0x32) at (3, 43)
            if x < 3:
                btn = "right"
            elif x > 4:
                btn = "left"
            else:
                btn = "up"

        elif map_id == 0x32:
            # Viridian Forest South Gate -> Walk up through gate
            btn = "up"

        elif map_id == 0x33:
            # Viridian Forest Maze
            # Navigate towards North exit at (1, 0)
            if y > 35:
                # First corridor: walk up
                if x < 17:
                    btn = "right"
                elif x > 18:
                    btn = "left"
                else:
                    btn = "up"
            elif y > 20 and x < 24:
                # Turn right through clearing
                btn = "right"
            elif y > 12:
                # Walk up past trainer
                btn = "up"
            elif x > 2:
                # Turn left towards west path
                btn = "left"
            else:
                # Walk North to gate
                btn = "up"

        elif map_id == 0x02:
            # Pewter City
            if hp_ratio < 0.70:
                # Pokecenter at (13, 17)
                if x < 13:
                    btn = "right"
                elif x > 13:
                    btn = "left"
                elif y > 17:
                    btn = "up"
                else:
                    btn = "up"
            elif not boulder_badge:
                # Enter Pewter Gym at (16, 17)
                if x < 16:
                    btn = "right"
                elif x > 16:
                    btn = "left"
                elif y < 17:
                    btn = "down"
                elif y > 17:
                    btn = "up"
                else:
                    btn = "up"
            else:
                # Boulder Badge acquired: Head East into Route 3 at (39, 17)
                if y < 17:
                    btn = "down"
                elif y > 18:
                    btn = "up"
                else:
                    btn = "right"

        elif map_id == 0x27:
            # GameFAQs: Rival's House (Daisy gives Town Map)
            if not getattr(self, "town_map_obtained", False):
                if y > 4:
                    btn = "up"
                elif x < 2:
                    btn = "right"
                elif x > 2:
                    btn = "left"
                else:
                    btn = "a" # Talk to Daisy at (2, 3)
                    self.town_map_obtained = True
            else:
                btn = "down" # Exit Rival's House down to Pallet Town

        elif map_id == 0x35:
            # GameFAQs: Pewter Gym (Leader Brock - Geodude Lv 12, Onix Lv 14)
            # Walk up to Brock at (4, 3)
            if x < 4:
                btn = "right"
            elif x > 4:
                btn = "left"
            elif y > 3:
                btn = "up"
            else:
                btn = "a" # Battle Brock for Boulder Badge!

        elif map_id == 0x0E:
            # GameFAQs: Route 3 (Pewter to Mt. Moon)
            # Navigate East through trainers to Mt. Moon exterior at (59, 5) / (18, 5)
            if x < 58:
                if y < 4:
                    btn = "down"
                elif y > 8:
                    btn = "up"
                else:
                    btn = "right"
            else:
                btn = "up" # Enter Mt. Moon!

        elif map_id in (0x3B, 0x3C):
            # GameFAQs: Mt. Moon 1F & B1F (Cave maze)
            # Navigate through cave to lower level ladder at (17, 11)
            if y > 15:
                btn = "up"
            elif x < 17:
                btn = "right"
            elif y > 11:
                btn = "up"
            else:
                btn = "right"

        elif map_id == 0x3D:
            # GameFAQs: Mt. Moon B2F (Super Nerd Miguel & Dome/Helix Fossil)
            if x < 13:
                btn = "right"
            elif y > 8:
                btn = "up"
            elif x == 13 and y == 8:
                btn = "a" # Battle Super Nerd & pick Fossil!
            else:
                # Head North-East to ladder leading to Route 4 exit
                if x < 17:
                    btn = "right"
                else:
                    btn = "up"

        elif map_id == 0x0F:
            # GameFAQs: Route 4 (Ledges to Cerulean City)
            # Jump down eastern ledges towards Cerulean at (90, 10)
            if y < 10:
                btn = "down"
            elif y > 12:
                btn = "up"
            else:
                btn = "right"

        elif map_id == 0x03:
            # GameFAQs: Cerulean City (Gym 2 & Nugget Bridge)
            cascade_badge = bool(badges_byte & 2)
            if hp_ratio < 0.60:
                # Heal at Cerulean Pokecenter (19, 17)
                if x < 19:
                    btn = "right"
                elif x > 19:
                    btn = "left"
                elif y > 17:
                    btn = "up"
                else:
                    btn = "up"
            elif not cascade_badge:
                # Enter Cerulean Gym (Misty) at (30, 19)
                if x < 30:
                    btn = "right"
                elif x > 30:
                    btn = "left"
                elif y < 19:
                    btn = "down"
                elif y > 19:
                    btn = "up"
                else:
                    btn = "up"
            else:
                # Cascade Badge won: Head North onto Nugget Bridge (Route 24) at (20, 0)
                if x < 20:
                    btn = "right"
                elif x > 20:
                    btn = "left"
                else:
                    btn = "up"

        elif map_id == 0x3E:
            # GameFAQs: Cerulean Gym (Leader Misty - Staryu Lv 18, Starmie Lv 21)
            # Battle Misty at (4, 3)
            if x < 4:
                btn = "right"
            elif x > 4:
                btn = "left"
            elif y > 3:
                btn = "up"
            else:
                btn = "a" # Battle Misty for Cascade Badge!

        elif map_id in (0x23, 0x24):
            # GameFAQs: Route 24 (Nugget Bridge) & Route 25 (Path to Bill's Sea Cottage)
            if map_id == 0x23:
                # Nugget Bridge: defeat the 5 trainers heading North
                if x < 10:
                    btn = "right"
                elif x > 11:
                    btn = "left"
                else:
                    btn = "up"
            else:
                # Route 25: Head East to Bill's Cottage at (45, 3)
                if x < 45:
                    if y < 3:
                        btn = "down"
                    elif y > 6:
                        btn = "up"
                    else:
                        btn = "right"
                else:
                    btn = "up" # Enter Bill's Sea Cottage

        elif map_id == 0x39:
            # GameFAQs: Bill's Sea Cottage (Rescue Clefairy-Bill -> Get S.S. Ticket)
            if not getattr(self, "ss_ticket_obtained", False):
                if y > 4:
                    btn = "up"
                elif x < 4:
                    btn = "right"
                elif x > 4:
                    btn = "left"
                else:
                    btn = "a" # Talk to Bill / activate machine
                    self.ss_ticket_obtained = True
            else:
                btn = "down" # Exit cottage with S.S. Ticket

        else:
            # Default exploration with periodic directional sweep
            dirs = ["up", "down", "left", "right"]
            btn = dirs[(self.copilot_tick // 30) % 4]

        if btn:
            self.last_btn = btn
            self.pyboy.button(btn, 10)
            map_label = MAP_NAMES.get(map_id, f"Map {map_id:#04x}")
            self.last_action_desc = f"[AI BOT] ACTION [{btn.upper()}] ({map_label} ({x},{y}))"

    def _save_state(self):
        with self.lock:
            try:
                with open(self.state_file, "wb") as f:
                    self.pyboy.save_state(f)
            except Exception:
                pass

    def send_action(self, btn, sender="Viewer"):
        btn = btn.lower().strip()
        if btn.startswith("!"):
            btn = btn[1:]

        valid_buttons = ["a", "b", "start", "select", "up", "down", "left", "right"]
        if btn not in valid_buttons:
            return {"success": False, "error": f"Invalid button: {btn}"}

        with self.lock:
            self.pyboy.button(btn, 10)
            self.last_input_time = time.time()
            self.last_action_desc = f"[{sender.upper()}] PRESSED [{btn.upper()}]"
            self.recent_commands.insert(0, {
                "id": str(time.time()),
                "sender": sender,
                "command": btn.upper(),
                "timestamp": int(time.time() * 1000)
            })
            if len(self.recent_commands) > 8:
                self.recent_commands = self.recent_commands[:8]

        return {"success": True, "message": f"[{sender}] pressed [{btn.upper()}]!"}

    def get_state(self):
        with self.lock:
            if not self.pyboy:
                return {}

            mem = self.pyboy.memory
            player_bytes = [mem[ADDR_PLAYER_NAME + i] for i in range(11)]
            player_name = decode_pkmn_text(player_bytes)

            rival_bytes = [mem[ADDR_RIVAL_NAME + i] for i in range(11)]
            rival_name = decode_pkmn_text(rival_bytes)

            map_id = mem[ADDR_CURRENT_MAP]
            current_map = MAP_NAMES.get(map_id, f"Route / Area {map_id:#04x}")

            badges_byte = mem[ADDR_BADGES]
            badges = [BADGE_NAMES[i] for i in range(8) if (badges_byte & (1 << i))]

            money = decode_bcd_money(mem[ADDR_MONEY], mem[ADDR_MONEY + 1], mem[ADDR_MONEY + 2])
            party_count = min(6, mem[ADDR_PARTY_COUNT])

            party = []
            for i in range(party_count):
                offset = ADDR_PARTY_DATA + (i * 44)
                species_id = mem[ADDR_PARTY_COUNT + 1 + i]
                pkmn_name = PKMN_NAMES.get(species_id, f"PKMN-{species_id}")
                curr_hp = (mem[offset + 1] << 8) | mem[offset + 2]
                level = mem[offset + 3]
                max_hp = (mem[offset + 34] << 8) | mem[offset + 35]
                party.append({
                    "name": pkmn_name,
                    "level": max(1, level),
                    "currentHp": max(1, curr_hp),
                    "maxHp": max(1, max_hp),
                    "status": "OK",
                    "spriteIndex": (i % 6) + 1
                })

            # Evaluate dynamic canonical storyline objective
            num_items = min(20, mem[0xD31D])
            has_parcel = any(mem[0xD31E + (i * 2)] == 0x46 for i in range(num_items))
            pokedex_obtained = bool(mem[0xD2F7] > 0 or (mem[0xD74E] & 0x01))
            in_battle = bool(mem[ADDR_BATTLE] != 0)
            font_loaded = bool(mem[ADDR_FONT_LOADED] & 1)
            player_x = mem[ADDR_PLAYER_X]
            player_y = mem[ADDR_PLAYER_Y]

            if party_count == 0:
                current_objective = "Select Starter Pokémon in Oak's Lab"
            elif not has_parcel and not pokedex_obtained:
                current_objective = "Retrieve Oak's Parcel from Viridian Mart"
            elif has_parcel and not pokedex_obtained:
                current_objective = "Deliver Oak's Parcel to Prof. Oak in Pallet Town"
            elif not (badges_byte & 1):
                current_objective = "Defeat Gym Leader Brock for Boulder Badge"
            elif not (badges_byte & 2):
                current_objective = "Defeat Gym Leader Misty for Cascade Badge"
            elif not (badges_byte & 4):
                current_objective = "Defeat Gym Leader Lt. Surge for Thunder Badge"
            elif not (badges_byte & 8):
                current_objective = "Defeat Gym Leader Erika for Rainbow Badge"
            elif not (badges_byte & 16):
                current_objective = "Defeat Gym Leader Koga for Soul Badge"
            elif not (badges_byte & 32):
                current_objective = "Defeat Gym Leader Sabrina for Marsh Badge"
            elif not (badges_byte & 64):
                current_objective = "Defeat Gym Leader Blaine for Volcano Badge"
            elif not (badges_byte & 128):
                current_objective = "Defeat Gym Leader Giovanni for Earth Badge"
            else:
                current_objective = "Challenge Elite Four & Champion at Indigo Plateau"

            lead_curr_hp = party[0]["currentHp"] if party else 20
            lead_max_hp = party[0]["maxHp"] if party else 20

            return {
                "trainerName": player_name,
                "rivalName": rival_name,
                "currentMap": current_map,
                "mapId": map_id,
                "coordinates": {"x": player_x, "y": player_y},
                "currentObjective": current_objective,
                "badges": badges,
                "badgeCount": len(badges),
                "inBattle": in_battle,
                "inDialogue": font_loaded,
                "party": party,
                "partyCount": party_count,
                "partyHpRatio": round(lead_curr_hp / max(1, lead_max_hp), 3),
                "money": money if money > 0 else 3000,
                "hasParcel": has_parcel,
                "pokedexObtained": pokedex_obtained,
                "pokedexOwned": max(1, party_count),
                "pokedexSeen": max(3, party_count * 2),
                "stepCount": self.copilot_tick,
                "mode": "anarchy",
                "democracyVotes": {},
                "recentCommands": self.recent_commands,
                "lastAction": self.last_action_desc,
                "romLoaded": True,
                "romTitle": self.pyboy.cartridge_title,
                "fps": 60
            }

    def _start_http(self):
        emu = self

        class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
            daemon_threads = True

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                pass  # Silence noisy request logs

            def do_GET(self):
                if self.path == "/screen" or self.path == "/screen.jpg":
                    jpeg = emu.latest_jpeg
                    if not jpeg:
                        self.send_response(503)
                        self.end_headers()
                        return
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("Content-Length", str(len(jpeg)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                    self.end_headers()
                    self.wfile.write(jpeg)
                    return

                if self.path == "/stream" or self.path == "/stream.mjpg":
                    self.send_response(200)
                    self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=--frame")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                    self.end_headers()
                    try:
                        while emu.running:
                            jpeg = emu.latest_jpeg
                            if jpeg:
                                self.wfile.write(b"--frame\r\n")
                                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                                self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                                self.wfile.write(jpeg)
                                self.wfile.write(b"\r\n")
                            time.sleep(1.0 / 30.0)
                    except (BrokenPipeError, ConnectionResetError):
                        return
                    return

                if self.path == "/state":
                    state = emu.get_state()
                    body = json.dumps(state).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(body)
                    return

                self.send_response(404)
                self.end_headers()

            def do_POST(self):
                if self.path == "/action":
                    content_length = int(self.headers.get("Content-Length", 0))
                    raw_body = self.rfile.read(content_length).decode("utf-8")
                    try:
                        data = json.loads(raw_body)
                        btn = data.get("action") or data.get("command")
                        sender = data.get("sender", "Viewer")
                        res = emu.send_action(btn, sender)
                        body = json.dumps(res).encode("utf-8")
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(body)))
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(body)
                        return
                    except Exception as e:
                        err_body = json.dumps({"error": str(e)}).encode("utf-8")
                        self.send_response(400)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(err_body)))
                        self.end_headers()
                        self.wfile.write(err_body)
                        return

                if self.path == "/reset":
                    try:
                        res = emu.reset_game()
                        body = json.dumps(res).encode("utf-8")
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(body)))
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(body)
                        return
                    except Exception as e:
                        err_body = json.dumps({"error": str(e)}).encode("utf-8")
                        self.send_response(500)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(err_body)))
                        self.end_headers()
                        self.wfile.write(err_body)
                        return

                self.send_response(404)
                self.end_headers()

        server = ThreadedHTTPServer(("0.0.0.0", self.port), Handler)
        print(f"[PyBoy] Emulation server listening on http://0.0.0.0:{self.port}", flush=True)
        try:
            server.serve_forever()
        finally:
            self._save_state()
            if self.pyboy:
                self.pyboy.stop()

def main():
    rom_arg = sys.argv[1] if len(sys.argv) > 1 else None
    candidates = [
        rom_arg,
        "data/roms/pokemon_red_enhanced.gb",
        "data/roms/pokemon_red.gb",
        "/app/data/roms/pokemon_red_enhanced.gb",
        "/app/data/roms/pokemon_red.gb"
    ]
    rom_path = next((c for c in candidates if c and os.path.exists(c)), None)

    if not rom_path:
        print(f"ERROR: No valid ROM found. Candidates checked: {candidates}", flush=True)
        sys.exit(1)

    port = int(os.environ.get("PYBOY_PORT", 3010))
    server = EmulationServer(rom_path, port=port)
    server.start()

if __name__ == "__main__":
    main()

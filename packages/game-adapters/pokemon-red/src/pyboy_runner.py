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
ADDR_PLAYER_NAME = 0xD158
ADDR_RIVAL_NAME = 0xD34A
ADDR_PARTY_COUNT = 0xD163
ADDR_PARTY_DATA = 0xD16B
ADDR_BADGES = 0xD356
ADDR_CURRENT_MAP = 0xD35E
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
    0x26: "Oak's Lab",
    0x27: "Player's House 1F",
    0x28: "Player's House 2F",
    0x29: "Rival's House",
    0x2A: "Viridian Pokecenter",
    0x33: "Mt. Moon",
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

    def start(self):
        if not PYBOY_AVAILABLE:
            print("ERROR: PyBoy library is not installed.", flush=True)
            return

        print(f"[PyBoy] Initializing authentic Game Boy with {self.rom_path}...", flush=True)
        self.pyboy = PyBoy(self.rom_path, window="null")
        self.pyboy.set_emulation_speed(1)

        # Load existing state if available
        if os.path.exists(self.state_file):
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

    def _emulation_loop(self):
        fps = 60
        frame_time = 1.0 / fps
        last_save_time = time.time()

        while self.running and self.pyboy:
            t0 = time.time()

            with self.lock:
                self.pyboy.tick()
                self.copilot_tick += 1

                # Co-pilot fallback if idle for > 4 seconds
                idle_sec = time.time() - self.last_input_time
                if idle_sec > 4.0 and self.copilot_tick % 45 == 0:
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
        # Progress intro cutscene / dialogue / world navigation
        btn = "a"
        if self.copilot_tick % 180 == 0:
            btn = "start"
        elif self.copilot_tick % 90 == 0:
            btn = "b"
        elif self.copilot_tick % 60 == 0:
            btn = ["up", "down", "left", "right"][((self.copilot_tick // 60) % 4)]

        self.pyboy.button(btn, 8)
        self.last_action_desc = f"[AI CO-PILOT] PRESSED [{btn.upper()}]"

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

            if not party:
                party = [{"name": "CHARMANDER", "level": 5, "currentHp": 20, "maxHp": 20, "status": "OK", "spriteIndex": 1}]

            return {
                "trainerName": player_name,
                "rivalName": rival_name,
                "currentMap": current_map,
                "badges": badges,
                "party": party,
                "money": money if money > 0 else 3000,
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

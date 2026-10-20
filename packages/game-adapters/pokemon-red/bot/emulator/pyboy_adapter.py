"""
PyBoy Game Boy Emulator Adapter.
Provides clean interface for frame capture, deterministic stepping, save-states, and button controls.
"""
import os
import io
import time
from pathlib import Path
from typing import Optional, Union, Tuple, List
import numpy as np
from PIL import Image

try:
    from pyboy import PyBoy
    from pyboy.utils import WindowEvent
    PYBOY_AVAILABLE = True
except (ImportError, ModuleNotFoundError):
    PYBOY_AVAILABLE = False
    PyBoy = None
    WindowEvent = None

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import (
    DEFAULT_ROM_PATHS,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    BUTTON_MAP,
    ADDR_BGP,
    ADDR_CURRENT_MAP,
    ADDR_PLAYER_X,
    ADDR_PLAYER_Y
)

class EmulatorCrashError(Exception):
    """Raised when the emulator fails or stops responding."""
    pass

class PyBoyAdapter:
    def __init__(
        self,
        rom_path: Optional[Union[str, Path]] = None,
        headless: bool = True,
        speed: int = 1,
        sound: bool = False
    ):
        if not PYBOY_AVAILABLE:
            raise ImportError("PyBoy is not installed. Please install pyboy via pip.")

        self.rom_path = self._resolve_rom(rom_path)
        self.headless = headless
        self.speed = speed
        self.sound = sound
        self.pyboy: Optional[PyBoy] = None
        self._is_open = False
        self._total_ticks = 0
        self._last_tick_time = time.time()
        self._last_frame_hash = None
        self._frozen_frame_count = 0

    def _resolve_rom(self, candidate: Optional[Union[str, Path]]) -> Path:
        if candidate and Path(candidate).is_file():
            return Path(candidate).resolve()

        for default_candidate in DEFAULT_ROM_PATHS:
            p = Path(default_candidate)
            if p.is_file():
                return p.resolve()

        raise FileNotFoundError(f"No Pokémon Red ROM found. Checked: {DEFAULT_ROM_PATHS}")

    def start(self) -> None:
        """Launch the Game Boy emulator."""
        if self._is_open and self.pyboy:
            return

        window = "null" if self.headless else "SDL2"
        self.pyboy = PyBoy(
            str(self.rom_path),
            window=window,
            sound=self.sound
        )
        self.pyboy.set_emulation_speed(self.speed)
        self._is_open = True
        self._total_ticks = 0
        self._last_tick_time = time.time()

    def stop(self) -> None:
        """Gracefully shutdown the emulator."""
        if self.pyboy and self._is_open:
            try:
                self.pyboy.stop()
            except Exception:
                pass
            self.pyboy = None
            self._is_open = False

    def reset(self, initial_state_path: Optional[Union[str, Path]] = None) -> None:
        """Reset the game or load an initial training state."""
        if not self._is_open or not self.pyboy:
            self.start()

        if initial_state_path and Path(initial_state_path).is_file():
            self.load_state(initial_state_path)
        else:
            # Cold reboot emulator with original ROM
            self.stop()
            self.start()

        self._frozen_frame_count = 0

    def set_speed(self, speed: int) -> None:
        """Set emulation speed: 0 = unthrottled/fastest for training, 1 = 60 FPS normal play."""
        self.speed = speed
        if self.pyboy:
            self.pyboy.set_emulation_speed(speed)

    def tick(self, frames: int = 1) -> None:
        """Advance emulation by N frames."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        for _ in range(frames):
            self.pyboy.tick()
            self._total_ticks += 1
        self._last_tick_time = time.time()

    def send_button(self, button_name: str, hold_frames: int = 10, wait_frames: int = 10) -> bool:
        """Send a button press for hold_frames, then wait wait_frames."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")

        btn = button_name.lower().strip()
        if btn == "pass" or btn == "none":
            self.tick(hold_frames + wait_frames)
            return True

        valid_buttons = ["up", "down", "left", "right", "a", "b", "start", "select"]
        if btn not in valid_buttons:
            return False

        self.pyboy.button(btn, hold_frames)
        self.tick(hold_frames + wait_frames)
        return True

    def send_action_id(self, action_id: int, hold_frames: int = 10, wait_frames: int = 10) -> bool:
        """Send button action by integer ID (for RL policies)."""
        btn = BUTTON_MAP.get(action_id, "pass")
        return self.send_button(btn, hold_frames, wait_frames)

    def get_screen_image(self) -> Image.Image:
        """Capture current Game Boy 160x144 frame as PIL Image."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        return self.pyboy.screen.image.convert("RGB")

    def get_screen_ndarray(self) -> np.ndarray:
        """Capture current frame as (144, 160, 3) uint8 numpy array."""
        img = self.get_screen_image()
        return np.array(img, dtype=np.uint8)

    def get_screen_jpeg(self, quality: int = 85) -> bytes:
        """Return compressed JPEG bytes (for dashboard / streaming)."""
        img = self.get_screen_image()
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue()

    def read_memory(self, address: int) -> int:
        """Read a single byte from Game Boy RAM."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        return self.pyboy.memory[address]

    def read_memory_range(self, start_address: int, length: int) -> List[int]:
        """Read a slice of Game Boy RAM."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        return [self.pyboy.memory[start_address + i] for i in range(length)]

    def save_state(self, file_path: Union[str, Path]) -> None:
        """Save full emulator memory state to file."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            self.pyboy.save_state(f)

    def load_state(self, file_path: Union[str, Path]) -> None:
        """Load full emulator memory state from file."""
        if not self.pyboy:
            raise EmulatorCrashError("PyBoy instance is not running.")
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"Save state not found: {path}")
        with open(path, "rb") as f:
            self.pyboy.load_state(f)

    def detect_freeze(self, frame_threshold: int = 600) -> bool:
        """Detect if the screen has remained 100% identical for too long."""
        cur_img = self.get_screen_ndarray()
        cur_hash = hash(cur_img.tobytes()[:2048])
        if cur_hash == self._last_frame_hash:
            self._frozen_frame_count += 1
        else:
            self._frozen_frame_count = 0
            self._last_frame_hash = cur_hash

        return self._frozen_frame_count > frame_threshold

    @property
    def is_alive(self) -> bool:
        return self._is_open and self.pyboy is not None

    def close(self):
        """Alias for stop()."""
        self.stop()

    def read_wram(self, address: int) -> int:
        """Alias for read_memory()."""
        return self.read_memory(address)

    def send_input(self, button_name: str, hold_frames: int = 10, wait_frames: int = 5) -> bool:
        """Alias for send_button()."""
        return self.send_button(button_name, hold_frames, wait_frames)

    def is_frozen(self, check_frames: int = 600) -> bool:
        """Alias for detect_freeze()."""
        return self.detect_freeze(check_frames)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()

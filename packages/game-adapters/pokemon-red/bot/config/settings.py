"""
Configuration and constants for Pokémon Red AI Bot.
"""
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent

def _find_rom_paths():
    candidates = []
    # Search upwards for data/roms
    curr = BASE_DIR
    for _ in range(5):
        rom_dir = curr / "data" / "roms"
        if rom_dir.is_dir():
            candidates.append(rom_dir / "pokemon_red_enhanced.gb")
            candidates.append(rom_dir / "pokemon_red.gb")
        curr = curr.parent

    candidates.extend([
        Path("data/roms/pokemon_red_enhanced.gb"),
        Path("data/roms/pokemon_red.gb"),
        Path("/app/data/roms/pokemon_red_enhanced.gb"),
    ])
    return candidates

DEFAULT_ROM_PATHS = _find_rom_paths()

def get_default_rom_path() -> str:
    for p in DEFAULT_ROM_PATHS:
        if p.exists():
            return str(p.resolve())
    return str(DEFAULT_ROM_PATHS[0].resolve()) if DEFAULT_ROM_PATHS else "data/roms/pokemon_red_enhanced.gb"

DEFAULT_ROM_PATH = get_default_rom_path()
ACTIONS = ["pass", "up", "down", "left", "right", "a", "b", "start", "select"]
EMULATOR_SPEED = 0
HEADLESS_DEFAULT = True
RL_GAMMA = 0.99
RL_LR = 0.1
RL_EPSILON_START = 1.0
RL_EPSILON_MIN = 0.05
RL_EPSILON_DECAY = 0.995

CHECKPOINTS_DIR = BASE_DIR / "checkpoints"
LOGS_DIR = BASE_DIR / "logs"
MEMORY_DIR = BASE_DIR / "memory"

# Game Boy / PyBoy Screen Spec
SCREEN_WIDTH = 160
SCREEN_HEIGHT = 144
EMULATION_SPEED_PLAY = 1
EMULATION_SPEED_TRAIN = 0  # Max headless throughput

# Valid controller inputs
BUTTON_MAP = {
    0: "up",
    1: "down",
    2: "left",
    3: "right",
    4: "a",
    5: "b",
    6: "start",
    7: "select",
    8: "pass"  # Do nothing / observe frame
}

# Pokémon Red RAM Addresses (WRAM & HRAM)
ADDR_BGP = 0xFF47              # Background palette (0 = faded out/transition)
ADDR_FONT_LOADED = 0xCFC4      # Bit 0 set if text box / dialog / menu is active
ADDR_JOY_IGNORE = 0xCD6B       # Joypad ignore flags
ADDR_CURRENT_MAP = 0xD35E      # Active map ID
ADDR_PLAYER_X = 0xD362         # Player X coordinate (tiles)
ADDR_PLAYER_Y = 0xD361         # Player Y coordinate (tiles)
ADDR_PLAYER_FACING = 0xC109    # 0=Down, 4=Up, 8=Left, 12=Right
ADDR_BATTLE = 0xD057           # 0=No battle, 1=Wild, 2=Trainer
ADDR_PLAYER_NAME = 0xD158      # Player name string (0x50 terminated)
ADDR_RIVAL_NAME = 0xD34A       # Rival name string
ADDR_PARTY_COUNT = 0xD163      # Number of Pokémon in party (0-6)
ADDR_PARTY_DATA = 0xD16B       # Start of party Pokémon structs
ADDR_BADGES = 0xD356           # Badge bitmask (1 byte)
ADDR_MONEY = 0xD347            # 3 bytes BCD
ADDR_TEXT_ID = 0xC100          # Textbox/Script ID

# Generation 1 Map Names (pret/pokered verified)
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
    0x29: "Viridian Pokecenter",
    0x2A: "Viridian Pokemart",
    0x2B: "Viridian School",
    0x33: "Mt. Moon",
}

# Pokémon Gen 1 Species Index Mapping
POKEMON_SPECIES = {
    0x99: "BULBASAUR", 0x09: "IVYSAUR", 0x9A: "VENUSAUR",
    0xB0: "CHARMANDER", 0xB2: "CHARMELEON", 0xB4: "CHARIZARD",
    0xB1: "SQUIRTLE", 0xB3: "WARTORTLE", 0x1C: "BLASTOISE",
    0x24: "PIDGEY", 0x96: "PIDGEOTTO", 0x97: "PIDGEOT",
    0xA5: "RATTATA", 0xA6: "RATICATE",
    0x54: "PIKACHU", 0x55: "RAICHU",
    0x7B: "CATERPIE", 0x7C: "METAPOD", 0x7D: "BUTTERFREE"
}

# Reinforcement Learning & Training Defaults
DEFAULT_CONFIG = {
    "gamma": 0.99,
    "alpha": 0.1,             # Learning rate
    "epsilon_start": 1.0,
    "epsilon_min": 0.05,
    "epsilon_decay": 0.995,
    "max_steps_per_episode": 600,
    "checkpoint_interval": 10,
    "stuck_threshold": 30,     # steps without position change
    "loop_threshold": 12,      # cycles of identical coordinate visits
}

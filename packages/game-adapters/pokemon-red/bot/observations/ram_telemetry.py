"""
Structured Game Boy RAM Telemetry for Pokémon Red.
Directly reads and decodes internal engine variables.
"""
from typing import Dict, Any, List, Optional
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import (
    ADDR_BGP,
    ADDR_FONT_LOADED,
    ADDR_JOY_IGNORE,
    ADDR_CURRENT_MAP,
    ADDR_PLAYER_X,
    ADDR_PLAYER_Y,
    ADDR_PLAYER_FACING,
    ADDR_BATTLE,
    ADDR_PLAYER_NAME,
    ADDR_RIVAL_NAME,
    ADDR_PARTY_COUNT,
    ADDR_PARTY_DATA,
    ADDR_BADGES,
    ADDR_MONEY,
    MAP_NAMES,
    POKEMON_SPECIES
)

def decode_pkmn_text(bytes_arr: List[int]) -> str:
    """Decodes Pokémon Gen 1 character table encoding."""
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

def decode_bcd_money(b0: int, b1: int, b2: int) -> int:
    """Decodes 3-byte Binary Coded Decimal money in Gen 1."""
    return (
        ((b0 >> 4) * 100000) + ((b0 & 0x0F) * 10000) +
        ((b1 >> 4) * 1000) + ((b1 & 0x0F) * 100) +
        ((b2 >> 4) * 10) + (b2 & 0x0F)
    )

class RamTelemetry:
    def __init__(self, emulator_adapter):
        self.emu = emulator_adapter

    def read_all(self) -> Dict[str, Any]:
        """Read full telemetry snapshot from RAM."""
        bgp = self.emu.read_memory(ADDR_BGP)
        font_loaded = self.emu.read_memory(ADDR_FONT_LOADED)
        joy_ignore = self.emu.read_memory(ADDR_JOY_IGNORE)
        map_id = self.emu.read_memory(ADDR_CURRENT_MAP)
        x = self.emu.read_memory(ADDR_PLAYER_X)
        y = self.emu.read_memory(ADDR_PLAYER_Y)
        facing_raw = self.emu.read_memory(ADDR_PLAYER_FACING)
        in_battle = self.emu.read_memory(ADDR_BATTLE)
        party_count = min(6, self.emu.read_memory(ADDR_PARTY_COUNT))

        # Decode trainer & rival names
        p_bytes = self.emu.read_memory_range(ADDR_PLAYER_NAME, 11)
        player_name = decode_pkmn_text(p_bytes)

        r_bytes = self.emu.read_memory_range(ADDR_RIVAL_NAME, 11)
        rival_name = decode_pkmn_text(r_bytes)

        # Money
        m_bytes = self.emu.read_memory_range(ADDR_MONEY, 3)
        money = decode_bcd_money(m_bytes[0], m_bytes[1], m_bytes[2])

        # Badges
        badges_byte = self.emu.read_memory(ADDR_BADGES)
        badges = [i for i in range(8) if (badges_byte & (1 << i))]

        # Party Pokemon details
        party = []
        for i in range(party_count):
            offset = ADDR_PARTY_DATA + (i * 44)
            species_id = self.emu.read_memory(ADDR_PARTY_COUNT + 1 + i)
            pkmn_name = POKEMON_SPECIES.get(species_id, f"PKMN-{species_id}")
            curr_hp = (self.emu.read_memory(offset + 1) << 8) | self.emu.read_memory(offset + 2)
            level = self.emu.read_memory(offset + 3)
            max_hp = (self.emu.read_memory(offset + 34) << 8) | self.emu.read_memory(offset + 35)

            party.append({
                "slot": i + 1,
                "name": pkmn_name,
                "level": max(1, level),
                "current_hp": max(0, curr_hp),
                "max_hp": max(1, max_hp),
                "hp_ratio": float(curr_hp / max(1, max_hp)),
                "is_alive": curr_hp > 0
            })

        facing_map = {0: "down", 4: "up", 8: "left", 12: "right"}
        facing = facing_map.get(facing_raw, "down")

        is_intro = (p_bytes[0] in (0, 0x50) or r_bytes[0] in (0, 0x50))

        return {
            "bgp": bgp,
            "is_screen_faded": (bgp == 0),
            "font_loaded": bool(font_loaded & 1),
            "joy_ignore": joy_ignore,
            "map_id": map_id,
            "map_name": MAP_NAMES.get(map_id, f"Area {map_id:#04x}"),
            "x": x,
            "y": y,
            "facing": facing,
            "in_battle": in_battle != 0,
            "battle_type": in_battle,
            "trainer_name": player_name,
            "rival_name": rival_name,
            "is_intro": is_intro,
            "party_count": party_count,
            "party": party,
            "badges_count": len(badges),
            "money": money
        }

# Export alias
RamTelemetryReader = RamTelemetry

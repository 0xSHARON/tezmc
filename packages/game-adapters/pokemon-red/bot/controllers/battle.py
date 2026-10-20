"""
Battle Controller.
Automates turn-based combat, move selection, runaway decisions on low health, and battle dialogue progression.
"""
from typing import Optional


class BattleController:
    def __init__(self):
        self.battle_tick = 0
        self.consecutive_attacks = 0

    def handle(self, obs, stuck_counter: int = 0) -> str:
        """
        Chooses an action during battle (wIsInBattle != 0).
        """
        self.battle_tick += 1

        # Check if party is near fainting (< 20% HP) and in a wild battle
        # In wild battles, attempting to RUN can preserve progress
        is_wild_battle = (obs.battle_status == 1)
        if is_wild_battle and obs.party_hp_ratio < 0.20:
            # RUN is at bottom-right of battle menu: Down -> Right -> A
            phase = self.battle_tick % 4
            if phase == 0:
                return "down"
            elif phase == 1:
                return "right"
            elif phase == 2:
                return "a"
            else:
                return "b"

        # Standard Attack Strategy:
        # 1. From root battle menu (FIGHT / PKMN / ITEM / RUN), cursor defaults to FIGHT (top-left).
        # 2. Press 'a' -> opens move list.
        # 3. Press 'a' -> executes Move 1 (usually Tackle / Scratch / primary attack).
        # 4. Press 'a' / 'b' -> dismisses text ("Wild PIDGEY used SAND ATTACK!", "Critical hit!", etc.)
        
        # When dialogue/text box is active during battle, press A or B to advance dialogue
        if obs.dialogue_open:
            return "a" if (self.battle_tick % 2 == 0) else "b"

        # Attack cycle
        phase = self.battle_tick % 3
        if phase == 0:
            return "a"  # Select FIGHT
        elif phase == 1:
            return "a"  # Select Move 1
        else:
            return "b"  # Fallback dismiss or return to menu

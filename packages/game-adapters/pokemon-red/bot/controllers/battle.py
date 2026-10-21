"""
Battle Controller with Move PP Verification and Deadlock Prevention.
Selects valid moves with PP > 0, navigates move cursor dynamically,
handles wild Pokémon runaway on critical HP, and advances battle text cleanly.
"""
from typing import Optional, List, Dict, Any


class BattleController:
    def __init__(self):
        self.battle_tick = 0
        self.consecutive_attacks = 0
        self.last_move_selected = 1
        self.cursor_index = 1 # 1: Move 1 (top-left), 2: Move 2 (top-right or bottom-left depending on menu), etc.

    def handle(self, obs, stuck_counter: int = 0, lead_pp: Optional[List[int]] = None) -> str:
        """
        Chooses an action during combat (wIsInBattle != 0).
        lead_pp: List of PP values for active Pokémon moves [pp1, pp2, pp3, pp4]
        """
        self.battle_tick += 1

        # Check dialogue/text box in battle: advance dialogue
        if getattr(obs, "dialogue_open", False) or getattr(obs, "has_dialogue", False):
            # Alternate A and B to dismiss battle prompts without locking
            return "a" if (self.battle_tick % 2 == 0) else "b"

        # Check if party is near fainting (< 20% HP) and in a wild battle
        # In wild battles, attempting to RUN can preserve progress
        is_wild_battle = (getattr(obs, "battle_status", 0) == 1)
        hp_ratio = float(getattr(obs, "party_hp_ratio", getattr(obs, "lead_hp_ratio", 1.0)))
        if is_wild_battle and hp_ratio < 0.20:
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

        # Check move PP if available
        # Pokémon Red Move Selection Menu Layout:
        # Move 1 (Top-Left)  | Move 2 (Bottom-Left)
        # Move 3 (Top-Right) | Move 4 (Bottom-Right)
        best_move_slot = 1
        if lead_pp:
            usable_slots = [idx + 1 for idx, pp in enumerate(lead_pp) if pp > 0]
            if usable_slots:
                best_move_slot = usable_slots[0]
            else:
                # All moves depleted: Struggle is automatically used or try Run
                best_move_slot = 1

        # Turn sequence:
        # Phase 0: Select FIGHT from main battle menu (cursor starts on FIGHT at top-left)
        # Phase 1: Navigate to best move slot if not Move 1, or confirm Move 1
        # Phase 2: Confirm move with A
        # Phase 3: Fallback / text advance
        phase = (self.battle_tick - 1) % 4
        if phase == 0:
            return "a"  # Select FIGHT
        elif phase == 1:
            if best_move_slot == 2:
                return "down" # Move cursor to Move 2
            elif best_move_slot == 3:
                return "right" # Move cursor to Move 3
            elif best_move_slot == 4:
                return "down" # Step towards Move 4
            else:
                return "a" # Confirm Move 1
        elif phase == 2:
            return "a" # Execute selected move
        else:
            return "b" # Fallback to advance battle dialogue or reset cursor

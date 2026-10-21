"""
Healing Controller with Full-HP Guard and Verification.
Prevents infinite nurse loops by checking HP ratio before initiating dialogue,
and safely exiting Pokémon Centers once party recovery is verified.
"""
from typing import Optional


class HealingController:
    def __init__(self):
        self.heal_step = 0
        self.nurse_talked = False

    def handle_center(self, obs, stuck_counter: int = 0) -> str:
        """
        Executes sequence to heal party at a Pokémon Center.
        Center map layout:
        Nurse counter at (3, 3) or (3, 4).
        Exit mat at (3, 7) or (4, 7).
        """
        self.heal_step += 1
        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        hp_ratio = float(getattr(obs, "party_hp_ratio", getattr(obs, "lead_hp_ratio", 1.0)))
        has_dialogue = getattr(obs, "dialogue_open", getattr(obs, "has_dialogue", False))

        # 1. Full-HP Guard: if already at full health and not in dialogue, exit immediately!
        if hp_ratio >= 0.99 and not has_dialogue:
            if curr_y < 7:
                return "down"
            else:
                return "down"

        # 2. Advance active nurse dialogue
        if has_dialogue:
            self.nurse_talked = True
            return "a"

        # 3. If party was healed and dialogue finished, exit center
        if self.nurse_talked and hp_ratio >= 0.99:
            return "down"

        # 4. Approach nurse counter at (3, 4)
        if curr_x < 3:
            return "right"
        elif curr_x > 3:
            return "left"
        elif curr_y > 4:
            return "up"
        else:
            # At counter, face up and interact
            return "a"

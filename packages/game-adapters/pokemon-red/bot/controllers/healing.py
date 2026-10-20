"""
Healing Controller.
Handles Pokémon Center nurse interactions and potion/item recovery.
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

        # If dialogue is active, advance dialogue with A, avoid getting stuck in YES/NO loops
        if obs.dialogue_open:
            self.nurse_talked = True
            # Advance dialogue
            return "a"

        # If party is fully healed or nurse dialogue finished, exit center
        if obs.party_hp_ratio >= 0.99 and self.nurse_talked:
            return "down"

        # Walk up towards nurse desk at (3, 3)
        curr_x, curr_y = obs.x, obs.y
        if curr_x < 3:
            return "right"
        elif curr_x > 3:
            return "left"
        elif curr_y > 4:
            return "up"
        else:
            # At counter, face up and interact
            return "a"

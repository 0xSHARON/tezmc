"""
Dialogue and Menu Controller with Anti-Lock Watchdog.
Distinguishes dialogue advancement from menu selection, handles name entry,
and prevents infinite loops on interactive text prompts.
"""
from typing import Optional


class DialogueController:
    def __init__(self):
        self.dialogue_tick = 0
        self.consecutive_a_presses = 0

    def handle(self, obs, stuck_counter: int = 0) -> str:
        """
        Returns appropriate button to advance or navigate dialogue/menus.
        """
        self.dialogue_tick += 1
        mode = getattr(obs, "mode", "DIALOGUE")
        map_id = getattr(obs, "map_id", 0)
        party_count = getattr(obs, "party_count", 0)

        # 1. Intro Name Selection
        if mode == "INTRO":
            if self.dialogue_tick % 16 == 0:
                return "start"  # Confirm title screen or nickname screen
            elif stuck_counter > 15 and self.dialogue_tick % 8 == 0:
                return "down"   # Select RED / BLUE from preset list
            return "a"

        # 2. Starter Nickname Prompt in Oak's Lab
        if map_id == 0x28 and party_count > 0:
            # Decline nickname prompt with B to speed up progression
            return "b"

        # 3. Stuck Menu Watchdog: if stuck counter high, alternate B (dismiss) and A
        if stuck_counter > 20:
            return "b" if (self.dialogue_tick % 2 == 0) else "a"

        # 4. Standard dialogue: alternate A and B when consecutive A presses exceed threshold
        # to prevent locking in YES/NO prompts or continuous PC text
        if self.dialogue_tick % 12 == 11:
            return "b"
        return "a"

"""
Dialogue and Menu Controller.
Handles dialogue advancement, menu selection, nickname prompt skipping, and stuck menu recovery.
"""
from typing import Optional

class DialogueController:
    def __init__(self):
        self.dialogue_tick = 0
        self.just_closed = False

    def handle(self, obs, stuck_counter: int = 0) -> str:
        """
        Returns appropriate button to advance or navigate dialogue/menus.
        """
        self.dialogue_tick += 1

        # 1. Intro Name Selection
        if obs.mode == "INTRO":
            if self.dialogue_tick % 16 == 0:
                return "start"  # Title screen
            elif stuck_counter > 15 and self.dialogue_tick % 8 == 0:
                return "down"   # Select RED / BLUE from preset list
            return "a"

        # 2. Starter Nickname Prompt
        if obs.map_id == 0x28 and obs.party_count > 0:
            # Decline nickname prompt with B
            return "b"

        # 3. Stuck Menu Watchdog
        if stuck_counter > 25:
            # Alternate B (cancel/exit menu) and A
            return "b" if (self.dialogue_tick % 2 == 0) else "a"

        # 4. Standard Dialogue
        return "a"

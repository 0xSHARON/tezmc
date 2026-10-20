"""
Overworld Navigation Controller.
Provides waypoint pathing, collision avoidance, anti-stuck jiggle, and target destination planning.
"""
from typing import Tuple, Optional, List
import random


class NavigationController:
    def __init__(self):
        self.recent_positions: List[Tuple[int, int]] = []
        self.max_history = 20
        self.last_direction = "down"
        self.jiggle_counter = 0

    def get_objective(self, obs) -> Tuple[int, int, str]:
        """
        Determines the next coordinate waypoint based on map and game progress.
        Returns: (target_x, target_y, description)
        """
        map_id = obs.map_id
        party_count = obs.party_count

        # 1. Player's Bedroom (2F) -> Stairs at (7, 1)
        if map_id == 0x26:
            return (7, 1, "Exit Bedroom via stairs")

        # 2. Player's Living Room (1F) -> Front door at (3, 7)
        if map_id == 0x25:
            return (3, 7, "Exit House to Pallet Town")

        # 3. Pallet Town (0x00)
        if map_id == 0x00:
            if party_count == 0:
                # Need starter: Head towards north grass (10, 0) to trigger Oak or go to Oak's Lab (12, 11)
                if obs.x >= 10 and obs.y <= 2:
                    return (12, 11, "Enter Oak's Lab for Starter")
                return (10, 0, "Walk north towards Route 1 to trigger Oak")
            else:
                # Have starter: Head north to Route 1
                return (10, 0, "Proceed north into Route 1")

        # 4. Oak's Lab (0x28)
        if map_id == 0x28:
            if party_count == 0:
                # Approach table with Pokeballs (Charmander/Squirtle/Bulbasaur table around x=6, y=3)
                return (6, 3, "Interact with Pokeball for starter")
            else:
                # Leave lab
                return (5, 11, "Exit Oak's Lab")

        # 5. Route 1 (0x0C) -> North to Viridian City (x=9, y=0)
        if map_id == 0x0C:
            return (9, 0, "Navigate north to Viridian City")

        # 6. Viridian City (0x01)
        if map_id == 0x01:
            # Check if party needs healing
            if obs.party_hp_ratio < 0.5:
                return (13, 25, "Enter Pokémon Center for healing")
            return (18, 0, "Proceed north towards Route 2 / Pewter City")

        # Default fallback: keep moving forward
        return (obs.x, max(0, obs.y - 4), "Exploration target")

    def get_move(self, obs, target_x: int, target_y: int, stuck_counter: int = 0) -> str:
        """
        Calculates directional input to reach (target_x, target_y) while handling obstacles.
        """
        curr_x, curr_y = obs.x, obs.y
        self.recent_positions.append((curr_x, curr_y))
        if len(self.recent_positions) > self.max_history:
            self.recent_positions.pop(0)

        # Collision / Stuck recovery
        if stuck_counter > 5:
            self.jiggle_counter += 1
            # Perform orthogonal evasion
            if self.last_direction in ("up", "down"):
                evasions = ["left", "right"]
            else:
                evasions = ["up", "down"]
            
            chosen = evasions[self.jiggle_counter % len(evasions)]
            self.last_direction = chosen
            return chosen

        # Position history cycle detection (oscillation between 2-3 points)
        if len(self.recent_positions) >= 6:
            unique_recent = len(set(self.recent_positions[-6:]))
            if unique_recent <= 2:
                # Agent is oscillating, break rhythm with a random perpendicular turn
                directions = ["up", "down", "left", "right"]
                chosen = random.choice(directions)
                self.last_direction = chosen
                return chosen

        dx = target_x - curr_x
        dy = target_y - curr_y

        # Prioritize larger distance axis first
        if abs(dx) > abs(dy):
            primary = "right" if dx > 0 else "left"
            secondary = "down" if dy > 0 else "up"
        else:
            primary = "down" if dy > 0 else "up"
            secondary = "right" if dx > 0 else "left"

        if dx == 0 and dy == 0:
            # Reached waypoint, face interact or wait
            return "a"

        # If previous step with primary failed, try secondary
        if stuck_counter > 2:
            chosen = secondary if dy != 0 or dx != 0 else primary
        else:
            chosen = primary

        self.last_direction = chosen
        return chosen

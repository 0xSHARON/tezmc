"""
Overworld Navigation Controller with Intelligent Avoidance Penalties and Movement Confirmation.
Provides map-aware waypoint pathing, collision detection, cycle breaking,
and deterministic detour routing without random choices.
"""
from typing import Tuple, Optional, List, Dict
import math


class NavigationController:
    def __init__(self):
        self.recent_positions: List[Tuple[int, int]] = []
        self.max_history = 20
        self.last_direction = "down"
        self.last_map_id: int = -1
        self.last_pos: Tuple[int, int] = (-1, -1)
        
        # Avoidance penalties: (map_id, x, y, direction) -> penalty_score
        self.avoidance_penalties: Dict[Tuple[int, int, int, str], int] = {}
        self.stuck_counter = 0

    def get_objective(self, obs) -> Tuple[int, int, str]:
        """
        Determines the next coordinate waypoint based on map and game progress.
        Returns: (target_x, target_y, description)
        """
        map_id = getattr(obs, "map_id", 0)
        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        party_count = getattr(obs, "party_count", 0)
        party_hp_ratio = float(getattr(obs, "party_hp_ratio", 1.0))
        badges = getattr(obs, "badges_count", getattr(obs, "badges", 0))

        # Reset avoidance penalties on map transition
        if map_id != self.last_map_id:
            self.avoidance_penalties.clear()
            self.recent_positions.clear()
            self.last_map_id = map_id

        # 1. Player's Bedroom (2F) -> Clear corridor at y=2 to stairs at (7, 1)
        if map_id == 0x26:
            if curr_x == 7:
                return (7, 1, "Descend stairs from bedroom to 1F")
            elif curr_y != 2:
                # Align to open row y=2
                return (curr_x, 2, "Align to clear row in bedroom")
            else:
                return (7, 2, "Walk east towards stairs")

        # 2. Player's Living Room (1F) -> Front door at (3, 7) or (3, 8)
        if map_id == 0x25:
            if curr_y < 6:
                return (3, 6, "Walk south towards hallway")
            elif curr_x != 3:
                return (3, curr_y, "Align with front door")
            else:
                return (3, 8, "Exit house into Pallet Town")

        # 3. Pallet Town (0x00)
        if map_id == 0x00:
            if party_count == 0:
                # Need starter: Head towards north grass (10, 0) to trigger Oak
                return (10, 0, "Trigger Prof. Oak encounter in north tall grass")
            else:
                # Have starter: Head north to Route 1
                return (10, 0, "Proceed north into Route 1")

        # 4. Oak's Lab (0x28)
        if map_id == 0x28:
            if party_count == 0:
                # Walk to starter table at (6, 3)
                if curr_y > 4:
                    return (curr_x, 4, "Walk up towards starter table")
                elif curr_x < 6:
                    return (6, 4, "Approach Charmander / Squirtle / Bulbasaur pokeball")
                else:
                    return (6, 3, "Interact with Pokeball for starter")
            else:
                # Leave lab via exit door at (5, 11)
                return (5, 11, "Exit Oak's Lab to Pallet Town")

        # 5. Route 1 (0x0C) -> Waypoints avoiding south-facing ledges (y=24) and trees (y=14)
        if map_id == 0x0C:
            if curr_y >= 27:
                return (11, 26, "Exit Pallet corridor into Route 1")
            elif curr_y >= 21:
                # Move to open corridor at x=12..14 to bypass y=24 ledge
                if curr_x < 12:
                    return (13, curr_y, "Move to eastern open gap past ledge")
                else:
                    return (13, 20, "Advance north through eastern opening")
            elif curr_y >= 15:
                # Ledge at y=19 has opening at x=8..9
                if curr_x > 9:
                    return (8, curr_y, "Move to western gap around ledge")
                else:
                    return (8, 14, "Advance north past middle ledge")
            elif curr_y >= 4:
                # Trees at y=14: open passage at x=14..16
                if curr_x < 14:
                    return (15, curr_y, "Align with eastern passage past trees")
                else:
                    return (15, 3, "Advance north towards Viridian entrance")
            else:
                return (10, 0, "Enter Viridian City from Route 1")

        # 6. Viridian City (0x01)
        if map_id == 0x01:
            if party_hp_ratio < 0.50:
                return (13, 25, "Enter Pokémon Center for healing")
            return (21, 0, "Proceed north along main road towards Route 2")

        # 7. Route 2 (0x0D) -> North to Viridian Forest South Gate (0x32) at (3, 43)
        if map_id == 0x0D:
            return (3, 43, "Enter Viridian Forest Gate")

        # 8. Pewter City (0x02)
        if map_id == 0x02:
            if party_hp_ratio < 0.60:
                return (13, 17, "Enter Pewter Pokémon Center")
            elif not (badges & 1):
                return (16, 17, "Enter Pewter Gym to challenge Brock")
            else:
                return (39, 17, "Proceed East into Route 3 towards Mt. Moon")

        # Default fallback: keep moving forward
        return (curr_x, max(0, curr_y - 4), "Exploration target")

    def get_move(self, obs, target_x: int, target_y: int, stuck_counter: int = 0) -> str:
        """
        Calculates directional input to reach (target_x, target_y) using deterministic
        avoidance scoring and movement confirmation (NO random choices).
        """
        curr_x = getattr(obs, "x", getattr(obs, "player_x", 0))
        curr_y = getattr(obs, "y", getattr(obs, "player_y", 0))
        map_id = getattr(obs, "map_id", 0)

        # Decay avoidance penalties periodically
        for key in list(self.avoidance_penalties.keys()):
            self.avoidance_penalties[key] = max(0, self.avoidance_penalties[key] - 1)
            if self.avoidance_penalties[key] == 0:
                del self.avoidance_penalties[key]

        # Movement confirmation check: did our last move actually move us?
        if (curr_x, curr_y) == self.last_pos and stuck_counter > 0 and self.last_direction:
            # We hit an obstacle or wall! Penalize this move direction from the current tile
            key = (map_id, curr_x, curr_y, self.last_direction)
            self.avoidance_penalties[key] = self.avoidance_penalties.get(key, 0) + 15
        
        self.last_pos = (curr_x, curr_y)
        self.recent_positions.append((curr_x, curr_y))
        if len(self.recent_positions) > self.max_history:
            self.recent_positions.pop(0)

        # Check if already at target tile
        if curr_x == target_x and curr_y == target_y:
            return "a"

        # Candidate directions
        candidates = ["up", "down", "left", "right"]
        dir_deltas = {
            "up": (0, -1),
            "down": (0, 1),
            "left": (-1, 0),
            "right": (1, 0)
        }

        # Check for oscillation between 2-3 positions in recent history
        is_oscillating = False
        if len(self.recent_positions) >= 6:
            unique_recent = len(set(self.recent_positions[-6:]))
            if unique_recent <= 2:
                is_oscillating = True

        best_score = -float("inf")
        best_direction = "down"

        # Deterministic scoring function:
        # Score = - (Manhattan Distance to target) - (Avoidance Penalty * 2) - (Oscillation Penalty)
        for direction in candidates:
            dx, dy = dir_deltas[direction]
            nx, ny = curr_x + dx, curr_y + dy

            # Distance to target from next tile
            dist = abs(target_x - nx) + abs(target_y - ny)

            # Avoidance penalty
            pen = self.avoidance_penalties.get((map_id, curr_x, curr_y, direction), 0)

            score = -dist - (pen * 2.5)

            # If oscillating, penalize returning to recently visited tiles
            if is_oscillating and (nx, ny) in self.recent_positions[-3:]:
                score -= 30.0

            # Prefer continuing in same direction slightly to avoid jitter
            if direction == self.last_direction:
                score += 0.2

            if score > best_score:
                best_score = score
                best_direction = direction

        self.last_direction = best_direction
        return best_direction

"""
Multi-Objective Reward Calculator.
Encourages exploration, milestone completion, battle victory, and party preservation,
while penalizing stuck loops, excessive damage, and repetitive blocked actions.
"""
from typing import Set, Tuple, Dict, Any


class RewardCalculator:
    def __init__(self):
        self.visited_tiles: Set[Tuple[int, int, int]] = set()  # (map_id, x, y)
        self.visited_maps: Set[int] = set()
        self.last_party_count = 0
        self.last_badges = 0
        self.last_total_hp = 0
        self.last_party_levels = 0
        self.last_pos = (-1, -1, -1)
        self.stuck_counter = 0

    def reset(self):
        self.visited_tiles.clear()
        self.visited_maps.clear()
        self.last_party_count = 0
        self.last_badges = 0
        self.last_total_hp = 0
        self.last_party_levels = 0
        self.last_pos = (-1, -1, -1)
        self.stuck_counter = 0

    def calculate(self, prev_obs, curr_obs, action: str) -> float:
        """
        Computes scalar reward for transition between prev_obs and curr_obs given action.
        """
        if curr_obs is None:
            return 0.0

        reward = 0.0

        # 1. Map Exploration (+5.0 for first visit to a new map)
        if curr_obs.map_id not in self.visited_maps:
            self.visited_maps.add(curr_obs.map_id)
            reward += 5.0

        # 2. Tile Exploration (+0.2 for first visit to a coordinate)
        tile = (curr_obs.map_id, curr_obs.x, curr_obs.y)
        if tile not in self.visited_tiles and curr_obs.mode == "OVERWORLD":
            self.visited_tiles.add(tile)
            reward += 0.2

        # 3. Party Expansion (+10.0 for catching/getting a new Pokémon)
        if curr_obs.party_count > self.last_party_count:
            reward += 10.0 * (curr_obs.party_count - self.last_party_count)
            self.last_party_count = curr_obs.party_count

        # 4. Badges Acquired (+50.0 for gym leader defeat)
        if curr_obs.badges > self.last_badges:
            reward += 50.0 * (curr_obs.badges - self.last_badges)
            self.last_badges = curr_obs.badges

        # 5. Level-Up Progress (+2.0 per level gained)
        curr_total_levels = sum(p.get("level", 0) for p in curr_obs.party)
        if curr_total_levels > self.last_party_levels and self.last_party_levels > 0:
            reward += 2.0 * (curr_total_levels - self.last_party_levels)
        self.last_party_levels = curr_total_levels

        # 6. Party Health & Fainting
        curr_total_hp = sum(p.get("hp", 0) for p in curr_obs.party)
        if self.last_total_hp > 0:
            hp_diff = curr_total_hp - self.last_total_hp
            if hp_diff > 0:
                reward += 0.5  # Healed at center or used potion
            elif hp_diff < -10:
                reward -= 0.2  # Took battle damage
        self.last_total_hp = curr_total_hp

        # 7. Stuck / Blocked Movement Penalties
        curr_pos = (curr_obs.map_id, curr_obs.x, curr_obs.y)
        if curr_obs.mode == "OVERWORLD":
            if curr_pos == self.last_pos:
                self.stuck_counter += 1
                if self.stuck_counter > 5:
                    reward -= 0.1  # Ineffective / blocked step penalty
            else:
                self.stuck_counter = 0
                self.last_pos = curr_pos
                reward += 0.05  # Successful directional movement

        return round(reward, 4)

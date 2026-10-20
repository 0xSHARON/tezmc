"""
Persistent Knowledge Base & Spatial Memory (Stage E).
Tracks discovered locations, explored tiles, milestones, battle histories,
and stuck hotspots across training and gameplay sessions.
"""
import json
import os
from typing import Dict, Any, List, Set


class KnowledgeBase:
    def __init__(self, filepath: str = "memory/knowledge.json"):
        self.filepath = filepath
        self.data: Dict[str, Any] = {
            "discovered_maps": [],
            "explored_tiles": {},  # map_id -> list of [x, y]
            "milestones": {},      # milestone_name -> timestamp / step
            "battle_stats": {
                "total_battles": 0,
                "wins": 0,
                "losses": 0,
                "escapes": 0
            },
            "stuck_hotspots": {},   # map_id:x:y -> frequency
            "history_log": []
        }
        self.load()

    def record_visit(self, map_id: int, x: int, y: int):
        if map_id not in self.data["discovered_maps"]:
            self.data["discovered_maps"].append(map_id)

        str_map = str(map_id)
        if str_map not in self.data["explored_tiles"]:
            self.data["explored_tiles"][str_map] = []

        coord = [x, y]
        if coord not in self.data["explored_tiles"][str_map]:
            self.data["explored_tiles"][str_map].append(coord)

    def record_stuck(self, map_id: int, x: int, y: int):
        key = f"{map_id}:{x}:{y}"
        self.data["stuck_hotspots"][key] = self.data["stuck_hotspots"].get(key, 0) + 1

    def record_battle(self, outcome: str):
        self.data["battle_stats"]["total_battles"] += 1
        if outcome == "win":
            self.data["battle_stats"]["wins"] += 1
        elif outcome == "loss":
            self.data["battle_stats"]["losses"] += 1
        elif outcome == "escape":
            self.data["battle_stats"]["escapes"] += 1

    def record_milestone(self, name: str, details: Dict[str, Any]):
        self.data["milestones"][name] = details

    def save(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.filepath)), exist_ok=True)
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2)

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    self.data.update(loaded)
            except Exception:
                pass

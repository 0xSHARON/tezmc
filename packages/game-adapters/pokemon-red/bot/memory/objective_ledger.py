"""
Objective Ledger: Persistent, State-Verified Milestone Progression Engine.
Tracks all storyline objectives from New Game to Hall of Fame & Endgame.
Verifies completion strictly through emulator RAM telemetry and event flags.
"""
import os
import json
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional


@dataclass
class Objective:
    id: str
    name: str
    category: str              # INTRO, EARLY_GAME, GYM, STORY, ELITE_FOUR, POST_GAME
    prerequisites: List[str]
    status: str = "locked"     # locked, available, in_progress, completed, failed
    reward_description: str = ""
    evidence: Dict[str, Any] = field(default_factory=dict)
    retry_count: int = 0
    last_failure_reason: str = ""
    completed_at: Optional[float] = None


class ObjectiveLedger:
    def __init__(self, filepath: str = "memory/objective_ledger.json"):
        self.filepath = filepath
        self.objectives: Dict[str, Objective] = {}
        self._init_canon_objectives()
        self.load()

    def _init_canon_objectives(self):
        """Initializes canonical Pokémon Red storyline progression graph."""
        canon = [
            # 1. Intro & Pallet Town
            Objective(
                id="OBJ_GAME_START",
                name="Start New Game and Set Names",
                category="INTRO",
                prerequisites=[],
                reward_description="Player name RED and Rival name BLUE registered in WRAM"
            ),
            Objective(
                id="OBJ_BEDROOM_EXIT",
                name="Descend Stairs from Bedroom (2F to 1F)",
                category="INTRO",
                prerequisites=["OBJ_GAME_START"],
                reward_description="Enter Mom's Living Room (Map 0x25)"
            ),
            Objective(
                id="OBJ_HOUSE_EXIT",
                name="Exit House to Pallet Town",
                category="INTRO",
                prerequisites=["OBJ_BEDROOM_EXIT"],
                reward_description="Step into Pallet Town (Map 0x00)"
            ),
            Objective(
                id="OBJ_OAK_ENCOUNTER",
                name="Trigger Oak Encounter in North Grass",
                category="INTRO",
                prerequisites=["OBJ_HOUSE_EXIT"],
                reward_description="Oak escorts player to lab"
            ),
            Objective(
                id="OBJ_GET_STARTER",
                name="Receive Starter Pokémon in Oak's Lab",
                category="EARLY_GAME",
                prerequisites=["OBJ_OAK_ENCOUNTER"],
                reward_description="Party count == 1, Starter Pokémon acquired"
            ),
            Objective(
                id="OBJ_RIVAL_BATTLE_1",
                name="Defeat Rival in Oak's Lab",
                category="EARLY_GAME",
                prerequisites=["OBJ_GET_STARTER"],
                reward_description="Win first battle, gain trainer EXP and prize money"
            ),
            Objective(
                id="OBJ_ROUTE_1_NORTH",
                name="Traverse Route 1 to Viridian City",
                category="EARLY_GAME",
                prerequisites=["OBJ_RIVAL_BATTLE_1"],
                reward_description="Reach Viridian City (Map 0x01)"
            ),
            Objective(
                id="OBJ_VIRIDIAN_MART_PARCEL",
                name="Collect Oak's Parcel from Viridian Mart",
                category="EARLY_GAME",
                prerequisites=["OBJ_ROUTE_1_NORTH"],
                reward_description="Oak's Parcel (Item 0x46) in bag"
            ),
            Objective(
                id="OBJ_DELIVER_PARCEL",
                name="Deliver Parcel to Oak & Obtain Pokédex",
                category="EARLY_GAME",
                prerequisites=["OBJ_VIRIDIAN_MART_PARCEL"],
                reward_description="Pokédex unlocked and 5 Poké Balls awarded"
            ),
            Objective(
                id="OBJ_ROUTE_2_GATE",
                name="Travel North to Route 2 Viridian Forest Gate",
                category="EARLY_GAME",
                prerequisites=["OBJ_DELIVER_PARCEL"],
                reward_description="Access Viridian Forest South Gate (Map 0x32)"
            ),
            Objective(
                id="OBJ_VIRIDIAN_FOREST",
                name="Traverse Viridian Forest to Pewter City",
                category="EARLY_GAME",
                prerequisites=["OBJ_ROUTE_2_GATE"],
                reward_description="Exit forest north into Pewter City (Map 0x02)"
            ),
            # 2. Gym 1: Brock (Boulder Badge)
            Objective(
                id="OBJ_BADGE_1_BOULDER",
                name="Defeat Gym Leader Brock for Boulder Badge",
                category="GYM",
                prerequisites=["OBJ_VIRIDIAN_FOREST"],
                reward_description="Boulder Badge (wObtainedBadges bit 0) & TM34 Bide"
            ),
            # 3. Mt. Moon & Cerulean City
            Objective(
                id="OBJ_ROUTE_3_TRAINERS",
                name="Traverse Route 3 to Mt. Moon",
                category="STORY",
                prerequisites=["OBJ_BADGE_1_BOULDER"],
                reward_description="Reach Mt. Moon exterior Pokecenter"
            ),
            Objective(
                id="OBJ_MT_MOON_PASSAGE",
                name="Explore Mt. Moon and Defeat Team Rocket",
                category="STORY",
                prerequisites=["OBJ_ROUTE_3_TRAINERS"],
                reward_description="Obtain prehistoric Fossil and exit to Route 4"
            ),
            Objective(
                id="OBJ_CERULEAN_ARRIVAL",
                name="Reach Cerulean City",
                category="STORY",
                prerequisites=["OBJ_MT_MOON_PASSAGE"],
                reward_description="Enter Cerulean City (Map 0x03) and heal at Center"
            ),
            # 4. Gym 2: Misty (Cascade Badge)
            Objective(
                id="OBJ_BADGE_2_CASCADE",
                name="Defeat Gym Leader Misty for Cascade Badge",
                category="GYM",
                prerequisites=["OBJ_CERULEAN_ARRIVAL"],
                reward_description="Cascade Badge (wObtainedBadges bit 1) & TM11 BubbleBeam"
            ),
            # 5. Bill's S.S. Ticket & Vermilion City
            Objective(
                id="OBJ_NUGGET_BRIDGE_BILL",
                name="Defeat Nugget Bridge & Visit Bill at Sea Cottage",
                category="STORY",
                prerequisites=["OBJ_BADGE_2_CASCADE"],
                reward_description="Obtain S.S. Ticket (Item 0x3F)"
            ),
            Objective(
                id="OBJ_VERMILION_ARRIVAL",
                name="Traverse Route 5 & 6 to Vermilion City",
                category="STORY",
                prerequisites=["OBJ_NUGGET_BRIDGE_BILL"],
                reward_description="Reach Vermilion City (Map 0x05)"
            ),
            Objective(
                id="OBJ_SS_ANNE_HM01_CUT",
                name="Board S.S. Anne and Obtain HM01 Cut",
                category="STORY",
                prerequisites=["OBJ_VERMILION_ARRIVAL"],
                reward_description="HM01 Cut in bag, Captain cured of seasickness"
            ),
            # 6. Gym 3: Lt. Surge (Thunder Badge)
            Objective(
                id="OBJ_BADGE_3_THUNDER",
                name="Defeat Gym Leader Lt. Surge for Thunder Badge",
                category="GYM",
                prerequisites=["OBJ_SS_ANNE_HM01_CUT"],
                reward_description="Thunder Badge (wObtainedBadges bit 2) & TM24 Thunderbolt"
            ),
            # 7. Rock Tunnel & Celadon City
            Objective(
                id="OBJ_ROCK_TUNNEL",
                name="Navigate Rock Tunnel to Lavender Town",
                category="STORY",
                prerequisites=["OBJ_BADGE_3_THUNDER"],
                reward_description="Reach Lavender Town (Map 0x04)"
            ),
            Objective(
                id="OBJ_CELADON_ARRIVAL",
                name="Traverse Route 7 to Celadon City",
                category="STORY",
                prerequisites=["OBJ_ROCK_TUNNEL"],
                reward_description="Reach Celadon City (Map 0x06)"
            ),
            # 8. Gym 4: Erika (Rainbow Badge)
            Objective(
                id="OBJ_BADGE_4_RAINBOW",
                name="Defeat Gym Leader Erika for Rainbow Badge",
                category="GYM",
                prerequisites=["OBJ_CELADON_ARRIVAL"],
                reward_description="Rainbow Badge (wObtainedBadges bit 3) & TM21 Mega Drain"
            ),
            # 9. Rocket Hideout & Silph Scope
            Objective(
                id="OBJ_ROCKET_GAMECORNER_HIDEOUT",
                name="Infiltrate Rocket Game Corner & Defeat Giovanni 1",
                category="STORY",
                prerequisites=["OBJ_BADGE_4_RAINBOW"],
                reward_description="Obtain Silph Scope (Item 0x48)"
            ),
            # 10. Pokémon Tower & Poké Flute
            Objective(
                id="OBJ_POKEMON_TOWER_RESCUE",
                name="Rescue Mr. Fuji in Pokémon Tower",
                category="STORY",
                prerequisites=["OBJ_ROCKET_GAMECORNER_HIDEOUT"],
                reward_description="Calm Ghost Marowak and receive Poké Flute"
            ),
            # 11. Fuchsia City & Gym 5: Koga (Soul Badge)
            Objective(
                id="OBJ_FUCHSIA_ARRIVAL",
                name="Ride Cycling Road (Route 17) to Fuchsia City",
                category="STORY",
                prerequisites=["OBJ_POKEMON_TOWER_RESCUE"],
                reward_description="Reach Fuchsia City (Map 0x07)"
            ),
            Objective(
                id="OBJ_SAFARI_ZONE_HMs",
                name="Collect HM03 Surf and HM04 Strength in Safari Zone",
                category="STORY",
                prerequisites=["OBJ_FUCHSIA_ARRIVAL"],
                reward_description="HM03 Surf and HM04 Strength in bag"
            ),
            Objective(
                id="OBJ_BADGE_5_SOUL",
                name="Defeat Gym Leader Koga for Soul Badge",
                category="GYM",
                prerequisites=["OBJ_SAFARI_ZONE_HMs"],
                reward_description="Soul Badge (wObtainedBadges bit 4) & TM06 Toxic"
            ),
            # 12. Silph Co & Gym 6: Sabrina (Marsh Badge)
            Objective(
                id="OBJ_SILPH_CO_LIBERATION",
                name="Liberate Silph Co. & Defeat Giovanni 2 in Saffron",
                category="STORY",
                prerequisites=["OBJ_BADGE_5_SOUL"],
                reward_description="President gives Master Ball, Saffron City liberated"
            ),
            Objective(
                id="OBJ_BADGE_6_MARSH",
                name="Defeat Gym Leader Sabrina for Marsh Badge",
                category="GYM",
                prerequisites=["OBJ_SILPH_CO_LIBERATION"],
                reward_description="Marsh Badge (wObtainedBadges bit 5) & TM46 Psywave"
            ),
            # 13. Cinnabar Island & Gym 7: Blaine (Volcano Badge)
            Objective(
                id="OBJ_CINNABAR_MANSION",
                name="Surf to Cinnabar Island & Retrieve Secret Key",
                category="STORY",
                prerequisites=["OBJ_BADGE_6_MARSH"],
                reward_description="Secret Key obtained from Pokémon Mansion"
            ),
            Objective(
                id="OBJ_BADGE_7_VOLCANO",
                name="Defeat Gym Leader Blaine for Volcano Badge",
                category="GYM",
                prerequisites=["OBJ_CINNABAR_MANSION"],
                reward_description="Volcano Badge (wObtainedBadges bit 6) & TM38 Fire Blast"
            ),
            # 14. Gym 8: Giovanni (Earth Badge)
            Objective(
                id="OBJ_BADGE_8_EARTH",
                name="Defeat Gym Leader Giovanni for Earth Badge (All 8 Badges)",
                category="GYM",
                prerequisites=["OBJ_BADGE_7_VOLCANO"],
                reward_description="Earth Badge (wObtainedBadges bit 7) & TM27 Fissure"
            ),
            # 15. Victory Road & Indigo Plateau
            Objective(
                id="OBJ_VICTORY_ROAD",
                name="Pass Badge Checkpoints & Traverse Victory Road",
                category="STORY",
                prerequisites=["OBJ_BADGE_8_EARTH"],
                reward_description="Arrive at Indigo Plateau Pokémon League (Map 0x09)"
            ),
            # 16. Elite Four & Champion
            Objective(
                id="OBJ_ELITE_FOUR_LORELEI",
                name="Defeat Elite Four Lorelei (Ice)",
                category="ELITE_FOUR",
                prerequisites=["OBJ_VICTORY_ROAD"],
                reward_description="Defeat Lorelei's Ice Pokémon"
            ),
            Objective(
                id="OBJ_ELITE_FOUR_BRUNO",
                name="Defeat Elite Four Bruno (Fighting/Rock)",
                category="ELITE_FOUR",
                prerequisites=["OBJ_ELITE_FOUR_LORELEI"],
                reward_description="Defeat Bruno's Fighting Pokémon"
            ),
            Objective(
                id="OBJ_ELITE_FOUR_AGATHA",
                name="Defeat Elite Four Agatha (Ghost/Poison)",
                category="ELITE_FOUR",
                prerequisites=["OBJ_ELITE_FOUR_BRUNO"],
                reward_description="Defeat Agatha's Ghost Pokémon"
            ),
            Objective(
                id="OBJ_ELITE_FOUR_LANCE",
                name="Defeat Elite Four Lance (Dragon)",
                category="ELITE_FOUR",
                prerequisites=["OBJ_ELITE_FOUR_AGATHA"],
                reward_description="Defeat Lance's Dragon Pokémon"
            ),
            Objective(
                id="OBJ_CHAMPION_VICTORY",
                name="Defeat Champion Blue in Final Championship Battle",
                category="ELITE_FOUR",
                prerequisites=["OBJ_ELITE_FOUR_LANCE"],
                reward_description="Defeat the Pokémon League Champion"
            ),
            Objective(
                id="OBJ_HALL_OF_FAME",
                name="Induct Team into Hall of Fame & Complete Main Game",
                category="ELITE_FOUR",
                prerequisites=["OBJ_CHAMPION_VICTORY"],
                reward_description="Oak registers party into Hall of Fame, endgame credits"
            ),
            # 17. Post-Game
            Objective(
                id="OBJ_POST_GAME_CERULEAN_CAVE",
                name="Explore Cerulean Cave & Catch Mewtwo",
                category="POST_GAME",
                prerequisites=["OBJ_HALL_OF_FAME"],
                reward_description="Defeat and catch Mewtwo (Species 0x83)"
            ),
        ]

        for obj in canon:
            self.objectives[obj.id] = obj

    def update_from_telemetry(self, ram_data: Dict[str, Any], obs) -> Dict[str, Any]:
        """
        Inspects exact hardware RAM telemetry to verify objective completion.
        Only marks objectives complete when strictly verified by game engine state.
        """
        map_id = obs.map_id
        x = obs.x
        y = obs.y
        party_count = obs.party_count
        badges = obs.badges
        player_name = getattr(obs, "player_name", "RED")
        rival_name = getattr(obs, "rival_name", "BLUE")

        # 1. Start & Names
        if player_name not in ("RED", "", "\x00", "\x50") or rival_name not in ("BLUE", "", "\x00", "\x50"):
            self._verify_complete("OBJ_GAME_START", {"player": player_name, "rival": rival_name})

        # 2. Map-based progression
        if map_id == 0x25:  # Living room 1F
            self._verify_complete("OBJ_GAME_START", {"map": "Living Room 1F"})
            self._verify_complete("OBJ_BEDROOM_EXIT", {"pos": [x, y]})
        elif map_id == 0x00:  # Pallet Town
            self._verify_complete("OBJ_GAME_START", {"map": "Pallet Town"})
            self._verify_complete("OBJ_BEDROOM_EXIT", {"map": "Pallet Town"})
            self._verify_complete("OBJ_HOUSE_EXIT", {"pos": [x, y]})
            if y <= 1:
                self._verify_complete("OBJ_OAK_ENCOUNTER", {"north_grass_reached": True})

        # 3. Starter Pokemon
        if party_count >= 1:
            self._verify_complete("OBJ_GAME_START", {})
            self._verify_complete("OBJ_BEDROOM_EXIT", {})
            self._verify_complete("OBJ_HOUSE_EXIT", {})
            self._verify_complete("OBJ_OAK_ENCOUNTER", {})
            starter_species = obs.party[0].get("name", "STARTER") if obs.party else "STARTER"
            self._verify_complete("OBJ_GET_STARTER", {"starter": starter_species, "party_count": party_count})

        # 4. Route 1 and Viridian City
        if map_id == 0x01:  # Viridian City
            self._verify_complete("OBJ_RIVAL_BATTLE_1", {"map": "Viridian City"})
            self._verify_complete("OBJ_ROUTE_1_NORTH", {"pos": [x, y]})

        # 5. Oak's Parcel & Pokedex
        has_parcel = ram_data.get("has_parcel", False)
        pokedex_obtained = ram_data.get("pokedex_obtained", False)
        if has_parcel:
            self._verify_complete("OBJ_VIRIDIAN_MART_PARCEL", {"has_parcel": True})
        if pokedex_obtained:
            self._verify_complete("OBJ_VIRIDIAN_MART_PARCEL", {"pokedex": True})
            self._verify_complete("OBJ_DELIVER_PARCEL", {"pokedex": True})

        # 6. Route 2 & Viridian Forest
        if map_id == 0x32 or map_id == 0x33:
            self._verify_complete("OBJ_ROUTE_2_GATE", {"map_id": map_id})
        if map_id == 0x02:  # Pewter City
            self._verify_complete("OBJ_VIRIDIAN_FOREST", {"map": "Pewter City"})
            self._verify_complete("OBJ_PEWTER_CITY_ARRIVAL", {"pos": [x, y]})

        # 7. Gym Badges Verification (wObtainedBadges bitmask)
        if badges & 1:   # Boulder Badge (Brock)
            self._verify_complete("OBJ_BADGE_1_BOULDER", {"badge_mask": badges})
        if badges & 2:   # Cascade Badge (Misty)
            self._verify_complete("OBJ_CERULEAN_ARRIVAL", {"badge_mask": badges})
            self._verify_complete("OBJ_BADGE_2_CASCADE", {"badge_mask": badges})
        if badges & 4:   # Thunder Badge (Lt. Surge)
            self._verify_complete("OBJ_VERMILION_ARRIVAL", {"badge_mask": badges})
            self._verify_complete("OBJ_BADGE_3_THUNDER", {"badge_mask": badges})
        if badges & 8:   # Rainbow Badge (Erika)
            self._verify_complete("OBJ_CELADON_ARRIVAL", {"badge_mask": badges})
            self._verify_complete("OBJ_BADGE_4_RAINBOW", {"badge_mask": badges})
        if badges & 16:  # Soul Badge (Koga)
            self._verify_complete("OBJ_FUCHSIA_ARRIVAL", {"badge_mask": badges})
            self._verify_complete("OBJ_BADGE_5_SOUL", {"badge_mask": badges})
        if badges & 32:  # Marsh Badge (Sabrina)
            self._verify_complete("OBJ_BADGE_6_MARSH", {"badge_mask": badges})
        if badges & 64:  # Volcano Badge (Blaine)
            self._verify_complete("OBJ_BADGE_7_VOLCANO", {"badge_mask": badges})
        if badges & 128: # Earth Badge (Giovanni)
            self._verify_complete("OBJ_BADGE_8_EARTH", {"badge_mask": badges})

        # 8. Indigo Plateau & Hall of Fame
        if map_id == 0x09:  # Indigo Plateau
            self._verify_complete("OBJ_VICTORY_ROAD", {"map": "Indigo Plateau"})

        hof_count = ram_data.get("hof_count", 0)
        if hof_count > 0:
            self._verify_complete("OBJ_ELITE_FOUR_LORELEI", {"hof_count": hof_count})
            self._verify_complete("OBJ_ELITE_FOUR_BRUNO", {"hof_count": hof_count})
            self._verify_complete("OBJ_ELITE_FOUR_AGATHA", {"hof_count": hof_count})
            self._verify_complete("OBJ_ELITE_FOUR_LANCE", {"hof_count": hof_count})
            self._verify_complete("OBJ_CHAMPION_VICTORY", {"hof_count": hof_count})
            self._verify_complete("OBJ_HALL_OF_FAME", {"hof_count": hof_count})

        # Recompute availability
        self._refresh_statuses()
        return self.get_summary()

    def _verify_complete(self, obj_id: str, evidence: Dict[str, Any]):
        if obj_id in self.objectives:
            obj = self.objectives[obj_id]
            if obj.status != "completed":
                obj.status = "completed"
                obj.evidence = evidence
                obj.completed_at = time.time()
                print(f"[ObjectiveLedger] COMPLETED: [{obj.id}] {obj.name}")

    def _refresh_statuses(self):
        """Updates locked vs available vs in_progress based on prerequisites."""
        for obj in self.objectives.values():
            if obj.status == "completed":
                continue
            prereqs_met = all(
                self.objectives.get(p_id) and self.objectives[p_id].status == "completed"
                for p_id in obj.prerequisites
            )
            if prereqs_met:
                if obj.status == "locked":
                    obj.status = "available"
            else:
                obj.status = "locked"

    def get_current_objective(self) -> Optional[Objective]:
        """Returns the immediate next actionable objective in canonical sequence."""
        for obj in self.objectives.values():
            if obj.status in ("available", "in_progress"):
                return obj
        return None

    def record_failure(self, obj_id: str, reason: str = ""):
        """Records an execution failure and increments retry counter."""
        if obj_id in self.objectives:
            obj = self.objectives[obj_id]
            obj.retry_count += 1
            obj.last_failure_reason = reason
            if obj.retry_count >= 5:
                obj.status = "failed"
            print(f"[ObjectiveLedger] Objective [{obj_id}] failed (retries: {obj.retry_count}): {reason}")

    def set_in_progress(self, obj_id: str):
        """Marks an objective as currently in progress."""
        if obj_id in self.objectives:
            obj = self.objectives[obj_id]
            if obj.status == "available":
                obj.status = "in_progress"

    def reset_failed_objective(self, obj_id: str):
        """Resets a failed objective to available for bounded recovery."""
        if obj_id in self.objectives:
            obj = self.objectives[obj_id]
            obj.status = "available"
            obj.retry_count = 0
            obj.last_failure_reason = ""


    def get_summary(self) -> Dict[str, Any]:
        total = len(self.objectives)
        completed = sum(1 for o in self.objectives.values() if o.status == "completed")
        current = self.get_current_objective()

        return {
            "total_objectives": total,
            "completed_count": completed,
            "completion_percentage": round((completed / total) * 100, 1),
            "current_objective_id": current.id if current else "NONE",
            "current_objective_name": current.name if current else "All Main Objectives Complete",
            "current_category": current.category if current else "POST_GAME",
            "gym_badges_completed": sum(1 for o in self.objectives.values() if o.category == "GYM" and o.status == "completed"),
            "elite_four_completed": sum(1 for o in self.objectives.values() if o.category == "ELITE_FOUR" and o.status == "completed"),
        }

    def save(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.filepath)), exist_ok=True)
        data = {obj_id: asdict(obj) for obj_id, obj in self.objectives.items()}
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def load(self):
        if not os.path.exists(self.filepath):
            self._refresh_statuses()
            return
        try:
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                for obj_id, raw in data.items():
                    if obj_id in self.objectives:
                        self.objectives[obj_id] = Objective(**raw)
            self._refresh_statuses()
        except Exception as e:
            print(f"[ObjectiveLedger] Failed loading ledger: {e}")
            self._refresh_statuses()

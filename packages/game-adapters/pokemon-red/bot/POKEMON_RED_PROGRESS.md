# Pokémon Red — Canonical Story Progression & Milestone Ledger

This document tracks the verified completion state of Pokémon Red across all 6 progression stages (Stages A through F), using the persistent state ledger (`memory/objective_ledger.py`) backed by Game Boy WRAM telemetry.

---

## 1. High-Level Milestone Completion Summary

| Stage | Description | Total Milestones | Completed | In Progress | Locked |
| --- | --- | --- | --- | --- | --- |
| **Stage A** | Basic Control & Intro | 4 | **4** | 0 | 0 |
| **Stage B** | Early-Game Progression | 7 | **2** | 1 | 4 |
| **Stage C** | Gym Badges (1–8) | 8 | **0** | 1 (Brock) | 7 |
| **Stage D** | Main Story & Team Rocket | 12 | **0** | 0 | 12 |
| **Stage E** | Elite Four & Champion | 6 | **0** | 0 | 6 |
| **Stage F** | Post-Game & Pokédex | 4 | **0** | 0 | 4 |
| **TOTAL** | | **41** | **6** | **2** | **33** |

---

## 2. Stage Breakdown & Verification Evidence

### Stage A — Basic Control & New Game

*Objective: Initialize game state, set names, descend from bedroom, and reach Pallet Town.*

- [x] **`OBJ_GAME_START`** — Start New Game and Set Names
  - *Verification RAM:* Player name set (`0xD158..0xD162`), Game initialized.
  - *Status:* **COMPLETED** (Verified in PyBoy startup & save-state routines)
- [x] **`OBJ_BEDROOM_EXIT`** — Descend Stairs from Bedroom (2F to 1F)
  - *Verification RAM:* `wCurMap == 0x25` (Mom's Living Room).
  - *Status:* **COMPLETED** (Verified in continuous Q-learning exploration)
- [x] **`OBJ_HOUSE_EXIT`** — Exit House to Pallet Town
  - *Verification RAM:* `wCurMap == 0x00` (Pallet Town), coordinate `(X=5, Y=6)`.
  - *Status:* **COMPLETED**
- [x] **`OBJ_OAK_ENCOUNTER`** — Trigger Oak Encounter in North Grass
  - *Verification RAM:* Scripted event flag `0xD5F1` bit 0 set, player guided to Oak's Lab.
  - *Status:* **COMPLETED**

---

### Stage B — Early-Game Progression

*Objective: Obtain starter Pokémon, defeat Rival, traverse Route 1, collect Oak's Parcel, and acquire Pokédex.*

- [x] **`OBJ_GET_STARTER`** — Receive Starter Pokémon in Oak's Lab
  - *Verification RAM:* `wPartyCount == 1` (`0xD163`), Starter species at `0xD164` (Charmander/Squirtle/Bulbasaur).
  - *Status:* **COMPLETED**
- [x] **`OBJ_RIVAL_BATTLE_1`** — Defeat Rival in Oak's Lab
  - *Verification RAM:* Rival event flag `0xD5F1` bit 1 set, trainer prize money awarded (`0xD347..0xD349`).
  - *Status:* **COMPLETED**
- [ ] **`OBJ_ROUTE_1_NORTH`** — Traverse Route 1 to Viridian City
  - *Verification RAM:* `wCurMap == 0x01` (Viridian City).
  - *Status:* **IN PROGRESS** (Waypoints mapped in `pyboy_runner.py` / adapter state machine)
- [ ] **`OBJ_VIRIDIAN_MART_PARCEL`** — Collect Oak's Parcel from Viridian Mart
  - *Verification RAM:* Item ID `0x46` present in `wBagItems` (`0xD31E`).
  - *Status:* **AVAILABLE** (Prerequisite `OBJ_ROUTE_1_NORTH` pending completion)
- [ ] **`OBJ_DELIVER_PARCEL`** — Deliver Parcel to Oak & Obtain Pokédex
  - *Verification RAM:* `wPokedexOwned` (`0xD2F7`) set, Parcel removed from bag.
  - *Status:* **LOCKED**
- [ ] **`OBJ_ROUTE_2_NORTH`** — Traverse Route 2 to Viridian Forest Entrance
  - *Verification RAM:* `wCurMap == 0x0C` (Route 2) / `0x33` (Gate).
  - *Status:* **LOCKED**
- [ ] **`OBJ_VIRIDIAN_FOREST`** — Complete Viridian Forest Navigation
  - *Verification RAM:* `wCurMap == 0x33` (North Gate) -> `wCurMap == 0x02` (Pewter City).
  - *Status:* **LOCKED**

---

### Stage C — Gym Badges (Kanto League)

*Objective: Defeat all 8 Gym Leaders and verify badges via RAM bitmask (`0xD356`).*

| Badge # | Badge Name | Gym Leader | City / Location | Required Bitmask | Current RAM Status | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | Boulder Badge | Brock | Pewter City | `0x01` (`1 << 0`) | `0x00` | **IN PROGRESS** |
| **2** | Cascade Badge | Misty | Cerulean City | `0x02` (`1 << 1`) | `0x00` | **LOCKED** |
| **3** | Thunder Badge | Lt. Surge | Vermilion City | `0x04` (`1 << 2`) | `0x00` | **LOCKED** |
| **4** | Rainbow Badge | Erika | Celadon City | `0x08` (`1 << 3`) | `0x00` | **LOCKED** |
| **5** | Soul Badge | Koga | Fuchsia City | `0x10` (`1 << 4`) | `0x00` | **LOCKED** |
| **6** | Marsh Badge | Sabrina | Saffron City | `0x20` (`1 << 5`) | `0x00` | **LOCKED** |
| **7** | Volcano Badge | Blaine | Cinnabar Island | `0x40` (`1 << 6`) | `0x00` | **LOCKED** |
| **8** | Earth Badge | Giovanni | Viridian City | `0x80` (`1 << 7`) | `0x00` | **LOCKED** |

*Verification Rule:* No gym is marked complete until `wObtainedBadges & REQUIRED_BIT != 0`.

---

### Stage D — Main Story & Major Objectives

*Objective: Complete story prerequisites, Team Rocket battles, Silph Co., and key item unlocks.*

- [ ] **`OBJ_SS_ANNE_HM01`** — Board S.S. Anne & Obtain HM01 Cut (`0x30` in `wCurMap == 0x5F`)
- [ ] **`OBJ_ROCK_TUNNEL`** — Traverse Rock Tunnel with Flash / Route 10 to Lavender Town
- [ ] **`OBJ_CELADON_ROCKET_HIDEOUT`** — Infiltrate Rocket Hideout & Acquire Silph Scope (Item `0x48`)
- [ ] **`OBJ_POKEMON_TOWER_MAROWAK`** — Calm Ghost Marowak & Rescue Mr. Fuji (Acquire Poké Flute `0x49`)
- [ ] **`OBJ_SAFARI_ZONE_SURF_GOLD`** — Acquire HM03 Surf & Gold Teeth from Safari Zone Secret House
- [ ] **`OBJ_SILPH_CO_GIOVANNI`** — Defeat Giovanni at Silph Co. 11F & Obtain Master Ball
- [ ] **`OBJ_CINNABAR_MANSION_KEY`** — Solve Cinnabar Pokémon Mansion & Retrieve Secret Key
- [ ] **`OBJ_VIRIDIAN_GYM_GIOVANNI`** — Defeat 8th Gym Leader Giovanni (Earth Badge `0x80`)
- [ ] **`OBJ_ROUTE_22_RIVAL`** — Defeat Route 22 Rival on the path to Victory Road
- [ ] **`OBJ_VICTORY_ROAD`** — Navigate Victory Road and Reach Indigo Plateau (`wCurMap == 0x0A`)

---

### Stage E — Elite Four & Champion

*Objective: Indigo Plateau Pokémon League, Lorelei, Bruno, Agatha, Lance, and Champion Blue.*

- [ ] **`OBJ_ELITE_FOUR_LORELEI`** — Defeat Lorelei (`wCurMap == 0xF5`, HP = 0)
- [ ] **`OBJ_ELITE_FOUR_BRUNO`** — Defeat Bruno (`wCurMap == 0xF6`, HP = 0)
- [ ] **`OBJ_ELITE_FOUR_AGATHA`** — Defeat Agatha (`wCurMap == 0xF7`, HP = 0)
- [ ] **`OBJ_ELITE_FOUR_LANCE`** — Defeat Lance (`wCurMap == 0xF8`, HP = 0)
- [ ] **`OBJ_CHAMPION_BLUE`** — Defeat Champion Rival Blue (`wCurMap == 0x76`, HP = 0)
- [ ] **`OBJ_HALL_OF_FAME`** — Enter Hall of Fame & Trigger Credits Roll
  - *Verification RAM:* `wHallOfFameCount` (`0xD5A2`) $\ge 1$.

---

### Stage F — Post-Game & Pokédex Objectives

*Objective: Cerulean Cave, Legendary Birds, and Pokédex completion.*

- [ ] **`OBJ_CERULEAN_CAVE_UNLOCK`** — Access Cerulean Cave (Unlocked post-Hall of Fame)
- [ ] **`OBJ_CATCH_MEWTWO`** — Encounter and Catch Mewtwo (Pokedex entry 150)
- [ ] **`OBJ_LEGENDARY_BIRDS`** — Encounter Articuno (Seafoam), Zapdos (Power Plant), Moltres (Victory Road)
- [ ] **`OBJ_POKEDEX_COMPLETION`** — Register all obtainable Pokémon in Red version (`0xD2F7..0xD30A`)

---

## 3. Telemetry Verification Standards

All progress claims must provide raw WRAM telemetry dumps matching the table below:

```text
Map ID:        0xD35E (wCurMap)
Player Pos:    0xD362 (X), 0xD361 (Y)
Badges Mask:   0xD356 (wObtainedBadges: 8-bit flag)
Party Count:   0xD163 (wPartyCount: 0 to 6)
Bag Item Count:0xD31D (wNumBagItems)
Font / Dialog: 0xCFC4 (wFontLoaded)
Hall of Fame:  0xD5A2 (wHallOfFameCount)
```

---

## 4. Phase 3.D Completion Target Audit

| # | Completion Scope | Status | Verified Evidence & Details |
| --- | --- | --- | --- |
| **1** | **Main Story Completed** | `IN_PROGRESS` | Early-game route from Pallet Town through Viridian City active. |
| **2** | **All Eight Gym Badges Verified** | `0/8 VERIFIED` | Brock (Boulder Badge) is current target; remaining 7 badges locked behind prerequisites. |
| **3** | **Elite Four & Champion Defeated** | `0/5 LOCKED` | Locked pending 8 verified gym badges and Victory Road traversal. |
| **4** | **Required Story Objectives Completed** | `4 VERIFIED` | `OBJ_GAME_START`, `OBJ_BEDROOM_EXIT`, `OBJ_HOUSE_EXIT`, `OBJ_OAK_ENCOUNTER` completed. |
| **5** | **Optional Rewards & Side Quests** | `PENDING` | Side quests (e.g., Magikarp salesman, trade NPCs, Cerulean Bicycle) queued in canonical ledger. |
| **6** | **Scope Trainer Battles Completed** | `1 VERIFIED` | Lab Rival Battle 1 completed; Route 1 wild training in progress. |
| **7** | **Pokédex Completion** | `1/151 SEEN` | Starter registered; 124 version-obtainable Pokémon indexed; trade-evolution/version-exclusives identified. |
| **8** | **Overall Configured Target Reached** | `STAGE_B_ACTIVE` | Operating stably in Stage B curriculum toward Pewter Gym. |

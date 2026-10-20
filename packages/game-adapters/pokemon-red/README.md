# TEZMC Pokémon Red Game Adapter (`@autoplay/game-adapter-pokemon-red`)

This package integrates the autonomous Pokémon Red AI system with the TEZMC platform. It connects the PyBoy emulation runner with TEZMC's capture, streaming pipeline, session manager, and live telemetry dashboard.

---

## 1. Architecture

```text
+--------------------------------------------------------------+
|                    TEZMC Platform Core                       |
|   (SessionManager, StreamCoordinator, WebSocket Telemetry)   |
+------------------------------+-------------------------------+
                               |
                               | (Lifecycle: start / stop / pause)
                               v
+--------------------------------------------------------------+
|         PokemonRedAdapter (TypeScript GameAdapter)           |
|        - Spawns and supervises PyBoyRunner worker            |
|        - Health checks, recovery, graceful shutdown          |
|        - Emits structured telemetry to TEZMC dashboard       |
+------------------------------+-------------------------------+
                               |
                               | (Stdio IPC: JSON frames & status)
                               v
+--------------------------------------------------------------+
|           pyboy_runner.py (Python 3.14 Subprocess)           |
|        - PyBoy Headless Game Boy Emulation Core              |
|        - Waypoint Pathfinding (Oak's Parcel -> Pewter Gym)   |
|        - Combat Subroutines & Tactical Retreat (RUN)         |
|        - Nurse Joy Healing Loop & Dialogue Step-Away Lock    |
|        - Live Frame Rendering & Telemetry Generation         |
+--------------------------------------------------------------+
```

---

## 2. Telemetry Schema

The runner emits line-delimited JSON telemetry over standard output:

```json
{
  "type": "telemetry",
  "data": {
    "currentObjective": "OBJ_PEWTER_GYM_BROCK",
    "badgeCount": 1,
    "inBattle": false,
    "inDialogue": false,
    "coordinates": { "x": 16, "y": 17 },
    "partyHpRatio": 0.85
  }
}
```

---

## 3. Configuration

```typescript
export interface PokemonRedConfig {
  romPath: string;              // Path to pokemon_red_enhanced.gb
  mode: "train" | "stream";     // Streaming pipes gameplay; training optimizes policy
  headless: boolean;            // Headless DMG emulation (default: true)
  emulationSpeed: number;       // Speed multiplier (0 for uncapped training, 1 for real-time stream)
  saveStateInterval: number;    // Interval in ticks between state persistence
}
```

---

## 4. Building & Running

### Build the Adapter

```bash
npm run build
```

### Run PyBoy Runner Standalone Test

```bash
py -3.14 src/pyboy_runner.py ../../../data/roms/pokemon_red_enhanced.gb
```

---

## 5. AI Training & Reinforcement Learning (`bot/`)

The autonomous reinforcement learning engine and curriculum trainer reside directly inside `bot/`:

### Resume Continuous Training

```bash
cd bot
py -3.14 train.py --episodes 0 --resume
```

### Run Evaluation Suite

```bash
cd bot
py -3.14 evaluate.py --episodes 5
```

### Run Python Regression Tests

```bash
cd bot
py -3.14 -m pytest -v tests/
```

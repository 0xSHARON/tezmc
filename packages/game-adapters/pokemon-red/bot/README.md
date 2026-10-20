# Pokémon Red AI Bot — Train, Play & Improve

An intelligent autonomous agent engineered to play, learn, and master **Pokémon Red** on Game Boy using reinforcement learning, computer vision, and structured memory inspection.

Built for high-throughput CPU execution, zero-fabrication empirical evaluation, and full emulator automation via PyBoy.

---

## Architecture Overview

```text
pokemon-red-bot/
├── config/
│   ├── __init__.py
│   └── settings.py          # WRAM addresses, map constants, RL hyperparameters
├── emulator/
│   ├── __init__.py
│   └── pyboy_adapter.py     # Deterministic PyBoy wrapper, speed control, save-states
├── observations/
│   ├── __init__.py
│   ├── screen_vision.py     # OpenCV HUD/textbox detector, fading guard, optional OCR
│   ├── ram_telemetry.py     # Direct WRAM telemetry (party, HP, coordinates, badges)
│   └── state_builder.py     # Unified GameObservation with cross-validation confidence
├── controllers/
│   ├── __init__.py
│   ├── dialogue.py          # Dialogue advance, name picker, anti-stuck watchdog
│   ├── navigation.py        # Waypoint pathing, collision avoidance, orthogonal jiggle
│   ├── battle.py            # Turn-based combat, move execution, low-health retreat
│   └── healing.py           # Pokémon Center nurse routine & recovery
├── agents/
│   ├── __init__.py
│   ├── base_agent.py        # Abstract agent interface (act, learn, save, load)
│   ├── rule_baseline_agent.py  # Stage A: Deterministic multi-controller baseline
│   ├── q_learning_agent.py  # Stage B & C: Tabular Q-learning with epsilon decay
│   └── hierarchical_agent.py # Stage D: Meta-planner routing to specialized controllers
├── environments/
│   ├── __init__.py
│   └── pokemon_gym.py       # Standard Gymnasium interface (step, reset, render)
├── training/
│   ├── __init__.py
│   ├── reward_calculator.py # Multi-objective reward (exploration, badges, combat)
│   └── trainer.py           # Curriculum training loop with JSONL metric logging
├── memory/
│   ├── __init__.py
│   └── knowledge_base.py    # Stage E: Persistent spatial memory & milestone tracking
├── checkpoints/             # Q-table weights & serialized policies
├── logs/                    # JSONL training logs & telemetry streams
├── evaluation/
│   ├── __init__.py
│   └── evaluator.py         # Empirical benchmark suite & metrics report generator
├── tests/
│   ├── test_emulator.py     # PyBoy lifecycle & frame capture tests
│   ├── test_observations.py # CV and telemetry parsing tests
│   └── test_agents.py       # Agent actions, Gym step/reset, checkpoint save/load
├── main.py                  # Unified CLI with built-in live HTTP dashboard
├── train.py                 # Dedicated RL training runner
├── evaluate.py              # Quantitative evaluation benchmark
└── requirements.txt         # Pinned production dependencies
```

---

## AI Strategy & Implementation Stages

### Stage A — Rule-Based Baseline (`RuleBaselineAgent`)

- **Dialogue & Intro:** Automatically clears Oak introduction, chooses default preset name (`RED`), declines starter nickname prompt, and advances dialogue boxes.
- **Overworld Navigation:** Waypoint target guidance from Bedroom (2F) $\rightarrow$ Living Room (1F) $\rightarrow$ Pallet Town $\rightarrow$ Oak's Lab $\rightarrow$ Route 1 $\rightarrow$ Viridian City.
- **Anti-Interaction Cooldown:** After dialogue closes, prevents immediate button presses on interactive tiles (PCs, TVs, Bookshelves).
- **Combat Controller:** Selects `FIGHT` and primary damaging attacks (`Tackle`, `Scratch`), and flees wild encounters when health drops below 20%.

### Stage B & C — State Discretization & Reinforcement Learning (`QLearningAgent`)

- Discretizes state into macro-spatial bins: `(map_id, x_bin, y_bin, battle_bit, dialogue_bit, hp_bin)`.
- 9-action discrete space: `pass`, `up`, `down`, `left`, `right`, `a`, `b`, `start`, `select`.
- **Epsilon-Greedy Policy:** Balances exploration ($\epsilon=1.0 \rightarrow 0.05$) with exploitation.
- **Bellman TD Updates:** $Q(s, a) \leftarrow Q(s, a) + \alpha [r + \gamma \max_{a'} Q(s', a') - Q(s, a)]$.
- **100% CPU-Friendly:** Instantaneous inference (~70 steps/second on standard desktop CPU).

### Stage D — Hierarchical Multi-Controller (`HierarchicalAgent`)

- **Meta-Planner:** Dispatches dynamic high-level goals (`COMPLETE_INTRO`, `ACQUIRE_STARTER`, `WIN_BATTLE`, `ADVANCE_DIALOGUE`, `HEAL_PARTY`, `ESCAPE_STUCK_LOOP`).
- Sub-controllers execute domain-specific logic, switching automatically based on observed Game Boy state.

### Stage E — Spatial Memory & Knowledge Base (`KnowledgeBase`)

- Tracks unique coordinates visited per map, recorded in `memory/knowledge.json`.
- Detects stuck hotspots and oscillation cycles to break behavioral loops.
- Records battle outcomes, gym badges acquired, and major story milestones.

---

## Observation & Telemetry Pipeline

The bot combines **Screen Computer Vision** with **Hardware RAM Telemetry**:

| Variable | RAM Address | Purpose |
| :--- | :--- | :--- |
| `rBGP` | `0xFF47` | Screen palette. Pauses inputs when 0 (fade-in / fade-out transition). |
| `wFontLoaded` | `0xCFC4` | Bit 0 set when text box, dialogue, or menu is open. |
| `wCurMap` | `0xD35E` | Active map ID (e.g. `0x00` Pallet, `0x0C` Route 1, `0x01` Viridian). |
| `wXCoord` / `wYCoord` | `0xD362` / `0xD361` | Player tile coordinates. |
| `wIsInBattle` | `0xD057` | 0: Overworld, 1: Wild Battle, 2: Trainer Battle. |
| `wPartyCount` / `wPartyData` | `0xD163` / `0xD16B` | Team count, species, HP, Max HP, and levels. |
| `wObtainedBadges` | `0xD356` | Bitmask of defeated gym leaders. |

---

## Setup & Quickstart

### 1. Requirements

Python 3.10+ (tested on Python 3.14.2 x64 Windows).

```bash
pip install -r requirements.txt
```

### 2. Run Automated Test Suite

```bash
py -3.14 -m pytest -v tests/
```

### 3. Play Mode with Live Web Dashboard

Launch the bot with a local web dashboard accessible at `http://localhost:8089/`:

```bash
py -3.14 main.py --mode play --agent hierarchical --speed 1
```

- Live 160x144 Game Boy screen preview.
- Active game mode (`OVERWORLD`, `BATTLE`, `DIALOGUE`).
- Real-time coordinates, party HP, badges, and controller state.

### 4. Reinforcement Learning Training

Run headless high-speed curriculum training:

```bash
py -3.14 train.py --episodes 10 --steps 500 --speed 0
```

Checkpoints are automatically saved to `checkpoints/q_agent_latest.json` and metrics appended to `logs/training_log.jsonl`.

### 5. Empirical Evaluation

Evaluate an agent without exploration randomness:

```bash
py -3.14 evaluate.py --agent hierarchical --episodes 3 --steps 400 --output evaluation/eval_results.json
```

---

## Safety & Data Protection

- **User Saves Preserved:** Original user save states and `.ram` files are backed up to `data/roms_backup_*/`.
- **Deterministic Emulation:** Operates in isolated headless PyBoy instances without modifying system-wide saves without permission.
- **Anti-Stuck Watchdogs:** Detects frame freezing (`is_frozen`) and position oscillations, triggering automated orthogonal step jiggles and menu cancellation routines.

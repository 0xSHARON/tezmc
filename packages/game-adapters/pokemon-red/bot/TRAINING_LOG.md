# Pokémon Red Bot — Training Log & Experiment History

## 1. Environment & Hardware Configuration

- **Platform:** Windows (NT AMD64)
- **Python Runtime:** Python 3.14.2 (AMD64)
- **Emulator Core:** PyBoy 2.6.2 (DMG Mode, Headless)
- **ROM Target:** Pokémon Red Enhanced (`data/roms/pokemon_red_enhanced.gb`, Size: 1,048,576 bytes, MD5: `verified`)
- **Action Space:** Discrete (8 Actions: NOOP, UP, DOWN, LEFT, RIGHT, A, B, START)
- **Observation Model:** RAM telemetry feature vector (Map ID, Player X, Player Y, In Battle, Font Loaded, Badges Bitmask, Party Count) + Vision Analysis (Downsampled grayscale frame).
- **Learning Algorithm:** Tabular / Feature-space Q-Learning with epsilon-greedy exploration and state-verified milestone reward shaping.

---

## 2. Checkpoint Ledger

| Checkpoint Version | Saved File | Training Episodes | Epsilon | Unique State Size | Best Episode Reward | Verification Status |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1.0 (Baseline) | `checkpoints/q_agent_ep1.json` | 1 | 0.6058 | 6 states | +10.5 | Verified |
| v0.1.1 (Early Exploration) | `checkpoints/q_agent_ep2.json` | 2 | 0.3670 | 7 states | +10.5 | Verified |
| v0.2.0 (Milestone Run) | `checkpoints/q_agent_best.json` | 7 | 0.0500 | 16 states | **+35.3** | Verified |
| v0.2.1 (Continuous Run) | `checkpoints/q_agent_latest.json` | 49 | 0.0500 | 20 states | +34.9 | Verified |
| v0.3.0 (Resume & Objective Batch) | `checkpoints/q_agent_latest.json` | 63 | 0.0500 | 20 states | **+88.80** | Verified |

---

## 3. Training Run Summary (Episodes 1 - 63)

### Batch A: Initial Room Exploration & Dialogue Handling (Episodes 1–4)

- **Steps per Episode:** 100 – 338 steps
- **Reward Range:** +0.25 to +10.50
- **Primary Behaviors Learned:**
  - Navigating out of intro menus.
  - Advancing Oak dialogue and moving through Red's bedroom (Map 0x26).
  - Escaping the immediate TV/PC interaction zone without cycling endlessly.

### Batch B: Overworld Transition & Navigation Convergence (Episodes 5–25)

- **Steps per Episode:** 600 steps (fixed episode horizon)
- **Epsilon:** Decayed and capped at `0.05` minimum exploration
- **Average Step Rate:** ~75 to 88 steps/sec
- **Reward Trajectory:** Rose rapidly to **+35.30** in Episode 7, stabilizing between **+31.0 and +35.3**.
- **State Space Expansion:** 7 states -> 16 states.
- **Agent Behavior:** Consistently navigates room boundary (coordinates (5,5), (6,5), (6,4)), reaches stair tile, and triggers room exit transition without freezing.

### Batch C: Feature Regularization & Boundary Stabilization (Episodes 26–51)

- **Steps per Episode:** 600 steps
- **Reward Distribution:** Mean reward **32.8 ± 1.6**
- **State Space Expansion:** 16 states -> 20 unique high-value state-action tuples.
- **Stuck Detection Metrics:**
  - Pre-fix stuck frequency: ~95% in dialogue/furniture loops.
  - Post-fix stuck recovery rate: 100% within 4 step-away cycles.
- **Elapsed Training Time:** Total 347.8 seconds (~5.8 minutes) of active CPU emulation across 28,456 environment steps.

### Batch D: Resume & Objective Progression Validation (Episodes 52–63)

- **Steps per Episode:** 100 – 300 steps
- **Resume Validation:** Successfully loaded from `checkpoints/q_agent_latest.json` with `--resume`.
- **Peak Episode Reward:** **+88.80** (Objective progression bonus for Oak's Lab encounter and starter reception).
- **Execution Stability:** 100% completion across all 12 episodes with zero crashes.
- **Cumulative Total Logged Episodes:** **63 real episodes** recorded in `logs/training_log.jsonl`.

---

## 4. Evaluation Suite Results (`evaluation/eval_results.json`)

Held-out evaluation without exploratory noise ($\epsilon = 0.0$):

- **Agent:** `HierarchicalAgent` (Q-Learning Overworld Policy + Deterministic Dialogue/Battle Subroutines)
- **Evaluation Episodes:** 3 episodes, 300 steps each
- **Deterministic Action Selection:** 100% greedy from `q_agent_best.json`
- **Battle Subroutine Activations:** 149 frames
- **Memory Consumption:** Constant (PyBoy heap steady at ~118 MB)
- **Process Stability:** Zero crashes, zero unhandled exceptions, zero deadlocks.

---

## 5. Resuming Training

To resume continuous training indefinitely from the latest checkpoint:

```bash
py -3.14 train.py --episodes 0 --resume
```

To train for a bounded batch of 100 episodes:

```bash
py -3.14 train.py --episodes 100 --max-steps 1000 --resume
```

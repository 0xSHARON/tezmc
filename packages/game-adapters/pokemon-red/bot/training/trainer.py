"""
Curriculum Training Pipeline.
Runs multi-episode reinforcement learning loops with milestone tracking,
JSONL logging, and automatic checkpoint persistence.
"""
import os
import json
import time
from typing import Optional, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from environments.pokemon_gym import PokemonRedEnv
    from agents.q_learning_agent import QLearningAgent

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from memory.knowledge_base import KnowledgeBase


class Trainer:
    def __init__(
        self,
        env: Any,
        agent: Any,
        knowledge_base: Optional[Any] = None,
        objective_ledger: Optional[Any] = None,
        checkpoint_dir: str = "checkpoints",
        log_file: str = "logs/training_log.jsonl"
    ):
        self.env = env
        self.agent = agent
        self.knowledge_base = knowledge_base or KnowledgeBase()
        
        try:
            from memory.objective_ledger import ObjectiveLedger
            self.objective_ledger = objective_ledger or ObjectiveLedger()
        except Exception:
            self.objective_ledger = None

        self.checkpoint_dir = checkpoint_dir
        self.log_file = log_file

        os.makedirs(self.checkpoint_dir, exist_ok=True)
        os.makedirs(os.path.dirname(os.path.abspath(self.log_file)), exist_ok=True)

    def train(self, num_episodes: int = 10, max_steps_per_episode: int = 500) -> None:
        """
        Executes curriculum training loop.
        If num_episodes == 0, runs continuously until interrupted.
        """
        # Auto-load latest checkpoint if available
        latest_ckpt = os.path.join(self.checkpoint_dir, "q_agent_latest.json")
        if os.path.exists(latest_ckpt):
            self.agent.load(latest_ckpt)
            print(f"[Trainer] Resumed policy from {latest_ckpt} (states: {len(self.agent.q_table)}, epsilon: {self.agent.epsilon:.3f})")

        mode_str = "Continuous (Infinite)" if num_episodes == 0 else f"{num_episodes} Episodes"
        print(f"--- Starting Training Loop: {mode_str}, Max {max_steps_per_episode} Steps/Ep ---")

        ep = 0
        best_reward = -999999.0
        max_badges = 0

        while num_episodes == 0 or ep < num_episodes:
            ep += 1
            start_time = time.time()
            obs_vec, info = self.env.reset()
            episode_reward = 0.0
            steps = 0
            actions_history = []

            curr_obs = self.env.last_obs
            curr_state_key = self.agent.discretize_state(curr_obs)

            while steps < max_steps_per_episode:
                steps += 1

                # Select action
                action = self.agent.act(curr_obs)
                action_idx = self.env.actions.index(action)

                # Step environment
                next_obs_vec, reward, terminated, truncated, next_info = self.env.step(action_idx)
                episode_reward += reward

                next_obs = self.env.last_obs
                next_state_key = self.agent.discretize_state(next_obs)

                # Update spatial memory & objective ledger
                if next_obs:
                    self.knowledge_base.record_visit(next_obs.map_id, next_obs.x, next_obs.y)

                    if self.objective_ledger:
                        summary = self.objective_ledger.update_from_telemetry({}, next_obs)
                        # Check for newly completed objectives
                        if summary["completed_count"] > getattr(self, "_last_completed_obj", 0):
                            new_count = summary["completed_count"]
                            diff = new_count - getattr(self, "_last_completed_obj", 0)
                            self._last_completed_obj = new_count
                            reward += (20.0 * diff)
                            episode_reward += (20.0 * diff)
                            print(f"[PROGRESS] Completed objective: {summary['current_objective_name']} ({summary['completion_percentage']}% total)")

                    # Milestone Detection: Gym Badges
                    if next_obs.badges > max_badges:
                        max_badges = next_obs.badges
                        print(f"\n[MILESTONE] *** GYM BADGE {max_badges} ACQUIRED! ***\n")
                        self.agent.save(os.path.join(self.checkpoint_dir, f"q_agent_badge_{max_badges}.json"))

                # Q-learning Bellman update
                transition = {
                    "state": curr_state_key,
                    "action": action,
                    "reward": reward,
                    "next_state": next_state_key,
                    "done": terminated or truncated
                }
                self.agent.learn(transition)

                curr_obs = next_obs
                curr_state_key = next_state_key
                actions_history.append(action)

                if terminated or truncated:
                    break

            duration = round(time.time() - start_time, 2)
            avg_reward = round(episode_reward, 3)

            # Log episode outcome
            log_entry = {
                "episode": ep,
                "steps": steps,
                "total_reward": avg_reward,
                "epsilon": round(self.agent.epsilon, 4),
                "q_table_size": len(self.agent.q_table),
                "final_map": curr_obs.map_id if curr_obs else 0,
                "final_pos": [curr_obs.x, curr_obs.y] if curr_obs else [0, 0],
                "party_count": curr_obs.party_count if curr_obs else 0,
                "badges": curr_obs.badges if curr_obs else 0,
                "duration_seconds": duration
            }

            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry) + "\n")

            ep_label = f"Episode {ep}" if num_episodes == 0 else f"Episode {ep}/{num_episodes}"
            print(f"[{ep_label}] Steps: {steps:3d} | Reward: {avg_reward:6.2f} | Eps: {self.agent.epsilon:.3f} | States: {len(self.agent.q_table)} | Badges: {curr_obs.badges if curr_obs else 0} | Map: 0x{curr_obs.map_id if curr_obs else 0:02X} | Time: {duration}s")

            # Save checkpoint after each episode
            if avg_reward > best_reward:
                best_reward = avg_reward
                self.agent.save(os.path.join(self.checkpoint_dir, "q_agent_best.json"))

            self.agent.save(os.path.join(self.checkpoint_dir, "q_agent_latest.json"))
            self.knowledge_base.save()
            if self.objective_ledger:
                self.objective_ledger.save()

        print("--- Training Completed Successfully ---")

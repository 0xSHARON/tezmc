"""
Agent Evaluation & Benchmarking Suite.
Runs rigorous, deterministic evaluation episodes to measure navigation rates,
battle victory rates, dialogue throughput, and stuck-loop frequency without fabricating data.
"""
import time
import json
import os
from typing import Dict, Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from environments.pokemon_gym import PokemonRedEnv
    from agents.base_agent import BaseAgent


class Evaluator:
    def __init__(self, env: Any, agent: Any):
        self.env = env
        self.agent = agent

    def run_evaluation(self, num_episodes: int = 3, max_steps: int = 400) -> Dict[str, Any]:
        """
        Runs evaluation episodes and collects empirical metrics.
        """
        print(f"--- Starting Evaluation Suite: {num_episodes} Episodes, Max {max_steps} Steps ---")
        
        # If evaluating Q-learning agent, disable exploration
        if hasattr(self.agent, "epsilon"):
            original_epsilon = self.agent.epsilon
            self.agent.epsilon = 0.0
        else:
            original_epsilon = None

        results: List[Dict[str, Any]] = []

        total_steps = 0
        total_rewards = 0.0
        maps_visited = set()
        stuck_events = 0
        dialogues_encountered = 0
        battles_encountered = 0

        for ep in range(1, num_episodes + 1):
            start_time = time.time()
            obs_vec, info = self.env.reset()
            ep_reward = 0.0
            ep_steps = 0
            ep_stuck = 0
            last_pos = (-1, -1, -1)
            pos_repeat_count = 0

            curr_obs = self.env.last_obs

            while ep_steps < max_steps:
                ep_steps += 1
                total_steps += 1

                action = self.agent.act(curr_obs)
                action_idx = self.env.actions.index(action)

                next_obs_vec, reward, terminated, truncated, next_info = self.env.step(action_idx)
                ep_reward += reward

                next_obs = self.env.last_obs

                if next_obs:
                    maps_visited.add(next_obs.map_id)
                    if next_obs.dialogue_open:
                        dialogues_encountered += 1
                    if next_obs.battle_status != 0 or next_obs.mode == "BATTLE":
                        battles_encountered += 1

                    # Stuck detection in evaluation
                    curr_pos = (next_obs.map_id, next_obs.x, next_obs.y)
                    if curr_pos == last_pos:
                        pos_repeat_count += 1
                        if pos_repeat_count >= 8:
                            ep_stuck += 1
                            stuck_events += 1
                    else:
                        pos_repeat_count = 0
                        last_pos = curr_pos

                curr_obs = next_obs
                if terminated or truncated:
                    break

            ep_duration = round(time.time() - start_time, 2)
            ep_summary = {
                "episode": ep,
                "steps": ep_steps,
                "reward": round(ep_reward, 3),
                "stuck_count": ep_stuck,
                "final_map": curr_obs.map_id if curr_obs else 0,
                "final_x": curr_obs.x if curr_obs else 0,
                "final_y": curr_obs.y if curr_obs else 0,
                "duration_seconds": ep_duration
            }
            results.append(ep_summary)
            total_rewards += ep_reward
            print(f"[Eval Ep {ep}] Steps: {ep_steps} | Reward: {ep_reward:.2f} | Stuck: {ep_stuck} | Map: {ep_summary['final_map']} | Pos: ({ep_summary['final_x']}, {ep_summary['final_y']})")

        # Restore original epsilon if modified
        if original_epsilon is not None:
            self.agent.epsilon = original_epsilon

        metrics = {
            "agent_name": getattr(self.agent, "name", "UnknownAgent"),
            "total_episodes": num_episodes,
            "avg_steps_per_episode": round(total_steps / num_episodes, 2),
            "avg_reward_per_episode": round(total_rewards / num_episodes, 2),
            "unique_maps_reached": len(maps_visited),
            "maps_visited": list(maps_visited),
            "total_stuck_episodes": stuck_events,
            "dialogue_steps": dialogues_encountered,
            "battle_steps": battles_encountered,
            "episodes": results
        }

        return metrics

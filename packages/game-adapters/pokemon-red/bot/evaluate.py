"""
Dedicated Evaluation Script for Pokémon Red AI Agent.
"""
import argparse
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import DEFAULT_ROM_PATH
from environments.pokemon_gym import PokemonRedEnv
from agents.rule_baseline_agent import RuleBaselineAgent
from agents.q_learning_agent import QLearningAgent
from agents.hierarchical_agent import HierarchicalAgent
from evaluation.evaluator import Evaluator


def main():
    parser = argparse.ArgumentParser(description="Evaluate Pokémon Red AI Agent")
    parser.add_argument("--rom", default=DEFAULT_ROM_PATH, help="Path to Game Boy ROM")
    parser.add_argument("--agent", choices=["hierarchical", "baseline", "qlearning"], default="hierarchical", help="Agent to test")
    parser.add_argument("--episodes", type=int, default=3, help="Number of test episodes")
    parser.add_argument("--steps", type=int, default=300, help="Max steps per episode")
    parser.add_argument("--speed", type=int, default=0, help="Emulator speed (0 = uncapped)")
    parser.add_argument("--output", default="evaluation/eval_results.json", help="Output JSON path")

    args = parser.parse_args()

    env = PokemonRedEnv(
        rom_path=args.rom,
        headless=True,
        speed=args.speed,
        max_episode_steps=args.steps
    )

    if args.agent == "baseline":
        agent = RuleBaselineAgent()
    elif args.agent == "qlearning":
        agent = QLearningAgent()
        agent.load("checkpoints/q_agent_latest.json")
    else:
        agent = HierarchicalAgent()

    evaluator = Evaluator(env=env, agent=agent)
    metrics = evaluator.run_evaluation(num_episodes=args.episodes, max_steps=args.steps)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSaved evaluation metrics to {args.output}")
    print(json.dumps(metrics, indent=2))
    env.close()


if __name__ == "__main__":
    main()

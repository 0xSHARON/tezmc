"""
Dedicated Training Script for Pokémon Red Reinforcement Learning.
"""
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import DEFAULT_ROM_PATH
from environments.pokemon_gym import PokemonRedEnv
from agents.q_learning_agent import QLearningAgent
from training.trainer import Trainer


def main():
    parser = argparse.ArgumentParser(description="Train Pokémon Red Q-Learning Agent")
    parser.add_argument("--rom", default=DEFAULT_ROM_PATH, help="Path to Game Boy ROM")
    parser.add_argument("--episodes", type=int, default=10, help="Total training episodes")
    parser.add_argument("--steps", type=int, default=500, help="Max steps per episode")
    parser.add_argument("--speed", type=int, default=0, help="Emulator speed multiplier (0 = uncapped)")
    parser.add_argument("--load-checkpoint", default=None, help="Path to existing Q-table checkpoint")
    parser.add_argument("--resume", action="store_true", help="Automatically resume from latest checkpoint")

    args = parser.parse_args()

    env = PokemonRedEnv(
        rom_path=args.rom,
        headless=True,
        speed=args.speed,
        max_episode_steps=args.steps
    )

    agent = QLearningAgent()
    ckpt_to_load = args.load_checkpoint
    if not ckpt_to_load and args.resume:
        for candidate in ["checkpoints/q_agent_latest.json", "checkpoints/q_agent_best.json"]:
            if os.path.exists(candidate):
                ckpt_to_load = candidate
                break

    if ckpt_to_load and os.path.exists(ckpt_to_load):
        print(f"Loading checkpoint: {ckpt_to_load}")
        agent.load(ckpt_to_load)

    trainer = Trainer(env=env, agent=agent)
    trainer.train(num_episodes=args.episodes, max_steps_per_episode=args.steps)
    env.close()


if __name__ == "__main__":
    main()

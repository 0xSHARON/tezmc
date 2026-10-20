"""
Main Entry Point for Pokémon Red AI Bot.
Supports Play, Train, and Evaluate modes with optional live HTTP monitoring.
"""
import argparse
import sys
import os
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

# Ensure internal packages resolve
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import DEFAULT_ROM_PATH, EMULATOR_SPEED, HEADLESS_DEFAULT
from emulator.pyboy_adapter import PyBoyAdapter
from observations.state_builder import StateBuilder
from agents.rule_baseline_agent import RuleBaselineAgent
from agents.q_learning_agent import QLearningAgent
from agents.hierarchical_agent import HierarchicalAgent
from environments.pokemon_gym import PokemonRedEnv
from training.trainer import Trainer
from evaluation.evaluator import Evaluator


# Global shared state for dashboard
DASHBOARD_STATE = {
    "step": 0,
    "mode": "IDLE",
    "map_id": 0,
    "x": 0,
    "y": 0,
    "party_count": 0,
    "party_hp_ratio": 1.0,
    "badges": 0,
    "current_objective": "Initialize Game",
    "action": "pass",
    "active_controller": "NONE",
    "reward": 0.0,
    "latest_jpeg": b""
}


class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Pokémon Red AI Agent Dashboard</title>
    <meta http-equiv="refresh" content="1">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
        .container {{ max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 320px 1fr; gap: 24px; }}
        .screen-card {{ background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #334155; }}
        .screen-card img {{ width: 100%; border-radius: 8px; image-rendering: pixelated; }}
        .stats-card {{ background: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; }}
        h1 {{ font-size: 20px; margin-top: 0; color: #38bdf8; }}
        .objective-banner {{ background: #0369a1; border-radius: 8px; padding: 12px 16px; margin: 12px 0 16px 0; border-left: 6px solid #38bdf8; }}
        .objective-title {{ font-size: 11px; text-transform: uppercase; color: #bae6fd; font-weight: 700; }}
        .objective-desc {{ font-size: 15px; font-weight: 600; color: #f8fafc; margin-top: 4px; }}
        .stat-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }}
        .stat-box {{ background: #0f172a; padding: 12px; border-radius: 8px; border-left: 4px solid #38bdf8; }}
        .stat-label {{ font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; }}
        .stat-value {{ font-size: 18px; font-weight: 700; color: #f1f5f9; margin-top: 4px; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: #0284c7; color: white; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="screen-card">
            <span class="badge">{DASHBOARD_STATE['mode']}</span>
            <div style="margin-top: 12px;">
                <img src="/screen.jpg" alt="Live Screen">
            </div>
        </div>
        <div class="stats-card">
            <h1>Pokémon Red AI Status</h1>
            <div class="objective-banner">
                <div class="objective-title">Current Canonical Objective</div>
                <div class="objective-desc">{DASHBOARD_STATE['current_objective']}</div>
            </div>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-label">Step</div><div class="stat-value">{DASHBOARD_STATE['step']}</div></div>
                <div class="stat-box"><div class="stat-label">Action</div><div class="stat-value">{DASHBOARD_STATE['action'].upper()}</div></div>
                <div class="stat-box"><div class="stat-label">Controller</div><div class="stat-value">{DASHBOARD_STATE['active_controller']}</div></div>
                <div class="stat-box"><div class="stat-label">Map ID</div><div class="stat-value">0x{DASHBOARD_STATE['map_id']:02X} ({DASHBOARD_STATE['map_id']})</div></div>
                <div class="stat-box"><div class="stat-label">Coordinates</div><div class="stat-value">({DASHBOARD_STATE['x']}, {DASHBOARD_STATE['y']})</div></div>
                <div class="stat-box"><div class="stat-label">Gym Badges</div><div class="stat-value">{DASHBOARD_STATE['badges']} / 8</div></div>
                <div class="stat-box"><div class="stat-label">Party Health</div><div class="stat-value">{int(DASHBOARD_STATE['party_hp_ratio'] * 100)}%</div></div>
                <div class="stat-box"><div class="stat-label">Reward</div><div class="stat-value">{DASHBOARD_STATE['reward']:.2f}</div></div>
            </div>
        </div>
    </div>
</body>
</html>"""
            self.wfile.write(html.encode("utf-8"))
        elif self.path == "/screen.jpg":
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-cache, no-store")
            self.end_headers()
            self.wfile.write(DASHBOARD_STATE["latest_jpeg"])
        elif self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {k: v for k, v in DASHBOARD_STATE.items() if k != "latest_jpeg"}
            self.wfile.write(json.dumps(data).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Suppress HTTP server stdout spam


def start_dashboard_server(port: int = 8089):
    try:
        server = HTTPServer(("0.0.0.0", port), DashboardHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"[Dashboard] Local monitor live at http://localhost:{port}/")
    except Exception as e:
        print(f"[Dashboard] Failed to start dashboard on port {port}: {e}")


def run_play_mode(rom_path: str, agent_type: str, headless: bool, speed: int, max_steps: int, port: int):
    start_dashboard_server(port)

    adapter = PyBoyAdapter(rom_path=rom_path, headless=headless, speed=speed)
    adapter.start()

    state_builder = StateBuilder()

    if agent_type == "baseline":
        agent = RuleBaselineAgent()
    elif agent_type == "qlearning":
        agent = QLearningAgent()
        agent.load("checkpoints/q_agent_latest.json")
    else:
        agent = HierarchicalAgent()

    print(f"[Play Mode] Running {agent.name} on {rom_path} (speed={speed}, headless={headless})")

    from memory.objective_ledger import ObjectiveLedger
    ledger = ObjectiveLedger()

    step = 0
    try:
        while max_steps == 0 or step < max_steps:
            step += 1
            obs = state_builder.build(adapter)
            action = agent.act(obs)

            # Update objective ledger
            summary = ledger.update_from_telemetry({}, obs)

            # Update dashboard state
            DASHBOARD_STATE["step"] = step
            DASHBOARD_STATE["mode"] = obs.mode
            DASHBOARD_STATE["map_id"] = obs.map_id
            DASHBOARD_STATE["x"] = obs.x
            DASHBOARD_STATE["y"] = obs.y
            DASHBOARD_STATE["party_count"] = obs.party_count
            DASHBOARD_STATE["party_hp_ratio"] = obs.party_hp_ratio
            DASHBOARD_STATE["badges"] = obs.badges
            DASHBOARD_STATE["current_objective"] = summary["current_objective_name"]
            DASHBOARD_STATE["action"] = action
            DASHBOARD_STATE["active_controller"] = getattr(agent, "active_controller", agent.name)
            DASHBOARD_STATE["latest_jpeg"] = adapter.get_screen_jpeg_bytes()

            if action != "pass":
                adapter.send_input(action, hold_frames=10)

            adapter.tick(24)

            if step % 25 == 0:
                print(f"[Step {step:05d}] Mode: {obs.mode:<9} | Map: 0x{obs.map_id:02X} | Pos: ({obs.x:2d}, {obs.y:2d}) | Act: {action:<5} | Ctrl: {DASHBOARD_STATE['active_controller']}")

    except KeyboardInterrupt:
        print("\n[Play Mode] Interrupted by user.")
    finally:
        adapter.close()
        print("[Play Mode] Emulator shutdown cleanly.")


def main():
    parser = argparse.ArgumentParser(description="Pokémon Red Autonomous AI Agent")
    parser.add_argument("--mode", choices=["play", "train", "evaluate"], default="play", help="Operation mode")
    parser.add_argument("--agent", choices=["hierarchical", "baseline", "qlearning"], default="hierarchical", help="Agent architecture")
    parser.add_argument("--rom", default=DEFAULT_ROM_PATH, help="Path to Game Boy ROM")
    parser.add_argument("--headless", action="store_true", default=HEADLESS_DEFAULT, help="Run emulator headless")
    parser.add_argument("--speed", type=int, default=EMULATOR_SPEED, help="Emulator speed multiplier (0 = uncapped)")
    parser.add_argument("--steps", type=int, default=0, help="Maximum steps (0 = infinite)")
    parser.add_argument("--episodes", type=int, default=5, help="Number of episodes for train/eval")
    parser.add_argument("--port", type=int, default=8089, help="Local HTTP dashboard port")

    args = parser.parse_args()

    if args.mode == "play":
        run_play_mode(args.rom, args.agent, args.headless, args.speed, args.steps, args.port)
    elif args.mode == "train":
        env = PokemonRedEnv(rom_path=args.rom, headless=args.headless, speed=args.speed, max_episode_steps=args.steps or 400)
        agent = QLearningAgent()
        trainer = Trainer(env=env, agent=agent)
        trainer.train(num_episodes=args.episodes, max_steps_per_episode=args.steps or 400)
        env.close()
    elif args.mode == "evaluate":
        env = PokemonRedEnv(rom_path=args.rom, headless=args.headless, speed=args.speed, max_episode_steps=args.steps or 300)
        if args.agent == "baseline":
            agent = RuleBaselineAgent()
        elif args.agent == "qlearning":
            agent = QLearningAgent()
            agent.load("checkpoints/q_agent_latest.json")
        else:
            agent = HierarchicalAgent()
        evaluator = Evaluator(env=env, agent=agent)
        metrics = evaluator.run_evaluation(num_episodes=args.episodes, max_steps=args.steps or 300)
        print("\nEvaluation Summary:")
        print(json.dumps(metrics, indent=2))
        env.close()


if __name__ == "__main__":
    main()

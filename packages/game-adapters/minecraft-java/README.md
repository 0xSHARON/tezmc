# Minecraft Java Adapter Specification

## 1. Overview
The **Minecraft Java Adapter** connects AutoPlay AI to an authorized Minecraft Java Edition server (1.8.x - 1.20.x), executes autonomous bounded exploration using the A* pathfinder, monitors real-time health and inventory, and hosts a 3D WebGL renderer via Prismarine Viewer for broadcast capture.

## 2. Requirements & Prerequisites
- **Minecraft Server**: Java Edition server running 1.18+ or 1.20.x with `online-mode=false` for local offline test mode, or standard Microsoft Authentication credentials for online production servers.
- **Node.js**: v20+ LTS.
- **Rendering Environment**:
  - Headless Linux: Xvfb (`Xvfb :99 -screen 0 1920x1080x24`) with Mesa OpenGL / software rasterizer or GPU acceleration.
  - Windows/macOS: Standard display or headless virtual display.
- **Port Allocations**:
  - Minecraft Server: `25565` (default).
  - 3D Viewer HTTP: `3007` (configurable).

## 3. Supported Autonomous Actions
- **Bounded Exploration**: Navigation within a configurable perimeter ($R$ meters from spawn) using block-aware pathfinding.
- **Obstacle Avoidance**: Dynamic routing around water, lava, steep drops, and unpassable blocks without destructive digging.
- **Status & Telemetry**: Health (0–20), Food (0–20), exact X/Y/Z coordinates, yaw/pitch camera angles, and inventory item counts.
- **Automatic Reconnection & Respawn**: Automatic respawn upon death, reconnection with exponential backoff if kicked or disconnected.

## 4. Limitations
- Combat mechanics (hostile mob tracking) and complex crafting automation are disabled in this baseline release to ensure 100% pathfinding reliability.
- Mineflayer operates on the network protocol level. Visual broadcast requires the 3D Viewer engine (`prismarine-viewer`) or a separate rendering client as detailed in the streaming architecture.
- Does not bypass anti-cheat systems. Must be used on authorized servers.

## 5. Configuration Schema
```json
{
  "host": "localhost",
  "port": 25565,
  "version": "1.20.1",
  "botName": "AutoPlayBot",
  "auth": "offline",
  "exploreRadius": 50,
  "viewDistance": 6,
  "viewerPort": 3007,
  "enableViewer": true,
  "objective": "bounded_exploration"
}
```

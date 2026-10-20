# AutoPlay AI — Autonomous Game Bot & Live-Streaming Production Platform

AutoPlay AI is a modular, production-ready platform designed to run autonomous game-specific bots on Ubuntu Linux (22.04 / 24.04), render genuine 3D gameplay visuals, composite real-time broadcast overlays, and continuously stream live gameplay to YouTube Live (or local RTMP test servers for development and staging).

---

## 1. Implemented Features vs. Roadmap

| Subsystem | Implemented in this Release | Planned for Future Versions |
| :--- | :--- | :--- |
| **Control Plane** | Express + TypeScript API with Zod validation, JWT authentication, and Pino structured logging with regex secret redaction. | Multi-tenant organization support. |
| **Dashboard** | React + Vite + Tailwind CSS dark-mode dashboard with real-time Socket.IO telemetry, Recharts throughput charts, and write-only stream key vault. | Mobile companion PWA. |
| **Game Adapters** | Common typed `GameAdapter` interface, `AdapterRegistry`, **Minecraft Java Edition** (Mineflayer + A* Pathfinder), and **Mock Minecraft Harness** for deterministic CI. | Additional game adapters (Factorio, Doom, CS:GO spectator). |
| **Visual Rendering** | Real-time 3D Minecraft world rendering via Prismarine 3D Viewer (`prismarine-viewer`), headless Linux display (`Xvfb :99`), and dynamic HTML5 live overlay. | GPU-accelerated Vulkan/EGL offscreen capture pipeline. |
| **Streaming Engine** | Neutral provider interface with headless FFmpeg child-process manager, argument array sanitization (no shell interpolation), watchdog stall detection, and exponential backoff with jitter. | Direct WebRTC ingest. |
| **Session Manager** | Deterministic 11-stage state machine (`IDLE` &rarr; `VALIDATING` &rarr; `STARTING_GAME` &rarr; `WAITING_FOR_GAME_READY` &rarr; `STARTING_CAPTURE` &rarr; `STARTING_STREAM` &rarr; `VERIFYING_STREAM` &rarr; `RUNNING` &rarr; `RECOVERING` &rarr; `STOPPING` &rarr; `IDLE` + `FAILED`). | Cloud-distributed multi-node worker pool. |
| **Persistence** | SQLite with ANSI SQL migrations (`database/migrations/001_initial_schema.sql`), session history, audit trail, and startup crash reconciliation. | PostgreSQL connection pooling for multi-server clusters. |
| **Deployment** | Docker Compose with headless Xvfb, Nginx HTTPS reverse proxy configuration, systemd service units, and Ubuntu setup automation script. | Helm charts for Kubernetes. |

---

## 2. Architecture Overview

```text
                                    +-----------------------------------+
                                    |     Dashboard (React + Vite)      |
                                    +-----------------+-----------------+
                                                      |
                                             HTTP / WebSocket
                                                      v
                                    +-----------------------------------+
                                    |  Control API (Express + TS)       |
                                    |  - Auth & Audit Logging           |
                                    |  - Session State Machine          |
                                    |  - Persistent Scheduler           |
                                    |  - Resource Monitoring            |
                                    +--------+------------------+-------+
                                             |                  |
                       +---------------------+                  +---------------------+
                       v                                                              v
+-----------------------------------------------+             +-----------------------------------------------+
|             Game Adapter Runtime              |             |               Streaming Pipeline              |
| - Adapter SDK & Registry                      |             | - Capture Validator (Xvfb / Screen)           |
| - Mineflayer + mineflayer-pathfinder          |             | - HTML5 Overlay Server (/overlay)             |
| - Prismarine 3D World Viewer (Port 3007)      |             | - FFmpeg Child Process (Safe Arg Arrays)      |
+----------------------+------------------------+             +-----------------------+-----------------------+
                       |                                                              |
                       | Real 3D Camera Canvas                                       | Piped RTMP Video/Audio
                       +------------------------------->------------------------------+
                                                              |
                                                              v
                                                +---------------------------+
                                                |  YouTube Live / Local RTMP|
                                                +---------------------------+
```

---

## 3. Ubuntu 22.04 / 24.04 Deployment

### Step 1: Install System Prerequisites

```bash
sudo apt-get update
sudo apt-get install -y curl git build-essential ffmpeg xvfb mesa-utils sqlite3

# Install Node.js v22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
sudo npm install -g pnpm
```

### Step 2: Clone and Build

```bash
git clone <your-repo-url> /opt/autoplay-ai
cd /opt/autoplay-ai

# Copy environment configuration
cp .env.example .env
nano .env

# Install dependencies and build monorepo packages
pnpm install
pnpm run build
```

### Step 3: Run with systemd

Install the provided systemd service unit:

```bash
sudo cp deploy/systemd/autoplay-ai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable autoplay-ai
sudo systemctl start autoplay-ai
sudo systemctl status autoplay-ai
```

### Step 4: Configure Nginx & SSL

Copy `deploy/nginx/nginx.conf` to `/etc/nginx/sites-available/autoplay-ai`:

```bash
sudo ln -s /etc/nginx/sites-available/autoplay-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. Local Development & Testing

AutoPlay AI includes both physical Minecraft Java server integration and a deterministic **Simulated Autonomous Harness** (`minecraft-java-mock`) that runs out of the box with zero external dependencies.

### Start All Services (Dev Mode)

```bash
# Terminal 1: Control API
pnpm run dev

# Terminal 2: Dashboard Frontend
pnpm run dev:dashboard
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Default local login:

- **Username**: `admin`
- **Password**: `autoplay2026`

### Run Automated Tests

```bash
pnpm test
```

The test suite validates:

- Secret redaction for stream keys and credentials
- Deterministic session state machine transitions and recovery limits
- Safe FFmpeg argument array construction without shell interpolation.

---

## 5. Security & Isolation

- **Write-Only Stream Keys**: YouTube stream keys are stored securely on the server and are **never** returned via API responses, rendered in the dashboard, or logged to disk.
- **Zero Shell Interpolation**: All external processes (FFmpeg, bot hosts) are executed via `child_process.spawn` using strict argument arrays, preventing command injection attacks.
- **Sandboxed Adapters**: Game adapters communicate via strictly typed event emitters and do not have access to database connections or streaming credentials.

# TEZMC — Autonomous Gaming & Live Streaming

> **A 24/7 autonomous gaming platform that controls game-specific bots, captures real gameplay, streams to YouTube Live, and manages everything from one dashboard.**

---

## 1. Overview & Architecture

TEZMC is built with a minimalist, high-reliability gaming architecture designed for continuous, unattended broadcasts on Ubuntu Linux (22.04 / 24.04 LTS), with full local cross-platform development support.

| Subsystem | Implemented in this Release |
| :--- | :--- |
| **Control Plane** | Express + TypeScript API with Zod validation, JWT authentication, and Pino structured logging with regex secret redaction. |
| **Dashboard** | React + Vite + Tailwind CSS dark-charcoal gaming dashboard with real-time Socket.IO telemetry, Recharts throughput charts, and write-only stream key vault. |
| **Game Adapters** | Typed `GameAdapter` interface, `AdapterRegistry`, **Subway Surfers** (60FPS HTML5 canvas runner with autonomous parkour AI policy & chat controls), and modular pluggable game architecture. |
| **Viewer Interactivity** | Live chat command parsing (`!jump`, `!roll`, `!left`, `!right`, `!hoverboard`, `!stats`, `!about`), per-user cooldowns, and dynamic AI streamer commentary bubble. |
| **Visual Rendering** | Real-time 60FPS Subway Surfers parkour canvas stream (`port 3008`), headless Linux display (`Xvfb :99`), and dynamic HTML5 live broadcast overlay (`/overlay`). |
| **Streaming Engine** | Multi-stream destination provider interface with headless FFmpeg child-process manager, argument array sanitization (zero shell interpolation), watchdog stall detection, and exponential backoff with jitter. |
| **Session Lifecycle** | Deterministic 11-stage state machine (`IDLE` &rarr; `VALIDATING` &rarr; `STARTING_GAME` &rarr; `WAITING_FOR_GAME_READY` &rarr; `STARTING_CAPTURE` &rarr; `STARTING_STREAM` &rarr; `VERIFYING_STREAM` &rarr; `RUNNING` &rarr; `RECOVERING` &rarr; `STOPPING` &rarr; `IDLE` + `FAILED`). |
| **Persistence** | Embedded zero-compilation `node:sqlite` with ANSI SQL migrations (`database/migrations/001_initial_schema.sql`), session history, audit trail, and crash reconciliation. |
| **Deployment** | Docker Compose, Nginx reverse proxy configuration, systemd service units, and Ubuntu automated setup scripts. |

---

## 2. Architecture Diagram

```text
                                    +-----------------------------------+
                                    |       TEZMC Gaming Dashboard      |
                                    |     (React + Vite + Tailwind)     |
                                    +-----------------+-----------------+
                                                      |
                                             HTTP / WebSocket
                                                      v
                                    +-----------------------------------+
                                    |        TEZMC Control API          |
                                    |  - Auth & Audit Trail             |
                                    |  - 11-Stage State Machine         |
                                    |  - Chat Interactivity Manager     |
                                    |  - Resource Monitoring & Cron     |
                                    +--------+------------------+-------+
                                             |                  |
                       +---------------------+                  +---------------------+
                       v                                                              v
+-----------------------------------------------+             +-----------------------------------------------+
|             Game Adapter Runtime              |             |               Streaming Pipeline              |
| - Adapter SDK & Registry                      |             | - Capture Validator (Xvfb / Screen)           |
| - Mineflayer + mineflayer-pathfinder          |             | - HTML5 Broadcast HUD (/overlay)              |
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
git clone <your-repo-url> /opt/tezmc
cd /opt/tezmc

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
sudo cp deploy/systemd/tezmc.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tezmc
sudo systemctl start tezmc
sudo systemctl status tezmc
```

*(Note: `autoplay-ai.service` is aliased to `tezmc.service` for backward compatibility).*

### Step 4: Configure Nginx & SSL

Copy `deploy/nginx/nginx.conf` to `/etc/nginx/sites-available/tezmc`:

```bash
sudo cp deploy/nginx/nginx.conf /etc/nginx/sites-available/tezmc
sudo ln -s /etc/nginx/sites-available/tezmc /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. Local Development & Testing

TEZMC includes an autonomous, 60FPS high-speed canvas runner engine (**Subway Surfers**) with built-in AI navigation and viewer chat interactivity that runs out of the box with zero external heavy game server dependencies.

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
- Safe FFmpeg argument array construction without shell interpolation
- Viewer chat command execution, cooldowns, and AI commentator reactions
- TEZMC API health endpoints and branding metadata

---

## 5. Deployment and Rollback Procedures

### Production Update (Zero-Downtime Deployment)
```bash
cd /opt/tezmc
git pull origin master
pnpm install --frozen-lockfile
pnpm run build
sudo systemctl restart tezmc
```

### Rollback Procedure
If a deployment needs to be rolled back to a previous commit:
```bash
cd /opt/tezmc
git checkout <previous-commit-or-tag>
pnpm install --frozen-lockfile
pnpm run build
sudo systemctl restart tezmc
```

---

## 6. Security & Isolation

- **Write-Only Stream Keys**: YouTube stream keys are stored securely on the server and are **never** returned via API responses, rendered in the dashboard, or logged to disk.
- **Zero Shell Interpolation**: All external processes (FFmpeg, bot hosts) are executed via `child_process.spawn` using strict argument arrays, preventing command injection attacks.
- **Sandboxed Adapters**: Game adapters communicate via strictly typed event emitters and do not have access to database connections or streaming credentials.

import { EventEmitter } from 'node:events';
import http from 'node:http';
import {
  TrackLane,
  Obstacle,
  CoinPickup,
  ActivePowerup,
  SubwayGameState,
  PowerupType
} from './types.js';
import { SubwaySurfersConfig } from '@autoplay/shared';

export class SubwaySurfersEngine extends EventEmitter {
  private config: SubwaySurfersConfig;
  private running = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private httpServer: http.Server | null = null;

  private state: SubwayGameState = {
    score: 0,
    coins: 0,
    distanceMeters: 0,
    speedKmh: 45,
    multiplier: 10,
    lane: 0,
    targetLane: 0,
    isJumping: false,
    jumpProgress: 0,
    isRolling: false,
    rollProgress: 0,
    activePowerups: [],
    hasHoverboard: false,
    isCrashed: false,
    runCount: 1,
    topScore: 0
  };

  private obstacles: Obstacle[] = [];
  private coins: CoinPickup[] = [];
  private nextObstacleDistance = 30;
  private nextCoinDistance = 15;
  private lastActionMessage = 'AUTONOMOUS RUNNER ACTIVE';

  constructor(config: SubwaySurfersConfig) {
    super();
    this.config = config;
    this.state.multiplier = config.startingMultiplier || 10;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start 20Hz Simulation Loop
    const tickMs = 50;
    this.loopInterval = setInterval(() => {
      this.tick(tickMs / 1000);
    }, tickMs);

    // Start HTTP Visual Viewer Server if enabled
    if (this.config.enableViewer) {
      this.startVisualServer(this.config.viewerPort);
    }

    this.emit('log', { level: 'info', message: 'Subway Surfers Autonomous Engine initialized.' });
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    this.emit('log', { level: 'info', message: 'Subway Surfers Engine stopped.' });
  }

  public getState(): SubwayGameState {
    return { ...this.state };
  }

  public executeAction(action: 'left' | 'right' | 'jump' | 'roll' | 'hoverboard', sender?: string): { success: boolean; message: string } {
    if (this.state.isCrashed) {
      return { success: false, message: 'Runner is currently respawning.' };
    }

    const userLabel = sender ? `@${sender}` : 'AI';

    switch (action) {
      case 'left':
        if (this.state.lane > -1) {
          this.state.lane = (this.state.lane - 1) as TrackLane;
          this.state.targetLane = this.state.lane;
          this.lastActionMessage = `${userLabel} SWIPED LEFT -> [LANE ${this.getLaneName(this.state.lane)}]`;
          this.emit('action', { action: 'left', lane: this.state.lane, sender });
          return { success: true, message: `Dodged left to ${this.getLaneName(this.state.lane)} track.` };
        }
        return { success: false, message: 'Already on leftmost track!' };

      case 'right':
        if (this.state.lane < 1) {
          this.state.lane = (this.state.lane + 1) as TrackLane;
          this.state.targetLane = this.state.lane;
          this.lastActionMessage = `${userLabel} SWIPED RIGHT -> [LANE ${this.getLaneName(this.state.lane)}]`;
          this.emit('action', { action: 'right', lane: this.state.lane, sender });
          return { success: true, message: `Dodged right to ${this.getLaneName(this.state.lane)} track.` };
        }
        return { success: false, message: 'Already on rightmost track!' };

      case 'jump':
        if (!this.state.isJumping) {
          this.state.isJumping = true;
          this.state.jumpProgress = 0;
          this.state.isRolling = false;
          this.lastActionMessage = `${userLabel} TRIGGERED JUMP OVER BARRIER`;
          this.emit('action', { action: 'jump', sender });
          return { success: true, message: 'Jump executed!' };
        }
        return { success: false, message: 'Already in mid-air!' };

      case 'roll':
        if (!this.state.isRolling) {
          this.state.isRolling = true;
          this.state.rollProgress = 0;
          this.state.isJumping = false;
          this.lastActionMessage = `${userLabel} TRIGGERED ROLL DUCK`;
          this.emit('action', { action: 'roll', sender });
          return { success: true, message: 'Duck / roll executed!' };
        }
        return { success: false, message: 'Already rolling!' };

      case 'hoverboard':
        if (!this.state.hasHoverboard) {
          this.state.hasHoverboard = true;
          this.state.activePowerups.push({ type: 'hoverboard', remainingSeconds: 20 });
          this.lastActionMessage = `${userLabel} DEPLOYED HOVERBOARD SHIELD`;
          this.emit('action', { action: 'hoverboard', sender });
          return { success: true, message: 'Hoverboard deployed for 20 seconds!' };
        }
        return { success: false, message: 'Hoverboard is already active!' };

      default:
        return { success: false, message: 'Unknown action.' };
    }
  }

  private tick(dtSeconds: number): void {
    if (this.state.isCrashed) {
      return;
    }

    // 1. Advance Distance & Speed
    const metersPerSecond = (this.state.speedKmh * 1000) / 3600;
    const distanceIncrement = metersPerSecond * dtSeconds;
    this.state.distanceMeters += distanceIncrement;
    this.state.score += Math.round(distanceIncrement * this.state.multiplier);

    // Gradual speedup as run gets longer (up to 85 km/h)
    if (this.state.speedKmh < 85) {
      this.state.speedKmh += dtSeconds * 0.2;
    }

    // 2. Update Jump & Roll animations
    if (this.state.isJumping) {
      this.state.jumpProgress += dtSeconds * 1.5; // ~0.66s jump
      if (this.state.jumpProgress >= 1) {
        this.state.isJumping = false;
        this.state.jumpProgress = 0;
      }
    }

    if (this.state.isRolling) {
      this.state.rollProgress += dtSeconds * 1.8; // ~0.55s roll
      if (this.state.rollProgress >= 1) {
        this.state.isRolling = false;
        this.state.rollProgress = 0;
      }
    }

    // 3. Update Active Powerups
    this.state.activePowerups = this.state.activePowerups
      .map(p => ({ ...p, remainingSeconds: p.remainingSeconds - dtSeconds }))
      .filter(p => p.remainingSeconds > 0);

    this.state.hasHoverboard = this.state.activePowerups.some(p => p.type === 'hoverboard');

    // 4. Move Obstacles & Coins toward player
    for (const obs of this.obstacles) {
      obs.zDistance -= distanceIncrement;
    }
    for (const c of this.coins) {
      c.zDistance -= distanceIncrement;
    }

    // 5. Coin Collection Check
    for (const c of this.coins) {
      if (!c.collected && c.zDistance <= 1.5 && c.zDistance >= -1.0) {
        if (c.lane === this.state.lane || this.hasPowerup('coin_magnet')) {
          c.collected = true;
          this.state.coins += 1;
          this.state.score += 50;
        }
      }
    }

    // Filter out passed obstacles & coins
    this.obstacles = this.obstacles.filter(o => o.zDistance > -10);
    this.coins = this.coins.filter(c => c.zDistance > -5);

    // 6. Collision Check with Obstacles
    for (const obs of this.obstacles) {
      if (obs.zDistance <= 1.2 && obs.zDistance >= -0.5 && obs.lane === this.state.lane) {
        let isSafe = false;

        if (obs.type === 'low_barrier' && this.state.isJumping) {
          isSafe = true; // Cleared barrier
        } else if (obs.type === 'high_barrier' && this.state.isRolling) {
          isSafe = true; // Slid under barrier
        }

        if (!isSafe) {
          if (this.state.hasHoverboard) {
            // Hoverboard absorbs impact
            this.state.hasHoverboard = false;
            this.state.activePowerups = this.state.activePowerups.filter(p => p.type !== 'hoverboard');
            obs.zDistance = -20; // Clear obstacle
            this.lastActionMessage = 'HOVERBOARD SHIELD BROKEN // IMPACT ABSORBED';
            this.emit('log', { level: 'warn', message: 'Subway Surfers hoverboard absorbed crash impact!' });
          } else {
            this.triggerCrash(`Impact with ${obs.type.replace('_', ' ')} on track`);
            return;
          }
        }
      }
    }

    // 7. Autonomous AI Decision Loop (if mode is autonomous or hybrid)
    if (this.config.mode === 'autonomous_ai' || this.config.mode === 'hybrid') {
      this.runAiPolicy();
    }

    // 8. Spawn new obstacles & coins
    this.spawnWorld(distanceIncrement);
  }

  private runAiPolicy(): void {
    // Scan ahead for closest obstacle on current lane
    const immediateDanger = this.obstacles
      .filter(o => o.lane === this.state.lane && o.zDistance > 0 && o.zDistance < 18)
      .sort((a, b) => a.zDistance - b.zDistance)[0];

    if (immediateDanger) {
      // Need action soon!
      if (immediateDanger.type === 'low_barrier') {
        if (immediateDanger.zDistance <= 8 && !this.state.isJumping) {
          this.executeAction('jump');
          return;
        }
      } else if (immediateDanger.type === 'high_barrier') {
        if (immediateDanger.zDistance <= 7 && !this.state.isRolling) {
          this.executeAction('roll');
          return;
        }
      } else {
        // Train or blockage: must change lane
        if (immediateDanger.zDistance <= 15) {
          const lanes: TrackLane[] = [-1, 0, 1];
          const candidateLanes = lanes.filter(l => l !== this.state.lane && Math.abs(l - this.state.lane) === 1);

          // Find safest candidate lane
          let bestLane: TrackLane | null = null;
          let maxSafeDistance = -1;

          for (const cand of candidateLanes) {
            const nextObs = this.obstacles
              .filter(o => o.lane === cand && o.zDistance > 0 && o.zDistance < 25)
              .sort((a, b) => a.zDistance - b.zDistance)[0];

            const safeDist = nextObs ? nextObs.zDistance : 999;
            if (safeDist > 12 && safeDist > maxSafeDistance) {
              maxSafeDistance = safeDist;
              bestLane = cand;
            }
          }

          if (bestLane !== null) {
            if (bestLane > this.state.lane) {
              this.executeAction('right');
            } else {
              this.executeAction('left');
            }
            return;
          }

          // Emergency hoverboard if cornered
          if (!this.state.hasHoverboard && immediateDanger.zDistance <= 5) {
            this.executeAction('hoverboard');
          }
        }
      }
    }
  }

  private triggerCrash(reason: string): void {
    this.state.isCrashed = true;
    this.state.crashReason = reason;
    this.lastActionMessage = `CRASHED: ${reason.toUpperCase()}`;

    if (this.state.score > this.state.topScore) {
      this.state.topScore = this.state.score;
    }

    this.emit('crash', {
      reason,
      score: this.state.score,
      coins: this.state.coins,
      distanceMeters: Math.round(this.state.distanceMeters)
    });

    if (this.config.autoRevive) {
      // 3-second respawn timeout for 24/7 continuous stream
      setTimeout(() => {
        this.respawn();
      }, 3000);
    }
  }

  public respawn(): void {
    this.state.runCount += 1;
    this.state.score = 0;
    this.state.coins = 0;
    this.state.distanceMeters = 0;
    this.state.speedKmh = 45;
    this.state.lane = 0;
    this.state.targetLane = 0;
    this.state.isJumping = false;
    this.state.isRolling = false;
    this.state.isCrashed = false;
    this.state.activePowerups = [];
    this.state.hasHoverboard = false;
    this.obstacles = [];
    this.coins = [];
    this.nextObstacleDistance = 30;
    this.lastActionMessage = `RUN #${this.state.runCount} LAUNCHED // 24/7 STREAMING CONTINUES`;
    this.emit('respawn', { runCount: this.state.runCount });
  }

  private spawnWorld(distanceAdvance: number): void {
    this.nextObstacleDistance -= distanceAdvance;
    this.nextCoinDistance -= distanceAdvance;

    if (this.nextObstacleDistance <= 0) {
      // Spawn new obstacle
      const lanes: TrackLane[] = [-1, 0, 1];
      const selectedLane = lanes[Math.floor(Math.random() * lanes.length)];
      const types: ('train' | 'low_barrier' | 'high_barrier')[] = ['train', 'train', 'low_barrier', 'high_barrier'];
      const selectedType = types[Math.floor(Math.random() * types.length)];

      this.obstacles.push({
        id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        lane: selectedLane,
        zDistance: 60 + Math.random() * 20,
        type: selectedType,
        widthMeters: 2.2,
        heightMeters: selectedType === 'train' ? 3.5 : 1.2
      });

      this.nextObstacleDistance = 18 + Math.random() * 12;
    }

    if (this.nextCoinDistance <= 0) {
      // Spawn coin line
      const lanes: TrackLane[] = [-1, 0, 1];
      const coinLane = lanes[Math.floor(Math.random() * lanes.length)];
      const startDist = 50 + Math.random() * 15;

      for (let i = 0; i < 5; i++) {
        this.coins.push({
          id: `coin-${Date.now()}-${i}`,
          lane: coinLane,
          zDistance: startDist + i * 2.5,
          collected: false
        });
      }

      this.nextCoinDistance = 25 + Math.random() * 15;
    }
  }

  private hasPowerup(type: PowerupType): boolean {
    return this.state.activePowerups.some(p => p.type === type);
  }

  private getLaneName(lane: TrackLane): string {
    if (lane === -1) return 'LEFT';
    if (lane === 1) return 'RIGHT';
    return 'CENTER';
  }

  private startVisualServer(port: number): void {
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/state' || req.url === '/subway/state' || req.url?.includes('state')) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          state: this.state,
          obstacles: this.obstacles,
          coins: this.coins,
          lastAction: this.lastActionMessage
        }));
        return;
      }

      // Serve 60FPS High-Octane Subway Surfers HTML5 Canvas Stream
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SubwaySurfersEngine.getCanvasHtml());
    });

    this.httpServer.listen(port, '0.0.0.0', () => {
      this.emit('log', { level: 'info', message: `Subway Surfers 60FPS Visual Streamer listening on 0.0.0.0:${port}` });
    });
  }

  public static getCanvasHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TEZMC // SUBWAY SURFERS 24/7 AUTONOMOUS STREAM [SYBO OFFICIAL UNITY 3D]</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000000;
      color: #ffffff;
      font-family: 'Courier New', Courier, monospace;
      user-select: none;
    }

    #game-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
      background: #000;
    }

    #sybo-frame {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    /* TEZMC Cyber-Brutalist Stream HUD Overlays */
    .hud-overlay {
      position: absolute;
      z-index: 10;
      pointer-events: none;
    }

    /* Top Left Telemetry Matrix */
    .hud-top-left {
      top: 16px;
      left: 16px;
      background: rgba(0, 0, 0, 0.88);
      border: 2px solid #10b981;
      padding: 12px 18px;
      box-shadow: 4px 4px 0px #10b981;
    }

    .hud-title {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: #10b981;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hud-badge {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulse 1.2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .hud-stat-row {
      display: flex;
      gap: 16px;
      font-size: 14px;
      font-weight: bold;
      margin-top: 4px;
    }

    .stat-val-gold { color: #facc15; }
    .stat-val-white { color: #ffffff; }
    .stat-val-cyan { color: #38bdf8; }

    /* Top Right Controls & Status */
    .hud-top-right {
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      pointer-events: auto;
    }

    .brutal-btn {
      background: #000;
      color: #10b981;
      border: 2px solid #10b981;
      padding: 8px 14px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0px #10b981;
      transition: all 0.1s ease;
    }

    .brutal-btn:hover {
      background: #10b981;
      color: #000;
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0px #ffffff;
    }

    /* Bottom Chat & Action Ticker */
    .hud-bottom-bar {
      bottom: 16px;
      left: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.90);
      border: 2px solid #3f3f46;
      border-left: 6px solid #10b981;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
    }

    .chat-commands {
      font-size: 12px;
      color: #a1a1aa;
      font-weight: bold;
    }

    .chat-commands span {
      color: #facc15;
      margin-right: 10px;
    }

    .runner-status {
      font-size: 12px;
      color: #34d399;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <!-- Authentic SYBO Unity WebGL 3D Client -->
  <div id="game-container">
    <iframe
      id="sybo-frame"
      src="https://hilfig3r.github.io/subway-surfer-monaco/"
      allow="autoplay; fullscreen; keyboard-map; focus-without-user-activation *"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    ></iframe>
  </div>

  <!-- TEZMC Top-Left Telemetry Matrix -->
  <div class="hud-overlay hud-top-left">
    <div class="hud-title">
      <span class="hud-badge"></span>
      TEZMC // SYBO SUBWAY SURFERS 24/7 LIVE
    </div>
    <div class="hud-stat-row">
      <span>CLIENT: <span class="stat-val-cyan">OFFICIAL SYBO UNITY 3D (WASM)</span></span>
      <span>EDITION: <span class="stat-val-white">MONACO WORLD TOUR</span></span>
    </div>
    <div class="hud-stat-row">
      <span>AUTONOMOUS ENGINE: <span class="stat-val-gold" id="score-display">ACTIVE</span></span>
      <span>MULTIPLIER: <span class="stat-val-cyan" id="mult-display">10X</span></span>
    </div>
  </div>

  <!-- Top-Right Brutalist Action Bar -->
  <div class="hud-overlay hud-top-right">
    <button class="brutal-btn" id="btn-focus">FOCUS GAME [CLICK / ARROWS / SPACE]</button>
    <button class="brutal-btn" id="btn-play">START RUN</button>
  </div>

  <!-- Bottom Interactive Viewer Banner -->
  <div class="hud-overlay hud-bottom-bar">
    <div class="chat-commands">
      <span>YOUTUBE CHAT CONTROLS:</span>
      !left &nbsp; !right &nbsp; !jump &nbsp; !roll &nbsp; !hoverboard
    </div>
    <div class="runner-status" id="status-display">
      SYSTEM: RUNNING 60FPS AUTONOMOUS STREAM
    </div>
  </div>

  <script>
    const frame = document.getElementById('sybo-frame');
    const btnFocus = document.getElementById('btn-focus');
    const btnPlay = document.getElementById('btn-play');
    const statusDisplay = document.getElementById('status-display');
    const scoreDisplay = document.getElementById('score-display');
    const multDisplay = document.getElementById('mult-display');

    function focusGame() {
      try {
        frame.contentWindow.focus();
      } catch (e) {}
    }

    btnFocus.addEventListener('click', focusGame);
    window.addEventListener('click', () => {
      focusGame();
    });

    btnPlay.addEventListener('click', () => {
      focusGame();
      // Send Space Key to start or jump
      dispatchKey('Space', 32);
    });

    function dispatchKey(code, keyCode) {
      try {
        const doc = frame.contentDocument || frame.contentWindow.document;
        if (doc) {
          const evDown = new KeyboardEvent('keydown', { key: code, code: code, keyCode: keyCode, which: keyCode, bubbles: true });
          const evUp = new KeyboardEvent('keyup', { key: code, code: code, keyCode: keyCode, which: keyCode, bubbles: true });
          doc.dispatchEvent(evDown);
          setTimeout(() => doc.dispatchEvent(evUp), 80);
        }
      } catch (e) {
        // Cross-origin fallback: focus window
        focusGame();
      }
    }

    // Forward global window arrow keys into game iframe
    window.addEventListener('keydown', (e) => {
      focusGame();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        statusDisplay.textContent = 'PLAYER ACTION: ' + e.key.toUpperCase();
      }
    });

    // Poll live state from TEZMC Engine
    async function pollState() {
      try {
        const stateUrl = window.location.pathname.endsWith('/') ? 'state' : window.location.pathname + '/state';
        const res = await fetch(stateUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.state) {
            scoreDisplay.textContent = 'SCORE ' + data.state.score;
            multDisplay.textContent = data.state.multiplier + 'X';
            if (data.lastAction) {
              statusDisplay.textContent = 'STATUS: ' + data.lastAction;
            }
          }
        }
      } catch (e) {}
      setTimeout(pollState, 800);
    }
    pollState();
  </script>
</body>
</html>`;
  }
}


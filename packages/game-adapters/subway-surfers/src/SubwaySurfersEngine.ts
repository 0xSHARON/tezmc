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
  <meta name="viewport" content="width=1280, height=720, initial-scale=1.0">
  <title>Subway Surfers - 24/7 Autonomous AI Stream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: #090a0f;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      cursor: none !important;
    }
    #game-canvas {
      width: 1280px;
      height: 720px;
      display: block;
      background: #070913;
      cursor: none !important;
    }
  </style>
</head>
<body>
  <canvas id="game-canvas" width="1280" height="720"></canvas>

  <script>
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // Bulletproof polyfills for Chromium headless & software 2D context
    function safeRoundRect(c, x, y, w, h, r) {
      if (typeof r === 'undefined') r = 0;
      if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
      c.beginPath();
      c.moveTo(x + r.tl, y);
      c.lineTo(x + w - r.tr, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r.tr);
      c.lineTo(x + w, y + h - r.br);
      c.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
      c.lineTo(x + r.bl, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r.bl);
      c.lineTo(x, y + r.tl);
      c.quadraticCurveTo(x, y, x + r.tl, y);
      c.closePath();
    }

    function safeEllipse(c, x, y, rx, ry, rot, start, end) {
      rx = Math.max(0.1, Math.abs(rx));
      ry = Math.max(0.1, Math.abs(ry));
      if (c.ellipse) {
        try {
          c.ellipse(x, y, rx, ry, rot || 0, start || 0, end || Math.PI * 2);
          return;
        } catch (e) {}
      }
      c.save();
      c.translate(x, y);
      c.rotate(rot || 0);
      c.scale(rx, ry);
      c.arc(0, 0, 1, start || 0, end || Math.PI * 2);
      c.restore();
    }

    // Game state synchronized with backend
    let state = {
      score: 12400,
      coins: 84,
      distanceMeters: 450,
      speedKmh: 55,
      multiplier: 10,
      lane: 0,
      isJumping: false,
      jumpProgress: 0,
      isRolling: false,
      rollProgress: 0,
      hasHoverboard: false,
      isCrashed: false,
      runCount: 1,
      topScore: 50000
    };
    let obstacles = [];
    let coins = [];
    let lastAction = 'AUTONOMOUS RUNNER ACTIVE';

    // Local visual interpolation variables
    let runnerVisualLane = 0;
    let cameraShake = 0;
    let trackOffset = 0;
    let particles = [];
    let speedLines = [];

    // Horizon & perspective settings
    const HORIZON_Y = 280;
    const TRACK_BOTTOM_Y = 720;
    const LANE_WIDTH_BOTTOM = 260;
    const LANE_WIDTH_TOP = 40;

    // Fetch state from backend 20Hz
    async function syncBackendState() {
      try {
        const res = await fetch('/state');
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            if (!state.isCrashed && data.state.isCrashed) {
              cameraShake = 22; // collision impact shake
            }
            state = data.state;
          }
          if (Array.isArray(data.obstacles)) obstacles = data.obstacles;
          if (Array.isArray(data.coins)) coins = data.coins;
          if (data.lastAction) lastAction = data.lastAction;
        }
      } catch (e) {}
    }
    setInterval(syncBackendState, 60);

    // Perspective Projection Helper: 3D (lane: -1..1, y: height, z: distance 0..80) -> 2D Screen (sx, sy, scale)
    function project3D(lane, yOffset, zDist) {
      lane = Number(lane) || 0;
      yOffset = Number(yOffset) || 0;
      zDist = Number(zDist) || 0.2;
      if (zDist < 0.2) zDist = 0.2;
      const depth = Math.min(80, Math.max(0.5, zDist));
      const t = 1 - Math.min(1, depth / 70); // 0 (horizon) -> 1 (screen bottom)
      const persp = Math.pow(t, 2.2);

      const trackWidth = LANE_WIDTH_TOP + (LANE_WIDTH_BOTTOM - LANE_WIDTH_TOP) * persp;
      const sy = HORIZON_Y + (TRACK_BOTTOM_Y - HORIZON_Y) * persp - (yOffset * persp * 1.8);
      const sx = 640 + (lane * trackWidth * 1.08);
      const scale = Math.max(0.08, persp);

      return { sx, sy, scale };
    }

    // Spawn hoverboard exhaust particles
    function spawnParticles(x, y, count = 2) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 4,
          size: 3 + Math.random() * 4,
          life: 1.0,
          color: state.hasHoverboard ? '#00f0ff' : '#ff9900'
        });
      }
    }

    // Main 60FPS Render Loop
    let lastTime = performance.now();
    function render(now) {
      try {
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        // Smooth lane transition
        runnerVisualLane += ((state.lane || 0) - runnerVisualLane) * Math.min(1, dt * 14);

        // Camera shake decay
        if (cameraShake > 0) {
          cameraShake *= 0.88;
          if (cameraShake < 0.2) cameraShake = 0;
        }
        const shakeX = (Math.random() - 0.5) * cameraShake;
        const shakeY = (Math.random() - 0.5) * cameraShake;

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // 1. SKY & DISTANT CITYLINE
        const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
        skyGrad.addColorStop(0, '#060814');
        skyGrad.addColorStop(0.6, '#0f172a');
        skyGrad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, 1280, HORIZON_Y);

        // Distant skyscrapers silhouette
        ctx.fillStyle = '#0a0d1d';
        for (let i = 0; i < 28; i++) {
          const bx = i * 48;
          const bh = 40 + ((i * 37) % 90);
          ctx.fillRect(bx, HORIZON_Y - bh, 42, bh);
          // glowing windows
          if (i % 2 === 0) {
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(bx + 10, HORIZON_Y - bh + 15, 4, 6);
            ctx.fillRect(bx + 24, HORIZON_Y - bh + 30, 4, 6);
            ctx.fillStyle = '#0a0d1d';
          }
        }

        // Neon horizon glow line
        ctx.strokeStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, HORIZON_Y);
        ctx.lineTo(1280, HORIZON_Y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 2. SUBWAY GROUND & TRACKS
        const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, 720);
        groundGrad.addColorStop(0, '#111827');
        groundGrad.addColorStop(1, '#05070e');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, HORIZON_Y, 1280, 720 - HORIZON_Y);

        // Advance track sleepers (ties)
        trackOffset = (trackOffset + ((state.speedKmh || 50) * 0.45 * dt)) % 1.0;

        // Draw perspective ties
        ctx.lineWidth = 3;
        for (let z = 60; z >= 1; z -= 1.8) {
          const adjustedZ = z - (trackOffset * 1.8);
          if (adjustedZ < 1) continue;
          const pL = project3D(-1.5, 0, adjustedZ);
          const pR = project3D(1.5, 0, adjustedZ);

          ctx.strokeStyle = 'rgba(51, 65, 85, ' + Math.min(0.8, pL.scale * 1.2) + ')';
          ctx.beginPath();
          ctx.moveTo(pL.sx, pL.sy);
          ctx.lineTo(pR.sx, pR.sy);
          ctx.stroke();
        }

        // Draw Rails for 3 Lanes (Left, Center, Right)
        const lanes = [-1, 0, 1];
        for (const lane of lanes) {
          const pTopLeft = project3D(lane - 0.38, 0, 65);
          const pBotLeft = project3D(lane - 0.38, 0, 0.8);
          const pTopRight = project3D(lane + 0.38, 0, 65);
          const pBotRight = project3D(lane + 0.38, 0, 0.8);

          // Steel Rails
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(pTopLeft.sx, pTopLeft.sy);
          ctx.lineTo(pBotLeft.sx, pBotLeft.sy);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(pTopRight.sx, pTopRight.sy);
          ctx.lineTo(pBotRight.sx, pBotRight.sy);
          ctx.stroke();

          // Glowing center track neon ballast line
          ctx.strokeStyle = lane === 0 ? 'rgba(0, 240, 255, 0.25)' : 'rgba(234, 179, 8, 0.15)';
          ctx.lineWidth = 1;
          const pTopC = project3D(lane, 0, 65);
          const pBotC = project3D(lane, 0, 0.8);
          ctx.beginPath();
          ctx.moveTo(pTopC.sx, pTopC.sy);
          ctx.lineTo(pBotC.sx, pBotC.sy);
          ctx.stroke();
        }

        // 3. DRAW 3D OBSTACLES (Trains, Hurdles, Barriers)
        const renderItems = [];

        for (const obs of obstacles) {
          const z = Number(obs.zDistance !== undefined ? obs.zDistance : (obs.z !== undefined ? obs.z : 0));
          if (z > 0 && z < 65) {
            renderItems.push({ type: 'obs', data: obs, z: z });
          }
        }
        for (const coin of coins) {
          const z = Number(coin.zDistance !== undefined ? coin.zDistance : (coin.z !== undefined ? coin.z : 0));
          if (!coin.collected && z > 0 && z < 65) {
            renderItems.push({ type: 'coin', data: coin, z: z });
          }
        }

        renderItems.sort((a, b) => b.z - a.z);

        for (const item of renderItems) {
          if (item.type === 'obs') {
            const obs = item.data;
            const p = project3D(obs.lane, 0, item.z);

            if (obs.type === 'train') {
              // Draw 3D Passenger Subway Train
              const w = Math.max(4, 180 * p.scale);
              const h = Math.max(4, 220 * p.scale);
              const x = p.sx - w / 2;
              const y = p.sy - h;

              // Train Front
              const trainGrad = ctx.createLinearGradient(x, y, x + w, y + h);
              trainGrad.addColorStop(0, '#0284c7');
              trainGrad.addColorStop(0.5, '#0369a1');
              trainGrad.addColorStop(1, '#075985');
              ctx.fillStyle = trainGrad;
              ctx.fillRect(x, y, w, h);

              // Front Windshield
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(x + w * 0.15, y + h * 0.18, w * 0.7, h * 0.28);

              // Glowing Dual Headlights
              ctx.fillStyle = '#fef08a';
              ctx.shadowColor = '#facc15';
              ctx.shadowBlur = 15;
              ctx.beginPath();
              ctx.arc(x + w * 0.22, y + h * 0.75, Math.max(1, 8 * p.scale), 0, Math.PI * 2);
              ctx.arc(x + w * 0.78, y + h * 0.75, Math.max(1, 8 * p.scale), 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;

              // Warning Stripes
              ctx.fillStyle = '#eab308';
              ctx.fillRect(x + w * 0.1, y + h * 0.88, w * 0.8, Math.max(1, 6 * p.scale));
            } else if (obs.type === 'hurdle' || obs.type === 'low_barrier') {
              // Low Red/White Barrier (Jump Over)
              const w = Math.max(4, 150 * p.scale);
              const h = Math.max(4, 55 * p.scale);
              const x = p.sx - w / 2;
              const y = p.sy - h;

              ctx.fillStyle = '#ef4444';
              ctx.fillRect(x, y, w, h);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(x + w * 0.3, y, w * 0.4, h);

              // Support legs
              ctx.fillStyle = '#475569';
              ctx.fillRect(x + 5, y + h, Math.max(1, 8 * p.scale), Math.max(1, 15 * p.scale));
              ctx.fillRect(x + w - 13, y + h, Math.max(1, 8 * p.scale), Math.max(1, 15 * p.scale));
            } else {
              // High Caution Archway Barrier (Duck / Roll Under)
              const w = Math.max(4, 170 * p.scale);
              const h = Math.max(4, 160 * p.scale);
              const x = p.sx - w / 2;
              const y = p.sy - h;

              // Overhead bar
              ctx.fillStyle = '#eab308';
              ctx.fillRect(x, y, w, Math.max(2, 32 * p.scale));
              // Black diagonal stripes
              ctx.fillStyle = '#0f172a';
              const step = Math.max(4, 24 * p.scale);
              for (let s = 0; s < w; s += step) {
                ctx.fillRect(x + s, y, Math.max(1, 12 * p.scale), Math.max(2, 32 * p.scale));
              }
              // Tall side poles
              ctx.fillStyle = '#64748b';
              ctx.fillRect(x, y + 32 * p.scale, Math.max(1, 14 * p.scale), Math.max(1, h - 32 * p.scale));
              ctx.fillRect(x + w - 14 * p.scale, y + 32 * p.scale, Math.max(1, 14 * p.scale), Math.max(1, h - 32 * p.scale));
            }
          } else if (item.type === 'coin') {
            // Spinning 3D Gold Coin
            const coin = item.data;
            const p = project3D(coin.lane, 35, item.z);
            const spin = Math.cos(now * 0.007 + item.z);
            const r = Math.max(2, 22 * p.scale);

            ctx.save();
            ctx.translate(p.sx, p.sy);
            ctx.scale(spin, 1);

            ctx.fillStyle = '#eab308';
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ca8a04';
            ctx.font = 'bold ' + Math.max(8, Math.round(r * 0.9)) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);

            ctx.restore();
          }
        }

        // 4. DRAW RUNNER CHARACTER (Jake / Parkour Surfer)
        let jumpY = 0;
        if (state.isJumping) {
          jumpY = Math.sin((state.jumpProgress || 0) * Math.PI) * 170;
        }

        let rollScaleY = 1.0;
        let rollOffset = 0;
        if (state.isRolling) {
          rollScaleY = 0.45;
          rollOffset = 25;
        }

        const runnerPos = project3D(runnerVisualLane, jumpY, 1.8);
        const rx = runnerPos.sx || 640;
        const ry = (runnerPos.sy || 695) + rollOffset;
        const rScale = Math.max(0.1, (runnerPos.scale || 0.95) * 1.5);

        // Hoverboard Thruster & Glow
        if (state.hasHoverboard) {
          spawnParticles(rx, ry + 10, 3);

          ctx.save();
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 20;

          // Hoverboard deck
          ctx.fillStyle = '#00f0ff';
          ctx.beginPath();
          safeEllipse(ctx, rx, ry + 6, 60 * rScale, 14 * rScale, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          safeEllipse(ctx, rx, ry + 6, 42 * rScale, 7 * rScale, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Runner Body
        ctx.save();
        ctx.translate(rx, ry);
        ctx.scale(1, rollScaleY);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        safeEllipse(ctx, 0, 8, 38 * rScale, 12 * rScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // Running body bob
        const runBob = state.isJumping ? 0 : Math.sin(now * 0.02) * 5;

        // Legs / Denim Shorts
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(-14 * rScale, -40 * rScale + runBob, 11 * rScale, 36 * rScale);
        ctx.fillRect(3 * rScale, -40 * rScale - runBob, 11 * rScale, 36 * rScale);

        // Sneakers
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-16 * rScale, -6 * rScale + runBob, 14 * rScale, 10 * rScale);
        ctx.fillRect(2 * rScale, -6 * rScale - runBob, 14 * rScale, 10 * rScale);

        // Torso / Turquoise Hoodie
        const hoodieGrad = ctx.createLinearGradient(0, -90 * rScale, 0, -40 * rScale);
        hoodieGrad.addColorStop(0, '#06b6d4');
        hoodieGrad.addColorStop(1, '#0891b2');
        ctx.fillStyle = hoodieGrad;
        ctx.fillRect(-18 * rScale, -85 * rScale + runBob, 36 * rScale, 48 * rScale);

        // Head / Skin
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(0, -100 * rScale + runBob, 15 * rScale, 0, Math.PI * 2);
        ctx.fill();

        // Red Surfer Cap
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, -104 * rScale + runBob, 16 * rScale, Math.PI, Math.PI * 2);
        ctx.fill();
        // Cap visor pointing backward
        ctx.fillRect(-18 * rScale, -105 * rScale + runBob, 12 * rScale, 5 * rScale);

        ctx.restore();

        // 5. PARTICLES (Hoverboard exhaust / sparks)
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= dt * 2.2;
          p.size *= 0.94;

          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }

          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        // 6. SPEED LINES (at > 50 km/h)
        if ((state.speedKmh || 0) > 50 && Math.random() < 0.45) {
          speedLines.push({
            x: Math.random() < 0.5 ? Math.random() * 220 : 1060 + Math.random() * 220,
            y: Math.random() * 720,
            len: 40 + Math.random() * 80,
            speed: 800 + Math.random() * 600,
            life: 1.0
          });
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        for (let i = speedLines.length - 1; i >= 0; i--) {
          const sl = speedLines[i];
          sl.y += sl.speed * dt;
          sl.life -= dt * 3;
          if (sl.life <= 0 || sl.y > 720) {
            speedLines.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(sl.x, sl.y);
          ctx.lineTo(sl.x, sl.y + sl.len);
          ctx.stroke();
        }

        // 7. BROADCAST HUD OVERLAY
        // Top HUD Card
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        safeRoundRect(ctx, 30, 20, 1220, 70, 14);
        ctx.fill();
        ctx.stroke();

        // SCORE
        ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText('SCORE: ' + (state.score || 0).toLocaleString(), 55, 62);

        // MULTIPLIER BADGE
        ctx.fillStyle = '#eab308';
        safeRoundRect(ctx, 380, 36, 95, 34, 8);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((state.multiplier || 10) + 'X', 427, 60);

        // SPEEDOMETER
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText('⚡ ' + Math.round(state.speedKmh || 50) + ' KM/H', 540, 62);

        // DISTANCE
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(Math.round(state.distanceMeters || 0) + 'm', 710, 62);

        // COINS
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText('COINS: ' + (state.coins || 0), 820, 62);

        // LIVE BROADCAST PILL
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(1040, 54, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('LIVE 60FPS', 1056, 60);

        // Bottom Action Ticker
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        safeRoundRect(ctx, 30, 650, 1220, 48, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = '15px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText('[TEZMC AI] ' + (lastAction || 'RUNNER ACTIVE') + ' | CHAT: !jump, !roll, !left, !right, !hoverboard, !stats', 50, 680);

        ctx.restore();
      } catch (frameErr) {
        console.error('Frame render exception:', frameErr);
        try { ctx.restore(); } catch (e) {}
      } finally {
        requestAnimationFrame(render);
      }
    }

    requestAnimationFrame(render);
  </script>
</body>
</html>`;
  }
}


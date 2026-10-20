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
      if (req.url === '/state') {
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
      res.end(this.getCanvasHtml());
    });

    this.httpServer.listen(port, () => {
      this.emit('log', { level: 'info', message: `Subway Surfers 60FPS Visual Streamer listening on port ${port}` });
    });
  }

  private getCanvasHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TEZMC - Subway Surfers 24/7 Autonomous Stream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #050505; color: #fff; font-family: monospace; overflow: hidden; }
    canvas { display: block; width: 100vw; height: 100vh; background: #090a0f; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    let W, H;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    let serverState = {
      state: {
        score: 0, coins: 0, distanceMeters: 0, speedKmh: 45, multiplier: 10,
        lane: 0, isJumping: false, jumpProgress: 0, isRolling: false, rollProgress: 0,
        hasHoverboard: false, isCrashed: false, runCount: 1, topScore: 0
      },
      obstacles: [],
      coins: [],
      lastAction: 'INITIALIZING'
    };

    async function pollState() {
      try {
        const res = await fetch('/state');
        if (res.ok) serverState = await res.json();
      } catch (e) {}
      setTimeout(pollState, 100);
    }
    pollState();

    let currentVisualLane = 0;
    let trackOffset = 0;

    function render() {
      requestAnimationFrame(render);
      const s = serverState.state;

      // Smooth lane transition
      currentVisualLane += (s.lane - currentVisualLane) * 0.25;
      trackOffset += (s.speedKmh * 0.3);

      ctx.clearRect(0, 0, W, H);

      // Sky & Horizon
      const gradSky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      gradSky.addColorStop(0, '#0a0d1a');
      gradSky.addColorStop(1, '#1e293b');
      ctx.fillStyle = gradSky;
      ctx.fillRect(0, 0, W, H * 0.45);

      // Distant City Skyline
      ctx.fillStyle = '#0f172a';
      for (let x = 0; x < W; x += 60) {
        const bh = 40 + ((x * 13) % 80);
        ctx.fillRect(x, H * 0.45 - bh, 50, bh);
      }

      // Ground Ballast & Tracks (Vanishing Point 3D)
      const vpX = W * 0.5;
      const vpY = H * 0.45;

      const gradGround = ctx.createLinearGradient(0, vpY, 0, H);
      gradGround.addColorStop(0, '#1c1917');
      gradGround.addColorStop(1, '#0c0a09');
      ctx.fillStyle = gradGround;
      ctx.fillRect(0, vpY, W, H - vpY);

      // Draw 3 Railroad Tracks (Left, Center, Right)
      const trackBaseWidth = W * 0.85;
      const trackTopWidth = 60;

      function project(xLane, zMeters) {
        const scale = 30 / (zMeters + 25);
        const y = vpY + (H - vpY) * (1 - (25 / (zMeters + 25)));
        const x = vpX + (xLane * 180) * (scale * 2.2);
        return { x, y, scale };
      }

      // Railroad Sleepers (Ties)
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 4;
      for (let z = (trackOffset % 15); z < 120; z += 15) {
        const pL = project(-1.4, z);
        const pR = project(1.4, z);
        ctx.beginPath();
        ctx.moveTo(pL.x, pL.y);
        ctx.lineTo(pR.x, pR.y);
        ctx.stroke();
      }

      // Steel Rails (3 Tracks x 2 Rails each)
      const railLanes = [-1, 0, 1];
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 3;
      railLanes.forEach(lane => {
        const pFarL = project(lane - 0.28, 120);
        const pFarR = project(lane + 0.28, 120);
        const pNearL = project(lane - 0.28, 0);
        const pNearR = project(lane + 0.28, 0);

        ctx.beginPath();
        ctx.moveTo(pFarL.x, pFarL.y);
        ctx.lineTo(pNearL.x, pNearL.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pFarR.x, pFarR.y);
        ctx.lineTo(pNearR.x, pNearR.y);
        ctx.stroke();
      });

      // Overhead Wires
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      railLanes.forEach(lane => {
        const pF = project(lane, 120);
        const pN = project(lane, 0);
        ctx.beginPath();
        ctx.moveTo(pF.x, pF.y - 100);
        ctx.lineTo(pN.x, pN.y - 320);
        ctx.stroke();
      });

      // Draw Coins (Z sorted)
      (serverState.coins || []).forEach(c => {
        if (c.collected || c.zDistance < 0 || c.zDistance > 100) return;
        const p = project(c.lane, c.zDistance);
        const r = Math.max(3, 16 * p.scale);

        ctx.save();
        ctx.translate(p.x, p.y - 25 * p.scale);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      });

      // Draw Obstacles (Trains and Barriers)
      (serverState.obstacles || []).sort((a,b) => b.zDistance - a.zDistance).forEach(obs => {
        if (obs.zDistance < 0 || obs.zDistance > 110) return;
        const p = project(obs.lane, obs.zDistance);
        const w = Math.max(20, 110 * p.scale);

        if (obs.type === 'train') {
          const h = Math.max(35, 170 * p.scale);
          // Train Front
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(p.x - w/2, p.y - h, w, h);
          // Train Front Grille & Lights
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(p.x - w * 0.35, p.y - h * 0.3, w * 0.2, h * 0.15);
          ctx.fillRect(p.x + w * 0.15, p.y - h * 0.3, w * 0.2, h * 0.15);
          // Windshield
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(p.x - w * 0.4, p.y - h * 0.85, w * 0.8, h * 0.35);
        } else if (obs.type === 'low_barrier') {
          const h = Math.max(12, 50 * p.scale);
          ctx.fillStyle = '#ea580c';
          ctx.fillRect(p.x - w/2, p.y - h, w, h);
          // Stripes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(p.x - w * 0.2, p.y - h, w * 0.15, h);
        } else if (obs.type === 'high_barrier') {
          const h = Math.max(16, 60 * p.scale);
          const clearance = Math.max(15, 65 * p.scale);
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(p.x - w/2, p.y - h - clearance, w, h);
          ctx.fillStyle = '#38bdf8';
          ctx.font = \`\${Math.round(10 * p.scale)}px monospace\`;
          ctx.fillText('SUBWAY', p.x - w * 0.3, p.y - clearance - h * 0.3);
        }
      });

      // Draw Player Character (Jake)
      const playerPos = project(currentVisualLane, 0);
      let pY = playerPos.y;

      if (s.isJumping) {
        const jumpH = Math.sin(s.jumpProgress * Math.PI) * 140;
        pY -= jumpH;
      }

      // Shadow on ground
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(playerPos.x, playerPos.y, 25, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hoverboard if active
      if (s.hasHoverboard) {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(playerPos.x - 30, pY - 8, 60, 10);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(playerPos.x - 25, pY - 6, 50, 4);
      }

      if (s.isRolling) {
        // Rolling sphere
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(playerPos.x, pY - 20, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(playerPos.x - 12, pY - 22, 24, 8);
      } else {
        // Jake Running Body
        ctx.fillStyle = '#0284c7'; // Blue Jeans
        ctx.fillRect(playerPos.x - 12, pY - 35, 10, 30);
        ctx.fillRect(playerPos.x + 2, pY - 35, 10, 30);
        // Hoodie
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(playerPos.x - 16, pY - 65, 32, 32);
        // Cap & Head
        ctx.fillStyle = '#fed7aa';
        ctx.beginPath();
        ctx.arc(playerPos.x, pY - 75, 12, 0, Math.PI * 2);
        ctx.fill();
        // Red backwards Cap
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(playerPos.x - 14, pY - 88, 28, 12);
        ctx.fillRect(playerPos.x - 20, pY - 80, 10, 4);
      }

      // Cyber-Brutalist Live Stream HUD
      ctx.fillStyle = '#000000';
      ctx.fillRect(20, 20, 380, 95);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 380, 95);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('[TEZMC // SUBWAY SURFERS 24/7 LIVE]', 35, 45);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(\`SCORE: \${String(s.score).padStart(7, '0')}  [\${s.multiplier}X]\`, 35, 70);

      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(\`COINS: \${s.coins}   DIST: \${Math.round(s.distanceMeters)}M   \${Math.round(s.speedKmh)} KM/H\`, 35, 95);

      // Bottom Interaction Banner
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(20, H - 65, W - 40, 45);
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, H - 65, W - 40, 45);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '12px monospace';
      ctx.fillText('CHAT COMMANDS: !left  !right  !jump  !roll  !hoverboard', 40, H - 38);

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(\`STATUS: \${serverState.lastAction}\`, W * 0.52, H - 38);

      if (s.isCrashed) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.fillRect(W/2 - 200, H/2 - 50, 400, 100);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(W/2 - 200, H/2 - 50, 400, 100);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED! INSPECTOR CAUGHT JAKE', W/2, H/2 - 10);
        ctx.font = '12px monospace';
        ctx.fillText('AUTO-REVIVING IN 3 SECONDS FOR 24/7 STREAM...', W/2, H/2 + 20);
        ctx.textAlign = 'left';
      }
    }
    render();
  </script>
</body>
</html>`;
  }
}

import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import { ChromeDinoConfig } from '@autoplay/shared';
import { DinoState, Obstacle, ObstacleType, DinoCommandResult } from './types.js';

export class ChromeDinoEngine extends EventEmitter {
  private config: ChromeDinoConfig;
  private state: DinoState;
  private obstacles: Obstacle[] = [];
  private nextObstacleId = 1;
  private minObstacleDistance = 350;
  private lastObstacleX = 1280;

  // Physics & Dino properties (1280x720 canvas scale)
  private readonly groundY = 520;
  private readonly dinoX = 140;
  private dinoY = 520;
  private velocityY = 0;
  private readonly gravity = 0.75;
  private readonly jumpForce = -13.5;
  private isJumping = false;
  private isDucking = false;
  private dinoWidth = 60;
  private dinoHeight = 68;

  // Loop & Server
  private tickInterval: NodeJS.Timeout | null = null;
  private server: http.Server | null = null;
  private running = false;
  private runCount = 1;
  private jumpCounter = 0;
  private duckCounter = 0;
  private aiTick = 0;

  constructor(config: ChromeDinoConfig) {
    super();
    this.config = config;
    this.state = {
      status: 'PLAYING',
      score: 0,
      highScore: 12450,
      distance: 0,
      speed: 8.0,
      dinoY: this.groundY,
      isJumping: false,
      isDucking: false,
      jumpCount: 0,
      duckCount: 0,
      runCount: 1,
      nearestObstacleDistance: 9999,
      nearestObstacleType: 'NONE',
      aiMode: config.mode === 'chat_democracy' ? 'chat_democracy' : 'autonomous_ai',
      theme: config.theme
    };
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.resetGame(false);

    // 60 FPS Engine Tick (~16.6ms)
    this.tickInterval = setInterval(() => {
      this.tick();
    }, 1000 / 60);

    if (this.config.enableViewer) {
      await this.startHttpServer(this.config.viewerPort);
    }

    this.emit('log', {
      level: 'info',
      message: `Chrome Dinosaur Engine online (Port: ${this.config.viewerPort}, Mode: ${this.config.mode})`
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }
  }

  public pause(): void {
    this.state.status = 'PAUSED';
  }

  public resume(): void {
    this.state.status = 'PLAYING';
  }

  public getState(): DinoState {
    return { ...this.state };
  }

  public jump(sender = 'AI'): DinoCommandResult {
    if (this.state.status === 'CRASHED') {
      this.resetGame(true);
      return { success: true, message: 'Game Restarted via Jump', state: this.state };
    }
    if (!this.isJumping && this.dinoY >= this.groundY - 1) {
      this.isJumping = true;
      this.isDucking = false;
      this.velocityY = this.jumpForce;
      this.jumpCounter++;
      this.state.jumpCount = this.jumpCounter;
      this.state.isJumping = true;
      this.state.isDucking = false;
      return { success: true, message: `[${sender}] Jump executed`, state: this.state };
    }
    return { success: false, message: 'Already in mid-air', state: this.state };
  }

  public duck(sender = 'AI'): DinoCommandResult {
    if (this.state.status === 'PLAYING') {
      if (this.isJumping) {
        // Fast-drop if in air
        this.velocityY += 5.0;
      }
      this.isDucking = true;
      this.state.isDucking = true;
      this.dinoHeight = 44;
      this.duckCounter++;
      this.state.duckCount = this.duckCounter;
      return { success: true, message: `[${sender}] Ducking`, state: this.state };
    }
    return { success: false, message: 'Cannot duck in current state', state: this.state };
  }

  public unduck(): void {
    this.isDucking = false;
    this.state.isDucking = false;
    this.dinoHeight = 68;
  }

  public resetGame(incrementRun = true): void {
    if (incrementRun) {
      this.runCount++;
    }
    this.obstacles = [];
    this.lastObstacleX = 1280;
    this.dinoY = this.groundY;
    this.velocityY = 0;
    this.isJumping = false;
    this.isDucking = false;
    this.dinoHeight = 68;

    this.state.status = 'PLAYING';
    this.state.score = 0;
    this.state.distance = 0;
    this.state.speed = 8.0;
    this.state.runCount = this.runCount;
    this.state.isJumping = false;
    this.state.isDucking = false;
  }

  private tick(): void {
    if (this.state.status !== 'PLAYING') return;

    this.aiTick++;

    // 1. Update distance & score
    this.state.distance += this.state.speed * 0.1;
    this.state.score = Math.floor(this.state.distance * 1.2);
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
    }

    // Accelerate gradually
    if (this.state.speed < 24.0) {
      this.state.speed += 0.0015;
    }

    // 2. Physics update for Dino
    if (this.isJumping) {
      this.dinoY += this.velocityY;
      this.velocityY += this.gravity;
      if (this.dinoY >= this.groundY) {
        this.dinoY = this.groundY;
        this.isJumping = false;
        this.velocityY = 0;
        this.state.isJumping = false;
      }
    }
    this.state.dinoY = this.dinoY;

    // 3. Move and spawn obstacles
    for (const obs of this.obstacles) {
      obs.x -= this.state.speed;
      if (!obs.passed && obs.x + obs.width < this.dinoX) {
        obs.passed = true;
      }
    }

    // Filter off-screen obstacles
    this.obstacles = this.obstacles.filter((obs) => obs.x + obs.width > -50);

    // Spawn new obstacles
    const rightmostX = this.obstacles.length > 0 ? Math.max(...this.obstacles.map((o) => o.x)) : 0;
    if (rightmostX < 1280 + 200) {
      const minGap = Math.max(280, 260 + this.state.speed * 18);
      const gap = minGap + Math.random() * 220;
      const spawnX = Math.max(1280 + 100, rightmostX + gap);
      this.spawnObstacle(spawnX);
    }

    // 4. Find nearest upcoming obstacle
    let nearest: Obstacle | null = null;
    let nearestDist = 9999;
    for (const obs of this.obstacles) {
      const dist = obs.x - (this.dinoX + this.dinoWidth);
      if (dist >= -20 && dist < nearestDist) {
        nearestDist = dist;
        nearest = obs;
      }
    }

    this.state.nearestObstacleDistance = Math.round(nearestDist);
    this.state.nearestObstacleType = nearest ? nearest.type : 'NONE';

    // 5. Autonomous AI Reflex Agent
    if (this.state.aiMode === 'autonomous_ai' && nearest) {
      this.runAiReflex(nearest, nearestDist);
    }

    // 6. Collision Detection
    for (const obs of this.obstacles) {
      if (this.checkCollision(obs)) {
        this.handleCrash(obs);
        break;
      }
    }
  }

  private spawnObstacle(x: number): void {
    const types: ObstacleType[] = [
      'CACTUS_SMALL',
      'CACTUS_LARGE',
      'CACTUS_GROUP',
      'PTERODACTYL_LOW',
      'PTERODACTYL_MID',
      'PTERODACTYL_HIGH'
    ];

    // Pterodactyls only appear after score > 250
    let chosenType: ObstacleType;
    if (this.state.score > 250 && Math.random() < 0.4) {
      const pTypes: ObstacleType[] = ['PTERODACTYL_LOW', 'PTERODACTYL_MID', 'PTERODACTYL_HIGH'];
      chosenType = pTypes[Math.floor(Math.random() * pTypes.length)];
    } else {
      const cTypes: ObstacleType[] = ['CACTUS_SMALL', 'CACTUS_LARGE', 'CACTUS_GROUP'];
      chosenType = cTypes[Math.floor(Math.random() * cTypes.length)];
    }

    let width = 34;
    let height = 50;
    let y = this.groundY;

    switch (chosenType) {
      case 'CACTUS_SMALL':
        width = 30;
        height = 50;
        y = this.groundY + 18;
        break;
      case 'CACTUS_LARGE':
        width = 44;
        height = 70;
        y = this.groundY - 2;
        break;
      case 'CACTUS_GROUP':
        width = 75;
        height = 54;
        y = this.groundY + 14;
        break;
      case 'PTERODACTYL_LOW':
        width = 54;
        height = 42;
        y = this.groundY - 10; // Low flight: must jump over!
        break;
      case 'PTERODACTYL_MID':
        width = 54;
        height = 42;
        y = this.groundY - 45; // Mid flight: must duck under!
        break;
      case 'PTERODACTYL_HIGH':
        width = 54;
        height = 42;
        y = this.groundY - 95; // High flight: passes harmlessly overhead
        break;
    }

    this.obstacles.push({
      id: this.nextObstacleId++,
      type: chosenType,
      x,
      y,
      width,
      height,
      passed: false
    });
  }

  private runAiReflex(obs: Obstacle, dist: number): void {
    const jumpReactionDist = Math.max(60, this.state.speed * 12.5 + (obs.width > 50 ? 25 : 10));

    if (obs.type === 'PTERODACTYL_MID') {
      // Mid-flight pterodactyl: duck under it!
      if (dist < 180 && dist > -40) {
        this.duck('NeuralAI');
      } else if (dist <= -40 && this.isDucking) {
        this.unduck();
      }
    } else if (obs.type === 'PTERODACTYL_HIGH') {
      // Fly overhead safely without action
      if (this.isDucking) this.unduck();
    } else {
      // Ground obstacles (Cacti, Low Pterodactyl): initiate frame-perfect jump
      if (dist <= jumpReactionDist && dist > 10 && !this.isJumping) {
        if (this.isDucking) this.unduck();
        this.jump('NeuralAI');
      }
    }
  }

  private checkCollision(obs: Obstacle): boolean {
    const dinoRight = this.dinoX + this.dinoWidth - 8;
    const dinoLeft = this.dinoX + 8;
    const dinoTop = this.dinoY;
    const dinoBottom = this.dinoY + this.dinoHeight;

    const obsRight = obs.x + obs.width - 6;
    const obsLeft = obs.x + 6;
    const obsTop = obs.y;
    const obsBottom = obs.y + obs.height;

    const overlapX = dinoRight > obsLeft && dinoLeft < obsRight;
    const overlapY = dinoBottom > obsTop && dinoTop < obsBottom;

    return overlapX && overlapY;
  }

  private handleCrash(obs: Obstacle): void {
    this.state.status = 'CRASHED';
    this.emit('crash', {
      score: this.state.score,
      obstacle: obs.type,
      runCount: this.runCount
    });

    if (this.config.autoRestart) {
      setTimeout(() => {
        if (this.running && this.state.status === 'CRASHED') {
          this.resetGame(true);
          this.emit('respawn', { runCount: this.runCount });
        }
      }, 1200);
    }
  }

  private async startHttpServer(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '/';

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (url.includes('/state')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...this.state, obstacles: this.obstacles }));
          return;
        }

        if (req.method === 'POST' && url.includes('/action')) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const cmd = String(data.command || data.action || '').toLowerCase().trim();
              let result: DinoCommandResult = { success: false, message: 'Unknown command' };
              if (cmd === 'jump' || cmd === 'space' || cmd === 'up') {
                result = this.jump(data.sender || 'Viewer');
              } else if (cmd === 'duck' || cmd === 'down') {
                result = this.duck(data.sender || 'Viewer');
              } else if (cmd === 'restart') {
                this.resetGame(true);
                result = { success: true, message: 'Game Reset', state: this.state };
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Default: Full HTML5 Canvas Game Viewer
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getCanvasHtml());
      });

      this.server.listen(port, '0.0.0.0', () => {
        resolve();
      });
    });
  }

  public getCanvasHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TEZMC — Autonomous Chrome Dinosaur 24/7 Live</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #090a0f;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
    }
    #wrapper {
      position: relative;
      width: 1280px;
      height: 720px;
      background: #0d0f17;
      border: 3px solid #10b981;
      box-shadow: 0 0 40px rgba(16, 185, 129, 0.25);
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    #hud {
      position: absolute;
      top: 20px;
      left: 30px;
      right: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1.5px;
      pointer-events: none;
    }
    .hud-chip {
      background: rgba(13, 15, 23, 0.85);
      border: 2px solid #1e293b;
      padding: 8px 16px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .hud-chip.highlight {
      border-color: #10b981;
      color: #10b981;
      text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
    }
    #controls {
      position: absolute;
      bottom: 25px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 15px;
      z-index: 10;
    }
    .btn {
      background: #111827;
      border: 2px solid #374151;
      color: #f3f4f6;
      font-family: monospace;
      font-weight: 800;
      font-size: 14px;
      padding: 10px 24px;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.1s ease;
      text-transform: uppercase;
    }
    .btn:hover {
      background: #10b981;
      color: #090a0f;
      border-color: #10b981;
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.6);
    }
    .btn:active {
      transform: scale(0.96);
    }
    #watermark {
      position: absolute;
      bottom: 30px;
      right: 35px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div id="wrapper">
    <div id="hud">
      <div class="hud-chip highlight">
        <span>TEZMC CHROME DINO 24/7</span>
        <span style="font-size: 11px; background:#10b981; color:#000; padding:2px 6px; border-radius:3px;">AI AUTONOMOUS</span>
      </div>
      <div style="display: flex; gap: 12px;">
        <div class="hud-chip">SCORE: <span id="valScore" style="color:#10b981">00000</span></div>
        <div class="hud-chip">HI: <span id="valHi">00000</span></div>
        <div class="hud-chip">SPEED: <span id="valSpeed" style="color:#38bdf8">8.0</span></div>
      </div>
    </div>

    <canvas id="canvas" width="1280" height="720"></canvas>

    <div id="controls">
      <button class="btn" onclick="sendAction('jump')">JUMP [SPACE]</button>
      <button class="btn" onclick="sendAction('duck')">DUCK [DOWN]</button>
      <button class="btn" onclick="sendAction('restart')">RESTART</button>
    </div>

    <div id="watermark">POWERED BY TEZMC AI</div>
  </div>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let groundOffset = 0;
    let audioCtx = null;

    let state = {
      status: 'PLAYING',
      score: 0,
      highScore: 12450,
      speed: 8.0,
      dinoY: 520,
      isJumping: false,
      isDucking: false,
      obstacles: []
    };

    let clouds = [
      { x: 250, y: 120, speed: 0.7 },
      { x: 720, y: 160, speed: 1.0 },
      { x: 1150, y: 100, speed: 0.8 }
    ];

    let stars = [
      { x: 150, y: 90, size: 2 },
      { x: 380, y: 70, size: 3 },
      { x: 620, y: 120, size: 2 },
      { x: 890, y: 80, size: 2.5 },
      { x: 1050, y: 110, size: 2 }
    ];

    function playBeep(freq, duration, type = 'square') {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    }

    function getApiUrl(endpoint) {
      let base = window.location.pathname.replace(/\/+$/, '');
      return (base ? base : '') + '/' + endpoint;
    }

    let lastMilestone = 0;
    async function syncState() {
      try {
        const res = await fetch(getApiUrl('state'));
        if (res.ok) {
          const fresh = await res.json();
          if (fresh.score > 0 && Math.floor(fresh.score / 100) > lastMilestone) {
            lastMilestone = Math.floor(fresh.score / 100);
            playBeep(880, 0.15, 'square');
          }
          state = fresh;
          document.getElementById('valScore').textContent = String(state.score || 0).padStart(5, '0');
          document.getElementById('valHi').textContent = String(state.highScore || 0).padStart(5, '0');
          document.getElementById('valSpeed').textContent = Number(state.speed || 8).toFixed(1);
        }
      } catch (e) {}
    }
    setInterval(syncState, 100);

    function sendAction(action) {
      if (action === 'jump') playBeep(520, 0.1, 'square');
      fetch(getApiUrl('action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: action, sender: 'WebViewer' })
      }).then(() => syncState());
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        sendAction('jump');
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        sendAction('duck');
      }
    });

    // Draw authentic pixelated T-Rex
    function drawTrex(x, y, isJumping, isDucking, isCrashed, legToggle) {
      ctx.fillStyle = '#f8fafc';

      if (isCrashed) {
        // Crashed T-Rex
        ctx.fillRect(x + 12, y, 44, 68); // body
        ctx.fillRect(x + 24, y - 24, 38, 30); // head
        ctx.fillRect(x + 4, y + 16, 12, 28); // tail
        ctx.fillRect(x + 50, y + 20, 10, 8); // arm
        // Cross Eye (X)
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x + 44, y - 16, 6, 2);
        ctx.fillRect(x + 46, y - 18, 2, 6);
        ctx.fillStyle = '#f8fafc';
        // Fallen legs
        ctx.fillRect(x + 16, y + 68, 8, 8);
        ctx.fillRect(x + 36, y + 68, 8, 8);
        return;
      }

      if (isDucking) {
        // Authentic Ducking T-Rex
        ctx.fillRect(x, y + 26, 78, 38); // elongated back
        ctx.fillRect(x + 56, y + 18, 34, 24); // extended head
        ctx.fillRect(x - 8, y + 34, 12, 18); // tail
        ctx.fillRect(x + 64, y + 42, 12, 6); // low arm
        // Eye
        ctx.fillStyle = '#090a0f';
        ctx.fillRect(x + 76, y + 24, 5, 5);
        ctx.fillStyle = '#f8fafc';
        // Shuffling legs
        if (legToggle) {
          ctx.fillRect(x + 20, y + 64, 8, 10);
          ctx.fillRect(x + 42, y + 64, 8, 6);
        } else {
          ctx.fillRect(x + 20, y + 64, 8, 6);
          ctx.fillRect(x + 42, y + 64, 8, 10);
        }
        return;
      }

      // Standing / Running T-Rex (Authentic 1:1 Silhouette)
      ctx.fillRect(x + 12, y, 42, 68); // torso
      ctx.fillRect(x + 26, y - 24, 36, 28); // head & snout
      ctx.fillRect(x + 4, y + 14, 12, 28); // arched tail
      ctx.fillRect(x + 48, y + 18, 12, 8); // short arms
      // Eye & Mouth
      ctx.fillStyle = '#090a0f';
      ctx.fillRect(x + 48, y - 16, 5, 5); // eye
      ctx.fillRect(x + 42, y - 4, 20, 3); // mouth line
      ctx.fillStyle = '#f8fafc';

      // Legs
      if (isJumping) {
        ctx.fillRect(x + 18, y + 68, 8, 14);
        ctx.fillRect(x + 36, y + 68, 8, 10);
      } else if (legToggle) {
        // Frame 1: Left leg planted, right leg raised
        ctx.fillRect(x + 18, y + 68, 8, 18);
        ctx.fillRect(x + 36, y + 68, 8, 8);
      } else {
        // Frame 2: Left leg raised, right leg planted
        ctx.fillRect(x + 18, y + 68, 8, 8);
        ctx.fillRect(x + 36, y + 68, 8, 18);
      }
    }

    // Main 60 FPS Render Loop
    function draw() {
      // Day / Night Cycle Check (cycles every 700 score points)
      const score = state.score || 0;
      const isNight = Math.floor(score / 700) % 2 === 1;

      // Background
      ctx.fillStyle = isNight ? '#0b0f19' : '#090a0f';
      ctx.fillRect(0, 0, 1280, 720);

      // Night Mode Moon and Stars
      if (isNight) {
        ctx.fillStyle = '#e2e8f0';
        stars.forEach(s => {
          ctx.fillRect(s.x, s.y, s.size, s.size);
        });
        // Crescent Moon
        ctx.beginPath();
        ctx.arc(1080, 100, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0f19';
        ctx.beginPath();
        ctx.arc(1072, 94, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clouds
      ctx.fillStyle = isNight ? '#1e293b' : '#334155';
      clouds.forEach(c => {
        c.x -= c.speed;
        if (c.x < -120) c.x = 1350;
        ctx.fillRect(c.x, c.y, 84, 22);
        ctx.fillRect(c.x + 18, c.y - 12, 48, 14);
      });

      // Ground Line & Texture
      groundOffset = (groundOffset + (state.speed || 8)) % 40;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 588);
      ctx.lineTo(1280, 588);
      ctx.stroke();

      // Gravel dots
      ctx.fillStyle = '#065f46';
      for (let x = 0; x < 1280; x += 50) {
        let gx = (x - groundOffset + 1280) % 1280;
        ctx.fillRect(gx, 598, 10, 3);
        ctx.fillRect(gx + 20, 608, 14, 3);
        ctx.fillRect(gx + 38, 602, 6, 2);
      }

      // Draw Obstacles (Cacti & Flying Pterodactyls)
      if (state.obstacles && state.obstacles.length > 0) {
        state.obstacles.forEach(obs => {
          if (obs.type.startsWith('CACTUS')) {
            ctx.fillStyle = '#10b981';
            // Stem
            ctx.fillRect(obs.x + obs.width * 0.35, obs.y, obs.width * 0.3, obs.height);
            // Left Arm
            ctx.fillRect(obs.x, obs.y + obs.height * 0.28, obs.width * 0.35, obs.height * 0.18);
            ctx.fillRect(obs.x, obs.y + obs.height * 0.14, obs.width * 0.16, obs.height * 0.22);
            // Right Arm
            ctx.fillRect(obs.x + obs.width * 0.65, obs.y + obs.height * 0.38, obs.width * 0.35, obs.height * 0.18);
            ctx.fillRect(obs.x + obs.width * 0.84, obs.y + obs.height * 0.22, obs.width * 0.16, obs.height * 0.24);
          } else if (obs.type.startsWith('PTERODACTYL')) {
            // Soaring Pterodactyl
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(obs.x + 10, obs.y + 12, obs.width - 20, 16); // body
            ctx.fillRect(obs.x, obs.y + 14, 14, 10); // beak
            ctx.fillStyle = '#090a0f';
            ctx.fillRect(obs.x + 4, obs.y + 16, 3, 3); // eye
            ctx.fillStyle = '#38bdf8';
            const wingUp = Math.floor(Date.now() / 120) % 2 === 0;
            if (wingUp) {
              ctx.fillRect(obs.x + 16, obs.y - 12, 16, 24); // wing up
            } else {
              ctx.fillRect(obs.x + 16, obs.y + 18, 16, 22); // wing down
            }
          }
        });
      }

      // Draw Dinosaur
      const dx = 140;
      const dy = state.dinoY || 520;
      const legToggle = Math.floor(Date.now() / 80) % 2 === 0;
      drawTrex(dx, dy, state.isJumping, state.isDucking, state.status === 'CRASHED', legToggle);

      // Game Over Screen
      if (state.status === 'CRASHED') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
        ctx.font = '900 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', 640, 340);
        ctx.font = '700 20px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('AI RESTARTING RUN #' + ((state.runCount || 1) + 1) + '...', 640, 390);
      }

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  </script>
</body>
</html>`;
  }
}

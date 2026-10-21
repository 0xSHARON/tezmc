import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PokemonRedConfig } from '@autoplay/shared';
import { GameBoyButton, PokemonRedState, PokemonPartyMember } from './types.js';
import { PokemonRomManager } from './PokemonRomManager.js';

export class PokemonRedEngine extends EventEmitter {
  private config: PokemonRedConfig;
  private server: http.Server | null = null;
  private pyboyProcess: ChildProcess | null = null;
  private isRunning = false;
  private romBuffer: Buffer | null = null;
  private romPath: string = '';
  private romTitle: string = 'POKEMON RED';

  private state: PokemonRedState;
  private democracyTimer: NodeJS.Timeout | null = null;
  private aiLoopTimer: NodeJS.Timeout | null = null;
  private stateSyncTimer: NodeJS.Timeout | null = null;
  private lastChatActionTimestamp = Date.now();

  private maps = [
    'Pallet Town',
    "Oak's Pokémon Lab",
    'Route 1',
    'Viridian City',
    'Route 22 (Rival Battle)',
    'Route 2',
    'Viridian Forest',
    'Pewter City (Gym)',
    'Route 3',
    'Mt. Moon (B2F)',
    'Cerulean City'
  ];

  private badgeList = [
    'Boulder Badge',
    'Cascade Badge',
    'Thunder Badge',
    'Rainbow Badge',
    'Soul Badge',
    'Marsh Badge',
    'Volcano Badge',
    'Earth Badge'
  ];

  constructor(config: PokemonRedConfig) {
    super();
    this.config = config;

    const defaultParty: PokemonPartyMember[] = [
      {
        name: config.starterPokemon === 'squirtle' ? 'SQUIRTLE' : (config.starterPokemon === 'bulbasaur' ? 'BULBASAUR' : 'CHARMANDER'),
        level: 14,
        currentHp: 38,
        maxHp: 38,
        status: 'OK',
        spriteIndex: 1
      },
      {
        name: 'PIDGEY',
        level: 10,
        currentHp: 27,
        maxHp: 27,
        status: 'OK',
        spriteIndex: 2
      },
      {
        name: 'PIKACHU',
        level: 12,
        currentHp: 32,
        maxHp: 32,
        status: 'OK',
        spriteIndex: 3
      }
    ];

    this.state = {
      trainerName: config.playerTrainerName || 'RED',
      rivalName: config.rivalName || 'BLUE',
      currentMap: 'Pallet Town',
      badges: ['Boulder Badge'],
      party: defaultParty,
      money: 3240,
      pokedexOwned: 3,
      pokedexSeen: 12,
      stepCount: 420,
      mode: config.mode || 'anarchy',
      democracyVotes: {
        up: 0,
        down: 0,
        left: 0,
        right: 0,
        a: 0,
        b: 0,
        start: 0,
        select: 0
      },
      democracyCountdown: config.democracyVoteWindowSeconds || 15,
      recentCommands: [
        { id: '1', sender: 'Oak', command: 'A', timestamp: Date.now() - 4000 },
        { id: '2', sender: 'Red', command: 'UP', timestamp: Date.now() - 2500 },
        { id: '3', sender: 'Ash', command: 'RIGHT', timestamp: Date.now() - 1000 }
      ],
      lastAction: 'TRAINER EXPLORING PALLET TOWN',
      isBattle: false,
      battleEnemy: null,
      romLoaded: false,
      romTitle: 'POKEMON RED',
      fps: 60
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    // 1. Ensure ROM
    try {
      const romData = await PokemonRomManager.ensureRom(this.config.romPath, this.config.autoDownloadRom !== false);
      this.romBuffer = romData.buffer;
      this.romPath = romData.path;
      this.romTitle = romData.title;
      this.state.romLoaded = true;
      this.state.romTitle = romData.title;
      this.emit('log', {
        level: 'info',
        message: `Verified and loaded Pokemon Red ROM: ${romData.title} (${(romData.buffer.length / 1024).toFixed(0)} KB)`
      });
    } catch (err: any) {
      this.emit('log', {
        level: 'warn',
        message: `Failed to load ROM from network: ${err.message}. Running in simulated emulation mode.`
      });
    }

    // If start fresh requested, clear stale state files
    const startFresh = (process.env.START_FRESH || '1').toLowerCase() !== '0';
    if (startFresh && this.romPath) {
      const stateFile = this.romPath.replace(/\.gb$/, '.state');
      if (fs.existsSync(stateFile)) {
        try {
          fs.unlinkSync(stateFile);
          this.emit('log', { level: 'info', message: `START_FRESH: Cleaned stale state ${stateFile}` });
        } catch {}
      }
    }

    // 2. Start PyBoy Runner
    this.startPyBoyRunner();

    // 3. Start HTTP Broadcast Studio Server
    await this.startHttpServer(this.config.viewerPort || 3009);

    // 4. Start Democracy Tick
    this.startDemocracyLoop();

    // 5. Start Autonomous Co-Pilot Loop (fills in when chat is quiet)
    this.startAutonomousCoPilot();

    // 6. Start State Synchronization Loop with PyBoy Emulation Core
    this.startStateSyncLoop();

    this.isRunning = true;
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pyboyProcess) {
      try {
        this.pyboyProcess.kill('SIGTERM');
      } catch {}
      this.pyboyProcess = null;
    }
    if (this.democracyTimer) {
      clearInterval(this.democracyTimer);
      this.democracyTimer = null;
    }
    if (this.aiLoopTimer) {
      clearInterval(this.aiLoopTimer);
      this.aiLoopTimer = null;
    }
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
      this.stateSyncTimer = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }
  }

  private startPyBoyRunner(): void {
    try {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const candidates = [
        path.join(__dirname, 'pyboy_runner.py'),
        path.join(process.cwd(), 'packages', 'game-adapters', 'pokemon-red', 'src', 'pyboy_runner.py'),
        '/app/packages/game-adapters/pokemon-red/src/pyboy_runner.py'
      ];
      const runnerScript = candidates.find(c => fs.existsSync(c));
      const romPath = this.romPath || PokemonRomManager.getDefaultRomPath();

      if (!runnerScript || !fs.existsSync(romPath)) {
        this.emit('log', { level: 'warn', message: `PyBoy runner or ROM not found. Runner: ${runnerScript}, ROM: ${romPath}` });
        return;
      }

      const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
      this.emit('log', { level: 'info', message: `Launching PyBoy runner: ${pythonBin} ${runnerScript} ${romPath}` });

      this.pyboyProcess = spawn(pythonBin, [runnerScript, romPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYBOY_PORT: '3010' }
      });

      this.pyboyProcess.stdout?.on('data', (d) => {
        const text = d.toString().trim();
        if (text) this.emit('log', { level: 'info', message: `[PyBoy] ${text}` });
      });

      this.pyboyProcess.stderr?.on('data', (d) => {
        const text = d.toString().trim();
        if (text && !text.includes('UserWarning')) {
          this.emit('log', { level: 'debug', message: `[PyBoy] ${text}` });
        }
      });
    } catch (err: any) {
      this.emit('log', { level: 'warn', message: `Failed to spawn PyBoy: ${err.message}` });
    }
  }

  private forwardActionToPyBoy(action: string, sender: string): void {
    const postData = JSON.stringify({ action, sender });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3010,
      path: '/action',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 500
    }, (res) => {
      res.resume();
    });
    req.on('error', () => {});
    req.write(postData);
    req.end();
  }

  public getState(): PokemonRedState {
    return { ...this.state };
  }

  public executeAction(button: GameBoyButton, sender = 'Chat'): { success: boolean; message: string } {
    this.lastChatActionTimestamp = Date.now();
    const btn = button.toLowerCase() as GameBoyButton;
    this.forwardActionToPyBoy(btn, sender);

    if (this.state.mode === 'democracy') {
      this.state.democracyVotes[btn] = (this.state.democracyVotes[btn] || 0) + 1;
      this.recordCommand(sender, btn.toUpperCase());
      return {
        success: true,
        message: `Voted for [${btn.toUpperCase()}] in Democracy mode (${this.state.democracyVotes[btn]} votes)!`
      };
    }

    // Anarchy mode: Instant execution
    this.recordCommand(sender, btn.toUpperCase());
    this.applyButtonInput(btn, sender);
    return {
      success: true,
      message: `[${sender}] pressed [${btn.toUpperCase()}]!`
    };
  }

  public setMode(mode: 'anarchy' | 'democracy', sender = 'Chat'): { success: boolean; message: string } {
    this.state.mode = mode;
    this.state.lastAction = `STREAM MODE SWITCHED TO ${mode.toUpperCase()} BY ${sender.toUpperCase()}`;
    this.emit('log', {
      level: 'info',
      message: `Pokemon Red stream mode changed to: ${mode}`
    });
    return {
      success: true,
      message: `Stream mode set to ${mode.toUpperCase()}!`
    };
  }

  private recordCommand(sender: string, command: string): void {
    this.state.recentCommands.unshift({
      id: Math.random().toString(36).substring(2, 9),
      sender,
      command,
      timestamp: Date.now()
    });
    if (this.state.recentCommands.length > 8) {
      this.state.recentCommands.pop();
    }
  }

  private applyButtonInput(btn: GameBoyButton, sender: string): void {
    this.state.stepCount += 1;
    this.state.lastAction = `[${sender.toUpperCase()}] PRESSED [${btn.toUpperCase()}]`;

    // When PyBoy runner is active, real Game Boy emulation controls all state (no synthetic overrides)
    if (this.pyboyProcess) {
      return;
    }

    // Fallback simulation only when running offline without ROM/PyBoy
    if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
      if (Math.random() < 0.12 && !this.state.isBattle) {
        this.state.isBattle = true;
        const enemies = [
          { name: 'RATTATA', level: 3, hpPercent: 100 },
          { name: 'PIDGEY', level: 4, hpPercent: 100 }
        ];
        this.state.battleEnemy = enemies[Math.floor(Math.random() * enemies.length)];
        this.state.lastAction = `WILD ${this.state.battleEnemy.name} APPEARED!`;
      }
    }
  }

  private startStateSyncLoop(): void {
    const port = process.env.PYBOY_PORT || '3010';
    this.stateSyncTimer = setInterval(() => {
      if (!this.isRunning) return;
      const req = http.request({
        hostname: '127.0.0.1',
        port: Number(port),
        path: '/state',
        method: 'GET',
        timeout: 800
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
              this.state = {
                ...this.state,
                ...data
              };
            }
          } catch {}
        });
      });
      req.on('error', () => {});
      req.end();
    }, 1000);
  }

  private startDemocracyLoop(): void {
    this.democracyTimer = setInterval(() => {
      if (this.state.mode !== 'democracy') return;

      this.state.democracyCountdown -= 1;
      if (this.state.democracyCountdown <= 0) {
        this.state.democracyCountdown = this.config.democracyVoteWindowSeconds || 15;

        // Tally votes
        let maxVotes = -1;
        let winningBtn: GameBoyButton = 'a';
        for (const [btn, count] of Object.entries(this.state.democracyVotes)) {
          if (count > maxVotes) {
            maxVotes = count;
            winningBtn = btn as GameBoyButton;
          }
        }

        if (maxVotes > 0) {
          this.applyButtonInput(winningBtn, `Democracy (${maxVotes} votes)`);
        } else {
          // Default autonomous progression if 0 votes
          const fallbackBtns: GameBoyButton[] = ['a', 'up', 'down', 'left', 'right'];
          const fb = fallbackBtns[Math.floor(Math.random() * fallbackBtns.length)];
          this.applyButtonInput(fb, 'Democracy (Auto)');
        }

        // Reset vote pool
        this.state.democracyVotes = {
          up: 0, down: 0, left: 0, right: 0, a: 0, b: 0, start: 0, select: 0
        };
      }
    }, 1000);
  }

  private startAutonomousCoPilot(): void {
    // If chat is inactive for 6 seconds, auto-pilot inputs
    this.aiLoopTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastChatActionTimestamp;
      if (idleTime > 6000) {
        const buttons: GameBoyButton[] = this.state.isBattle
          ? ['a', 'a', 'a', 'down', 'a']
          : ['up', 'down', 'left', 'right', 'a', 'a', 'b'];
        const autoBtn = buttons[Math.floor(Math.random() * buttons.length)];
        this.applyButtonInput(autoBtn, 'AI Co-Pilot');
      }
    }, 1800);
  }

  private startHttpServer(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        let rawUrl = req.url || '/';
        if (rawUrl.startsWith('/pokemon/')) {
          rawUrl = rawUrl.substring('/pokemon'.length);
        } else if (rawUrl === '/pokemon') {
          rawUrl = '/';
        }
        const pathname = rawUrl.split('?')[0];

        if (pathname === '/screen' || pathname === '/screen.jpg' || pathname.startsWith('/screen')) {
          const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: 3010,
            path: '/screen',
            method: 'GET',
            timeout: 1000
          }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, {
              'Content-Type': 'image/jpeg',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            proxyRes.pipe(res);
          });
          proxyReq.on('error', () => {
            res.writeHead(503);
            res.end();
          });
          proxyReq.end();
          return;
        }

        if (pathname === '/stream' || pathname.startsWith('/stream')) {
          const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: 3010,
            path: '/stream',
            method: 'GET'
          }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, {
              'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            proxyRes.pipe(res);
          });
          proxyReq.on('error', () => {
            res.writeHead(503);
            res.end();
          });
          proxyReq.end();
          return;
        }

        if (pathname === '/state' || pathname.startsWith('/state')) {
          // Attempt to pull latest RAM telemetry from PyBoy
          const stateReq = http.request({
            hostname: '127.0.0.1',
            port: 3010,
            path: '/state',
            method: 'GET',
            timeout: 500
          }, (stateRes) => {
            let data = '';
            stateRes.on('data', chunk => data += chunk);
            stateRes.on('end', () => {
              try {
                const pyboyState = JSON.parse(data);
                this.state = { ...this.state, ...pyboyState };
              } catch {}
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify(this.state));
            });
          });
          stateReq.on('error', () => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(this.state));
          });
          stateReq.end();
          return;
        }

        if (pathname === '/rom' && this.romBuffer) {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': this.romBuffer.length,
            'Access-Control-Allow-Origin': '*'
          });
          res.end(this.romBuffer);
          return;
        }

        if (pathname === '/action' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const actionName = data.action || data.command;
              if (actionName) {
                const result = this.executeAction(actionName, data.sender || 'Web');
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify(result));
                return;
              }
            } catch {}
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid action payload' }));
          });
          return;
        }

        if (pathname === '/reset' && req.method === 'POST') {
          const resetReq = http.request({
            hostname: '127.0.0.1',
            port: 3010,
            path: '/reset',
            method: 'POST',
            timeout: 5000
          }, (resetRes) => {
            let data = '';
            resetRes.on('data', chunk => data += chunk);
            resetRes.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(data || JSON.stringify({ success: true, message: 'Game reset to beginning' }));
            });
          });
          resetReq.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
          resetReq.end();
          return;
        }

        // Default: Brutalism Pure Gameplay Stream Interface
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getBroadcastStudioHtml());
      });

      this.server.listen(port, '0.0.0.0', () => {
        this.emit('log', {
          level: 'info',
          message: `Pokemon Red Brutalist Gameplay Stream listening on http://0.0.0.0:${port}`
        });
        resolve();
      });
    });
  }

  public getBroadcastStudioHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>POKÉMON RED // BRUTALIST STREAM TERMINAL</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      border-radius: 0 !important;
    }
    body {
      background-color: #050505;
      color: #f0f0f0;
      font-family: 'JetBrains Mono', 'Courier New', Consolas, monospace;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    header {
      background: #000;
      border: 3px solid #fff;
      padding: 12px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      box-shadow: 5px 5px 0px #fff;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-title {
      font-size: 1.25rem;
      font-weight: 900;
      letter-spacing: 1px;
      color: #fff;
    }
    .brand-badge {
      font-size: 0.75rem;
      background: #222;
      border: 1px solid #555;
      padding: 2px 8px;
      color: #00ff66;
    }
    .game-selector {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .selector-label {
      font-size: 0.8rem;
      font-weight: 900;
      color: #888;
      letter-spacing: 0.5px;
    }
    .btn-brutal {
      background: #000;
      color: #fff;
      border: 2px solid #fff;
      padding: 8px 14px;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 900;
      text-transform: uppercase;
      text-decoration: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 3px 3px 0px #fff;
      transition: all 0.05s ease;
    }
    .btn-brutal:hover {
      background: #1a1a1a;
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0px #fff;
    }
    .btn-brutal:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0px #fff;
    }
    .btn-brutal.active {
      background: #fff;
      color: #000;
      box-shadow: 3px 3px 0px #00ff66;
      border-color: #00ff66;
    }
    .btn-reset {
      border-color: #ff0055;
      color: #ff0055;
      box-shadow: 3px 3px 0px #ff0055;
    }
    .btn-reset:hover {
      background: #ff0055;
      color: #000;
      box-shadow: 4px 4px 0px #fff;
    }
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 16px;
      flex: 1;
    }
    @media (max-width: 960px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
    .stream-card {
      background: #000;
      border: 3px solid #fff;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 6px 6px 0px #fff;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #222;
      padding-bottom: 8px;
    }
    .channel-tag {
      font-size: 0.85rem;
      font-weight: 900;
      color: #aaa;
    }
    .tag-live {
      background: #00ff66;
      color: #000;
      font-weight: 900;
      padding: 3px 8px;
      font-size: 0.75rem;
      letter-spacing: 1px;
    }
    .tag-reconnecting {
      background: #ffcc00;
      color: #000;
      font-weight: 900;
      padding: 3px 8px;
      font-size: 0.75rem;
    }
    .screen-wrapper {
      background: #0a0a0a;
      border: 3px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      aspect-ratio: 160 / 144;
      max-height: 580px;
      margin: 0 auto;
      width: 100%;
      box-shadow: inset 0 0 30px rgba(0,0,0,0.9);
    }
    .screen-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      display: block;
    }
    .stream-info-bar {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #888;
      border-top: 2px solid #222;
      padding-top: 8px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .stat-box {
      background: #000;
      border: 3px solid #fff;
      padding: 14px;
      box-shadow: 5px 5px 0px #fff;
    }
    .stat-title {
      font-size: 0.85rem;
      font-weight: 900;
      border-bottom: 2px solid #fff;
      padding-bottom: 6px;
      margin-bottom: 10px;
      color: #00ff66;
      display: flex;
      justify-content: space-between;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
      margin-bottom: 6px;
      border-bottom: 1px dashed #222;
      padding-bottom: 4px;
    }
    .stat-label {
      color: #888;
      font-weight: bold;
    }
    .stat-val {
      color: #fff;
      font-weight: 900;
      text-align: right;
    }
    .hp-container {
      margin-top: 6px;
      border: 2px solid #fff;
      background: #111;
      height: 16px;
      width: 100%;
    }
    .hp-bar {
      height: 100%;
      background: #00ff66;
      width: 100%;
      transition: width 0.2s ease, background 0.2s ease;
    }
    .badge-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin-top: 6px;
    }
    .badge-chip {
      border: 1px solid #444;
      font-size: 0.65rem;
      text-align: center;
      padding: 3px 2px;
      color: #666;
      background: #0a0a0a;
    }
    .badge-chip.earned {
      border-color: #00ff66;
      color: #00ff66;
      font-weight: 900;
      background: #002200;
    }
    .controls-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      max-width: 220px;
      margin: 10px auto;
    }
    .btn-pad {
      background: #111;
      color: #fff;
      border: 2px solid #fff;
      padding: 10px;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0px #fff;
      transition: all 0.05s ease;
    }
    .btn-pad:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0px #fff;
      background: #fff;
      color: #000;
    }
    .action-btns {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 10px;
    }
    .kbd-hint {
      font-size: 0.7rem;
      color: #666;
      text-align: center;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="brand-title">TEZMC // STREAM_TERMINAL</span>
      <span class="brand-badge">[CORE: PYBOY_DMG01]</span>
    </div>
    <div class="game-selector">
      <span class="selector-label">SELECT STREAM:</span>
      <a href="./" class="btn-brutal active">[► POKÉMON RED]</a>
      <a href="/subway/" class="btn-brutal">[► SUBWAY SURFERS]</a>
      <button id="btn-reset" class="btn-brutal btn-reset" title="Restart emulation from beginning">[↺ PLAY FROM START]</button>
    </div>
  </header>

  <main class="main-grid">
    <section class="stream-card">
      <div class="card-header">
        <span class="channel-tag">[FEED: 0x01_AUTHENTIC_GAMEPLAY_RAW]</span>
        <span id="live-indicator" class="tag-live">● STREAM LIVE</span>
      </div>
      <div class="screen-wrapper">
        <img id="game-stream" src="./stream" alt="GAMEPLAY FEED" />
      </div>
      <div class="stream-info-bar">
        <span>RESOLUTION: 160x144 (PIXEL-PERFECT)</span>
        <span id="meta-coords">POS: (0, 0)</span>
        <span id="meta-fps">FEED: 60 FPS</span>
      </div>
    </section>

    <aside class="sidebar">
      <!-- Trainer & Objective -->
      <div class="stat-box">
        <div class="stat-title">
          <span>TRAINER TELEMETRY</span>
          <span id="val-mode" style="color: #fff;">[ANARCHY]</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">TRAINER:</span>
          <span id="val-trainer" class="stat-val">RED</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">MONEY:</span>
          <span id="val-money" class="stat-val">¥3,000</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">POKÉDEX:</span>
          <span id="val-pokedex" class="stat-val">1 OWNED / 3 SEEN</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">STEPS:</span>
          <span id="val-steps" class="stat-val">0</span>
        </div>
        <div class="stat-row" style="flex-direction: column; gap: 4px;">
          <span class="stat-label">CURRENT OBJECTIVE:</span>
          <span id="val-obj" class="stat-val" style="color: #ffcc00; text-align: left; font-size: 0.78rem;">Explore Kanto & Defeat Gym Leaders</span>
        </div>
      </div>

      <!-- Party Pokemon -->
      <div class="stat-box">
        <div class="stat-title">
          <span>PARTY & COMBAT</span>
          <span id="val-badges-count" style="color: #fff;">0 / 8 BADGES</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">LEAD POKÉMON:</span>
          <span id="val-pkmn" class="stat-val">CHARMANDER Lv. 5</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">PARTY HP:</span>
          <span id="val-hp" class="stat-val">20 / 20</span>
        </div>
        <div class="hp-container">
          <div id="hp-bar" class="hp-bar"></div>
        </div>
        <div class="badge-grid">
          <div id="badge-0" class="badge-chip">BOULDER</div>
          <div id="badge-1" class="badge-chip">CASCADE</div>
          <div id="badge-2" class="badge-chip">THUNDER</div>
          <div id="badge-3" class="badge-chip">RAINBOW</div>
          <div id="badge-4" class="badge-chip">SOUL</div>
          <div id="badge-5" class="badge-chip">MARSH</div>
          <div id="badge-6" class="badge-chip">VOLCANO</div>
          <div id="badge-7" class="badge-chip">EARTH</div>
        </div>
      </div>

      <!-- Location & Action -->
      <div class="stat-box">
        <div class="stat-title">
          <span>LOCATION & ACTION</span>
          <span id="val-battle" style="color: #888;">[OVERWORLD]</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">CURRENT MAP:</span>
          <span id="val-map" class="stat-val" style="color: #00ff66;">Pallet Town</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">LAST ACTION:</span>
          <span id="val-action" class="stat-val" style="font-size: 0.75rem;">AI RUNNER ACTIVE</span>
        </div>
      </div>

      <!-- Manual Joypad Control -->
      <div class="stat-box">
        <div class="stat-title">
          <span>GAME BOY CONTROLLER</span>
        </div>
        <div class="controls-grid">
          <div></div>
          <button class="btn-pad" onclick="sendInput('up')">▲ UP</button>
          <div></div>
          <button class="btn-pad" onclick="sendInput('left')">◄ LEFT</button>
          <button class="btn-pad" onclick="sendInput('down')">▼ DOWN</button>
          <button class="btn-pad" onclick="sendInput('right')">► RIGHT</button>
        </div>
        <div class="action-btns">
          <button class="btn-pad" style="flex: 1;" onclick="sendInput('select')">SELECT</button>
          <button class="btn-pad" style="flex: 1;" onclick="sendInput('start')">START</button>
          <button class="btn-pad" style="flex: 1; border-color: #ff0055;" onclick="sendInput('b')">B</button>
          <button class="btn-pad" style="flex: 1; border-color: #00ff66;" onclick="sendInput('a')">A</button>
        </div>
        <div class="kbd-hint">KEYBOARD: ARROWS / WASD = MOVE | Z / J = A | X / K = B | ENTER = START | SHIFT = SELECT</div>
      </div>
    </aside>
  </main>

  <script>
    const streamImg = document.getElementById('game-stream');
    const liveIndicator = document.getElementById('live-indicator');
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
    const streamUrl = basePath + 'stream';

    streamImg.src = streamUrl;

    streamImg.onerror = () => {
      liveIndicator.textContent = '○ RECONNECTING';
      liveIndicator.className = 'tag-reconnecting';
      setTimeout(() => {
        streamImg.src = streamUrl + '?t=' + Date.now();
      }, 1500);
    };

    streamImg.onload = () => {
      liveIndicator.textContent = '● STREAM LIVE';
      liveIndicator.className = 'tag-live';
    };

    async function sendInput(action) {
      try {
        await fetch(basePath + 'action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, sender: 'Web' })
        });
      } catch (err) {
        console.warn('Action failed:', err);
      }
    }

    document.getElementById('btn-reset').addEventListener('click', async () => {
      if (!confirm('ARE YOU SURE? This will restart the game from the beginning (Title Screen).')) return;
      try {
        const res = await fetch(basePath + 'reset', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Game reset! Starting from title screen.');
        setTimeout(() => {
          streamImg.src = streamUrl + '?t=' + Date.now();
        }, 500);
      } catch (err) {
        alert('Reset failed: ' + err.message);
      }
    });

    // Keyboard bindings
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const keyMap = {
        'ArrowUp': 'up', 'KeyW': 'up', 'w': 'up',
        'ArrowDown': 'down', 'KeyS': 'down', 's': 'down',
        'ArrowLeft': 'left', 'KeyA': 'left', 'a': 'left',
        'ArrowRight': 'right', 'KeyD': 'right', 'd': 'right',
        'KeyZ': 'a', 'z': 'a', 'KeyJ': 'a', 'j': 'a',
        'KeyX': 'b', 'x': 'b', 'KeyK': 'b', 'k': 'b',
        'Enter': 'start', 'Space': 'start',
        'ShiftRight': 'select', 'ShiftLeft': 'select'
      };
      const act = keyMap[e.code] || keyMap[e.key];
      if (act) {
        e.preventDefault();
        sendInput(act);
      }
    });

    // Telemetry Sync
    async function syncState() {
      try {
        const res = await fetch(basePath + 'state');
        if (!res.ok) return;
        const s = await res.json();

        if (s.trainerName) document.getElementById('val-trainer').textContent = s.trainerName;
        if (s.money !== undefined) document.getElementById('val-money').textContent = '¥' + s.money.toLocaleString();
        if (s.pokedexOwned !== undefined) {
          document.getElementById('val-pokedex').textContent = s.pokedexOwned + ' OWNED / ' + (s.pokedexSeen || 0) + ' SEEN';
        }
        if (s.stepCount !== undefined) document.getElementById('val-steps').textContent = s.stepCount.toLocaleString();
        if (s.currentMap) document.getElementById('val-map').textContent = s.currentMap;
        if (s.coordinates) {
          document.getElementById('meta-coords').textContent = 'POS: (' + s.coordinates.x + ', ' + s.coordinates.y + ')';
        }
        if (s.currentObjective) document.getElementById('val-obj').textContent = s.currentObjective;
        if (s.lastAction) document.getElementById('val-action').textContent = s.lastAction;
        if (s.mode) document.getElementById('val-mode').textContent = '[' + s.mode.toUpperCase() + ']';

        if (s.party && s.party.length > 0) {
          const lead = s.party[0];
          document.getElementById('val-pkmn').textContent = lead.name + ' Lv. ' + lead.level;
          document.getElementById('val-hp').textContent = lead.currentHp + ' / ' + lead.maxHp;
          const ratio = Math.max(0, Math.min(1, lead.currentHp / (lead.maxHp || 1)));
          const hpBar = document.getElementById('hp-bar');
          hpBar.style.width = (ratio * 100) + '%';
          hpBar.style.background = ratio > 0.5 ? '#00ff66' : ratio > 0.2 ? '#ffcc00' : '#ff0055';
        }

        const badges = s.badges || [];
        document.getElementById('val-badges-count').textContent = badges.length + ' / 8 BADGES';
        for (let i = 0; i < 8; i++) {
          const el = document.getElementById('badge-' + i);
          if (el) {
            if (i < badges.length) el.classList.add('earned');
            else el.classList.remove('earned');
          }
        }

        const inBattle = s.inBattle || s.isBattle;
        const bEl = document.getElementById('val-battle');
        if (inBattle) {
          bEl.textContent = '[IN BATTLE]';
          bEl.style.color = '#ff0055';
        } else {
          bEl.textContent = '[OVERWORLD]';
          bEl.style.color = '#888';
        }
      } catch (err) {}
    }

    setInterval(syncState, 1000);
    syncState();
  </script>
</body>
</html>`;
  }
}

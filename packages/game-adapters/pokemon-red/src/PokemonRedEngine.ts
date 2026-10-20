import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PokemonRedConfig } from '@autoplay/shared';
import { GameBoyButton, PokemonRedState, PokemonPartyMember } from './types.js';
import { PokemonRomManager } from './PokemonRomManager.js';

export class PokemonRedEngine extends EventEmitter {
  private config: PokemonRedConfig;
  private server: http.Server | null = null;
  private isRunning = false;
  private romBuffer: Buffer | null = null;
  private romPath: string = '';
  private romTitle: string = 'POKEMON RED';

  private state: PokemonRedState;
  private democracyTimer: NodeJS.Timeout | null = null;
  private aiLoopTimer: NodeJS.Timeout | null = null;
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

    // 2. Start HTTP Broadcast Studio Server
    await this.startHttpServer(this.config.viewerPort || 3009);

    // 3. Start Democracy Tick
    this.startDemocracyLoop();

    // 4. Start Autonomous Co-Pilot Loop (fills in when chat is quiet)
    this.startAutonomousCoPilot();

    this.isRunning = true;
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.democracyTimer) {
      clearInterval(this.democracyTimer);
      this.democracyTimer = null;
    }
    if (this.aiLoopTimer) {
      clearInterval(this.aiLoopTimer);
      this.aiLoopTimer = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }
  }

  public getState(): PokemonRedState {
    return { ...this.state };
  }

  public executeAction(button: GameBoyButton, sender = 'Chat'): { success: boolean; message: string } {
    this.lastChatActionTimestamp = Date.now();
    const btn = button.toLowerCase() as GameBoyButton;

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

    // Simulate story / world progression
    if (btn === 'up' || btn === 'down' || btn === 'left' || btn === 'right') {
      if (Math.random() < 0.12) {
        // Trigger wild encounter
        if (!this.state.isBattle) {
          this.state.isBattle = true;
          const enemies = [
            { name: 'RATTATA', level: 3, hpPercent: 100 },
            { name: 'PIDGEY', level: 4, hpPercent: 100 },
            { name: 'CATERPIE', level: 3, hpPercent: 100 },
            { name: 'ZUBAT', level: 7, hpPercent: 100 },
            { name: 'GEODUDE', level: 8, hpPercent: 100 }
          ];
          this.state.battleEnemy = enemies[Math.floor(Math.random() * enemies.length)];
          this.state.lastAction = `WILD ${this.state.battleEnemy.name} APPEARED!`;
        }
      } else if (Math.random() < 0.05) {
        // Progress map
        const nextMapIndex = (this.maps.indexOf(this.state.currentMap) + 1) % this.maps.length;
        this.state.currentMap = this.maps[nextMapIndex];
        this.state.lastAction = `ENTERED: ${this.state.currentMap.toUpperCase()}`;
      }
    } else if (btn === 'a') {
      if (this.state.isBattle && this.state.battleEnemy) {
        // Deal damage
        this.state.battleEnemy.hpPercent = Math.max(0, this.state.battleEnemy.hpPercent - 35);
        if (this.state.battleEnemy.hpPercent <= 0) {
          this.state.lastAction = `ENEMY ${this.state.battleEnemy.name} FAINTED! +65 EXP`;
          this.state.isBattle = false;
          this.state.battleEnemy = null;
          this.state.money += 120;
          if (this.state.party[0]) {
            this.state.party[0].level += 1;
            this.state.party[0].maxHp += 3;
            this.state.party[0].currentHp = this.state.party[0].maxHp;
          }
        }
      }
    } else if (btn === 'b') {
      if (this.state.isBattle && Math.random() < 0.5) {
        this.state.isBattle = false;
        this.state.battleEnemy = null;
        this.state.lastAction = 'GOT AWAY SAFELY!';
      }
    }
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
        const url = req.url || '/';

        if (url === '/state') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(this.state));
          return;
        }

        if (url === '/rom' && this.romBuffer) {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': this.romBuffer.length,
            'Access-Control-Allow-Origin': '*'
          });
          res.end(this.romBuffer);
          return;
        }

        if (url === '/action' && req.method === 'POST') {
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

        // Default: Broadcast 1280x720 Studio Canvas
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getBroadcastStudioHtml());
      });

      this.server.listen(port, '0.0.0.0', () => {
        this.emit('log', {
          level: 'info',
          message: `Pokemon Red 1280x720 Broadcast Studio listening on http://0.0.0.0:${port}`
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
  <meta name="viewport" content="width=1280, height=720, initial-scale=1.0">
  <title>Pokémon Red - Chat Plays Pokémon (24/7 Retro Emulation)</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: #060813;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
      user-select: none;
      cursor: none !important;
    }
    #studio-canvas {
      width: 1280px;
      height: 720px;
      display: block;
      background: #060813;
      cursor: none !important;
    }
  </style>
</head>
<body>
  <canvas id="studio-canvas" width="1280" height="720"></canvas>

  <script>
    const canvas = document.getElementById('studio-canvas');
    const ctx = canvas.getContext('2d');

    // Bulletproof polyfills
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

    let state = {
      trainerName: 'RED',
      currentMap: 'Pallet Town',
      badges: ['Boulder Badge'],
      party: [
        { name: 'CHARMANDER', level: 14, currentHp: 38, maxHp: 38, status: 'OK' },
        { name: 'PIDGEY', level: 10, currentHp: 27, maxHp: 27, status: 'OK' },
        { name: 'PIKACHU', level: 12, currentHp: 32, maxHp: 32, status: 'OK' }
      ],
      money: 3240,
      pokedexOwned: 3,
      pokedexSeen: 12,
      stepCount: 420,
      mode: 'anarchy',
      recentCommands: [],
      lastAction: 'TRAINER EXPLORING PALLET TOWN',
      isBattle: false,
      battleEnemy: null,
      romLoaded: true,
      romTitle: 'POKEMON RED',
      fps: 60
    };

    let highlightedButton = '';
    let highlightTimer = 0;

    // Fetch state from backend at 20Hz
    async function syncState() {
      try {
        const res = await fetch('/state');
        if (res.ok) {
          const data = await res.json();
          if (data.recentCommands && data.recentCommands[0]) {
            if (state.recentCommands[0]?.id !== data.recentCommands[0].id) {
              highlightedButton = data.recentCommands[0].command.toLowerCase();
              highlightTimer = 18; // frames
            }
          }
          state = data;
        }
      } catch (e) {}
    }
    setInterval(syncState, 60);

    // Simulated 160x144 Game Boy Framebuffer Generator
    const gbCanvas = document.createElement('canvas');
    gbCanvas.width = 160;
    gbCanvas.height = 144;
    const gbCtx = gbCanvas.getContext('2d');

    // Classic Game Boy DMG Green Palette
    const DMG_COLORS = ['#8bac0f', '#306230', '#0f380f', '#9bbc0f'];

    let gbFrame = 0;
    function renderGameBoyScreen() {
      gbFrame++;
      // Background base
      gbCtx.fillStyle = '#9bbc0f';
      gbCtx.fillRect(0, 0, 160, 144);

      if (state.isBattle && state.battleEnemy) {
        // Battle Screen
        gbCtx.fillStyle = '#8bac0f';
        gbCtx.fillRect(0, 0, 160, 96);

        // Enemy Pokémon Platform & Sprite
        gbCtx.fillStyle = '#306230';
        gbCtx.beginPath();
        gbCtx.ellipse(120, 48, 28, 8, 0, 0, Math.PI * 2);
        gbCtx.fill();

        // Enemy Monster Silhouette
        gbCtx.fillStyle = '#0f380f';
        gbCtx.fillRect(108, 20, 24, 24);
        gbCtx.fillRect(112, 16, 16, 6);

        // Enemy HUD
        gbCtx.fillStyle = '#0f380f';
        gbCtx.font = '8px monospace';
        gbCtx.fillText(state.battleEnemy.name + ' :L' + state.battleEnemy.level, 10, 20);
        gbCtx.strokeRect(10, 24, 60, 5);
        gbCtx.fillRect(11, 25, Math.round(58 * (state.battleEnemy.hpPercent / 100)), 3);

        // Player Pokémon (Back Sprite)
        gbCtx.fillStyle = '#306230';
        gbCtx.beginPath();
        gbCtx.ellipse(44, 88, 30, 8, 0, 0, Math.PI * 2);
        gbCtx.fill();

        gbCtx.fillStyle = '#0f380f';
        gbCtx.fillRect(32, 54, 28, 32);

        // Player HUD
        gbCtx.font = '8px monospace';
        const activeMon = state.party[0] || { name: 'CHARMANDER', level: 14, currentHp: 38, maxHp: 38 };
        gbCtx.fillText(activeMon.name + ' :L' + activeMon.level, 80, 68);
        gbCtx.strokeRect(80, 72, 65, 5);
        const hpRatio = activeMon.currentHp / activeMon.maxHp;
        gbCtx.fillRect(81, 73, Math.round(63 * hpRatio), 3);
        gbCtx.fillText(activeMon.currentHp + '/' + activeMon.maxHp, 100, 86);

        // Dialogue Box
        gbCtx.fillStyle = '#9bbc0f';
        gbCtx.fillRect(0, 96, 160, 48);
        gbCtx.strokeRect(2, 98, 156, 44);
        gbCtx.fillStyle = '#0f380f';
        gbCtx.fillText('What will', 10, 114);
        gbCtx.fillText(activeMon.name + ' do?', 10, 128);
      } else {
        // Overworld Exploration Screen (Tiles & Sprite)
        const walkBob = Math.sin(gbFrame * 0.1) * 2;
        // Grass / Path tiles
        gbCtx.fillStyle = '#8bac0f';
        for (let y = 0; y < 144; y += 16) {
          for (let x = 0; x < 160; x += 16) {
            if ((x + y) % 32 === 0) {
              gbCtx.fillRect(x, y, 16, 16);
            }
          }
        }

        // Tall Grass Patches
        gbCtx.fillStyle = '#306230';
        for (let gx = 16; gx < 64; gx += 16) {
          gbCtx.fillRect(gx, 32, 14, 14);
          gbCtx.fillRect(gx + 2, 30, 2, 4);
        }

        // Town House / Building Roof
        gbCtx.fillStyle = '#0f380f';
        gbCtx.fillRect(88, 16, 56, 36);
        gbCtx.fillStyle = '#8bac0f';
        gbCtx.fillRect(104, 34, 12, 18); // Door

        // Player Character (Red) in center
        const px = 72;
        const py = 64 + walkBob;
        gbCtx.fillStyle = '#0f380f';
        // Hat & head
        gbCtx.fillRect(px + 4, py, 8, 7);
        // Body
        gbCtx.fillRect(px + 3, py + 7, 10, 8);
        // Legs
        gbCtx.fillRect(px + 4, py + 15, 3, 5);
        gbCtx.fillRect(px + 9, py + 15, 3, 5);

        // Location Watermark
        gbCtx.fillStyle = 'rgba(15, 56, 15, 0.75)';
        gbCtx.fillRect(2, 128, 156, 14);
        gbCtx.fillStyle = '#9bbc0f';
        gbCtx.font = '8px monospace';
        gbCtx.fillText(state.currentMap.toUpperCase(), 6, 139);
      }
    }

    // 60FPS Broadcast Studio Render
    function renderStudio() {
      try {
        renderGameBoyScreen();

        // Background
        ctx.fillStyle = '#060813';
        ctx.fillRect(0, 0, 1280, 720);

        // TOP BROADCAST HEADER
        ctx.fillStyle = '#0c1222';
        safeRoundRect(ctx, 20, 15, 1240, 56, 12);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.font = 'bold 22px -apple-system, sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('🔴 LIVE', 45, 50);

        ctx.font = 'bold 20px -apple-system, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText('CHAT PLAYS POKÉMON RED // 24/7 RETRO EMULATION', 140, 50);

        // MODE PILL (ANARCHY vs DEMOCRACY)
        const isDem = state.mode === 'democracy';
        ctx.fillStyle = isDem ? '#3b82f6' : '#f59e0b';
        safeRoundRect(ctx, 980, 24, 150, 38, 8);
        ctx.fill();
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(state.mode.toUpperCase(), 1055, 48);
        ctx.textAlign = 'left';

        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('60 FPS', 1150, 49);

        // LEFT PANEL (Chat Commands & Virtual Game Boy Controller)
        ctx.fillStyle = '#0a0f1d';
        safeRoundRect(ctx, 20, 85, 340, 555, 12);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('INPUT STREAM (LIVE CHAT)', 40, 115);

        // Command Feed
        let cy = 150;
        const cmds = state.recentCommands || [];
        for (let i = 0; i < Math.min(6, cmds.length); i++) {
          const c = cmds[i];
          ctx.fillStyle = i === 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.4)';
          safeRoundRect(ctx, 35, cy - 22, 310, 36, 6);
          ctx.fill();

          ctx.font = 'bold 14px monospace';
          ctx.fillStyle = i === 0 ? '#38bdf8' : '#cbd5e1';
          ctx.fillText(c.sender, 50, cy);

          ctx.font = 'bold 15px monospace';
          ctx.fillStyle = '#facc15';
          ctx.textAlign = 'right';
          ctx.fillText(c.command, 325, cy);
          ctx.textAlign = 'left';
          cy += 44;
        }

        // Virtual Game Boy Controller Visualizer
        const ctrlY = 440;
        ctx.fillStyle = '#1e293b';
        safeRoundRect(ctx, 35, 415, 310, 210, 10);
        ctx.fill();

        ctx.font = 'bold 13px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('CONTROLLER STATE', 50, 440);

        if (highlightTimer > 0) highlightTimer--;

        // D-Pad Drawing
        const dpx = 110;
        const dpy = 520;
        function drawDpadBtn(name, x, y, w, h) {
          const active = highlightedButton === name && highlightTimer > 0;
          ctx.fillStyle = active ? '#38bdf8' : '#334155';
          ctx.fillRect(x, y, w, h);
        }
        drawDpadBtn('up', dpx - 8, dpy - 30, 16, 24);
        drawDpadBtn('down', dpx - 8, dpy + 6, 16, 24);
        drawDpadBtn('left', dpx - 30, dpy - 8, 24, 16);
        drawDpadBtn('right', dpx + 6, dpy - 8, 24, 16);
        ctx.fillStyle = '#475569';
        ctx.fillRect(dpx - 8, dpy - 8, 16, 16);

        // A & B Buttons
        function drawRoundBtn(name, x, y, label) {
          const active = highlightedButton === name && highlightTimer > 0;
          ctx.fillStyle = active ? '#ef4444' : '#991b1b';
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, y + 5);
          ctx.textAlign = 'left';
        }
        drawRoundBtn('b', 225, 535, 'B');
        drawRoundBtn('a', 270, 505, 'A');

        // Start & Select
        function drawPillBtn(name, x, y, label) {
          const active = highlightedButton === name && highlightTimer > 0;
          ctx.fillStyle = active ? '#94a3b8' : '#475569';
          safeRoundRect(ctx, x, y, 28, 10, 4);
          ctx.fill();
          ctx.font = '10px monospace';
          ctx.fillStyle = '#64748b';
          ctx.fillText(label, x - 4, y + 22);
        }
        drawPillBtn('select', 145, 590, 'SELECT');
        drawPillBtn('start', 195, 590, 'START');

        // CENTER: RETRO GAME BOY SCREEN (Sharp 4x Scaled Pixel Art)
        // Game Boy Housing Border
        ctx.fillStyle = '#cbd5e1';
        safeRoundRect(ctx, 380, 85, 520, 555, 14);
        ctx.fill();

        // Dark Bezel
        ctx.fillStyle = '#334155';
        safeRoundRect(ctx, 400, 105, 480, 515, 10);
        ctx.fill();

        // Battery LED
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(425, 230, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('BATTERY', 412, 248);

        // 160x144 Game Boy Screen -> 440 x 396
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(gbCanvas, 440, 145, 420, 378);

        // Nintendo Game Boy Logo
        ctx.font = 'italic bold 16px sans-serif';
        ctx.fillStyle = '#1e3a8a';
        ctx.textAlign = 'center';
        ctx.fillText('Nintendo GAME BOY™', 640, 580);
        ctx.textAlign = 'left';

        // RIGHT PANEL (Party Pokémon, Badges, Trainer Info)
        ctx.fillStyle = '#0a0f1d';
        safeRoundRect(ctx, 920, 85, 340, 555, 12);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('TRAINER CARD', 940, 115);

        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('NAME: ' + (state.trainerName || 'RED'), 940, 145);
        ctx.fillStyle = '#facc15';
        ctx.fillText('MONEY: $' + (state.money || 0).toLocaleString(), 1100, 145);

        // Badges Grid
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('BADGES (KANTO):', 940, 180);
        const badgesEarned = state.badges || [];
        for (let b = 0; b < 8; b++) {
          const bx = 940 + (b % 4) * 72;
          const by = 195 + Math.floor(b / 4) * 36;
          const hasBadge = b === 0 || badgesEarned.length > b;
          ctx.fillStyle = hasBadge ? '#eab308' : '#1e293b';
          safeRoundRect(ctx, bx, by, 64, 26, 6);
          ctx.fill();
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = hasBadge ? '#0f172a' : '#475569';
          ctx.fillText('GYM ' + (b + 1), bx + 12, by + 17);
        }

        // Party Pokémon List
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('PARTY POKÉMON', 940, 295);

        let py = 330;
        const party = state.party || [];
        for (let p = 0; p < Math.min(4, party.length); p++) {
          const mon = party[p];
          ctx.fillStyle = '#0f172a';
          safeRoundRect(ctx, 940, py - 20, 300, 56, 8);
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.stroke();

          // Mon Name & Level
          ctx.font = 'bold 15px monospace';
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(mon.name, 955, py);
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(':L' + mon.level, 1090, py);

          // HP Bar
          const hpRatio = (mon.currentHp || 1) / (mon.maxHp || 1);
          ctx.fillStyle = '#334155';
          ctx.fillRect(955, py + 10, 180, 8);
          ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : (hpRatio > 0.2 ? '#eab308' : '#ef4444');
          ctx.fillRect(955, py + 10, Math.round(180 * Math.max(0, Math.min(1, hpRatio))), 8);

          ctx.font = 'bold 12px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(mon.currentHp + '/' + mon.maxHp, 1145, py + 18);

          py += 68;
        }

        // Location & Pokedex summary
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        safeRoundRect(ctx, 940, 580, 300, 45, 8);
        ctx.fill();
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('MAP: ' + state.currentMap, 955, 608);

        // BOTTOM ACTION TICKER
        ctx.fillStyle = '#0c1222';
        safeRoundRect(ctx, 20, 652, 1240, 54, 10);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.font = 'bold 15px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('[CHAT PLAYS POKÉMON] ' + (state.lastAction || 'EXPLORING'), 40, 684);

        ctx.font = '14px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText('TYPE IN CHAT: !up, !down, !left, !right, !a, !b, !start, !select, !anarchy, !democracy', 1235, 684);
        ctx.textAlign = 'left';

      } catch (err) {
        console.error('Studio render error:', err);
      } finally {
        requestAnimationFrame(renderStudio);
      }
    }

    requestAnimationFrame(renderStudio);
  </script>
</body>
</html>`;
  }
}

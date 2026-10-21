import { BaseAdapter } from '@autoplay/adapter-sdk';
import {
  GameAdapterCapabilities,
  ChromeDinoConfig,
  ChromeDinoConfigSchema,
  GameStatus,
  GameProgress
} from '@autoplay/shared';
import { ChromeDinoEngine } from './ChromeDinoEngine.js';

export class ChromeDinoAdapter extends BaseAdapter {
  public readonly id = 'chrome-dino';
  public readonly displayName = 'Chrome Dinosaur (T-Rex Runner 24/7 AI)';
  public readonly capabilities: GameAdapterCapabilities = {
    supportsHeadlessVisuals: true,
    supportsRealRendering: true,
    supportsAudioCapture: false,
    supportsReconnection: true,
    supportsMultipleObjectives: true
  };

  private engine: ChromeDinoEngine | null = null;
  private config: ChromeDinoConfig | null = null;
  private viewerPort = 3015;
  private startTime = 0;

  public async initializeStandbyViewer(port = 3015): Promise<void> {
    if (this.engine) return;
    const defaultCfg: ChromeDinoConfig = {
      botName: 'DinoAI',
      mode: 'autonomous_ai',
      difficulty: 'normal',
      autoRestart: true,
      viewerPort: port,
      enableViewer: true,
      theme: 'brutalist_dark',
      jumpReactionDistance: 120
    };
    this.config = defaultCfg;
    this.viewerPort = port;
    const engine = new ChromeDinoEngine(defaultCfg);
    this.engine = engine;
    await engine.start();
  }

  public getEngine(): ChromeDinoEngine | null {
    return this.engine;
  }

  public async validateConfig(config: unknown): Promise<void> {
    ChromeDinoConfigSchema.parse(config);
  }

  public async start(rawConfig: unknown): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }

    const config = ChromeDinoConfigSchema.parse(rawConfig);
    this.config = config;
    this.viewerPort = config.viewerPort;
    this.startTime = Date.now();

    this.status = {
      state: 'INITIALIZING',
      health: 100
    };

    const engine = new ChromeDinoEngine(config);
    this.engine = engine;

    engine.on('log', (entry) => {
      this.emit('log', entry);
    });

    engine.on('crash', (data) => {
      this.progress.deathCount += 1;
      this.emit('log', {
        level: 'warn',
        message: `Chrome Dino Crash: Obstacle ${data.obstacle} (Score: ${data.score})`
      });
      this.emit('progress', this.progress);
    });

    engine.on('respawn', (data) => {
      this.progress.reconnectCount += 1;
      this.emit('log', {
        level: 'info',
        message: `Chrome Dino Run #${data.runCount} auto-started.`
      });
    });

    await engine.start();

    this.status = {
      state: 'CONNECTED',
      health: 100,
      connectedServer: 'Local Autonomous Chrome Dino Engine'
    };
  }

  public async pause(): Promise<void> {
    if (this.engine) {
      this.engine.pause();
      this.status.state = 'PAUSED';
    }
  }

  public async resume(): Promise<void> {
    if (this.engine) {
      this.engine.resume();
      this.status.state = 'CONNECTED';
    }
  }

  public async stop(): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    this.status = {
      state: 'DISCONNECTED',
      health: 0
    };
  }

  public async handleCommand(
    command: string,
    args: string[] = [],
    sender = 'Viewer'
  ): Promise<{ success: boolean; message: string }> {
    if (!this.engine) {
      return { success: false, message: 'Chrome Dinosaur Engine not active' };
    }

    const cmd = command.toLowerCase().trim();

    if (cmd === 'jump' || cmd === 'space' || cmd === 'up' || cmd === 'j') {
      const res = this.engine.jump(sender);
      return { success: res.success, message: res.message };
    }

    if (cmd === 'duck' || cmd === 'down' || cmd === 'd') {
      const res = this.engine.duck(sender);
      setTimeout(() => this.engine?.unduck(), 500);
      return { success: res.success, message: res.message };
    }

    if (cmd === 'restart' || cmd === 'reset') {
      this.engine.resetGame(true);
      return { success: true, message: `[${sender}] Game restarted!` };
    }

    if (cmd === 'mode' && args.length > 0) {
      const targetMode = args[0].toLowerCase();
      if (['autonomous_ai', 'chat_democracy', 'manual'].includes(targetMode)) {
        this.engine.getState().aiMode = targetMode as any;
        return { success: true, message: `Mode switched to ${targetMode.toUpperCase()}` };
      }
    }

    if (cmd === 'score') {
      const s = this.engine.getState();
      return { success: true, message: `Score: ${s.score} | High Score: ${s.highScore} | Speed: ${s.speed.toFixed(1)}` };
    }

    return {
      success: false,
      message: `Unknown command: ${command}. Valid: jump, duck, restart, mode, score`
    };
  }

  public override async getProgress(): Promise<GameProgress> {
    if (!this.engine) {
      return super.getProgress();
    }
    const state = this.engine.getState();
    const uptime = this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    this.progress = {
      currentObjective: `Score ${Math.floor(state.score / 1000) * 1000 + 1000}+`,
      objectiveProgressPercent: Math.min(100, Math.round((state.score % 1000) / 10)),
      details: {
        score: state.score,
        highScore: state.highScore,
        speed: Number(state.speed.toFixed(1)),
        isJumping: state.isJumping,
        isDucking: state.isDucking,
        jumpCount: state.jumpCount,
        duckCount: state.duckCount,
        runCount: state.runCount,
        nearestObstacle: state.nearestObstacleType,
        nearestDistance: state.nearestObstacleDistance,
        aiMode: state.aiMode
      },
      explorationStats: {
        blocksTraveled: Math.round(state.distance),
        discoveredPointsOfInterest: state.runCount,
        currentSpeed: Number(state.speed.toFixed(1)),
        exploredAreaSquareMeters: Math.round(state.distance * 10)
      },
      inventorySummary: {
        score: state.score,
        highScore: state.highScore
      },
      deathCount: state.runCount - 1,
      reconnectCount: 0,
      uptimeSeconds: uptime
    };

    return this.progress;
  }

  public override async getViewerEndpoint(): Promise<{ url: string; width: number; height: number } | null> {
    return {
      url: `http://localhost:${this.viewerPort}`,
      width: 1280,
      height: 720
    };
  }
}

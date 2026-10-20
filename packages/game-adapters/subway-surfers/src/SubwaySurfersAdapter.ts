import { BaseAdapter } from '@autoplay/adapter-sdk';
import {
  GameAdapterCapabilities,
  SubwaySurfersConfig,
  SubwaySurfersConfigSchema,
  GameStatus,
  GameProgress,
  HealthStatus
} from '@autoplay/shared';
import { SubwaySurfersEngine } from './SubwaySurfersEngine.js';

export class SubwaySurfersAdapter extends BaseAdapter {
  public readonly id = 'subway-surfers';
  public readonly displayName = 'Subway Surfers (Autonomous 24/7)';
  public readonly capabilities: GameAdapterCapabilities = {
    supportsHeadlessVisuals: true,
    supportsRealRendering: true,
    supportsAudioCapture: false,
    supportsReconnection: true,
    supportsMultipleObjectives: true
  };

  private engine: SubwaySurfersEngine | null = null;
  private config: SubwaySurfersConfig | null = null;
  private viewerPort = 3008;
  private startTime = 0;

  public async initializeStandbyViewer(port = 3008): Promise<void> {
    if (this.engine) return;
    const defaultCfg: SubwaySurfersConfig = {
      botName: 'JakeSurfer',
      mode: 'autonomous_ai',
      difficulty: 'normal',
      autoRevive: true,
      enableViewer: true,
      viewerPort: port,
      startingMultiplier: 10
    };
    this.config = defaultCfg;
    this.viewerPort = port;
    const engine = new SubwaySurfersEngine(defaultCfg);
    this.engine = engine;
    await engine.start();
  }

  public getEngine(): SubwaySurfersEngine | null {
    return this.engine;
  }

  public async validateConfig(config: unknown): Promise<void> {
    SubwaySurfersConfigSchema.parse(config);
  }

  public async start(rawConfig: unknown): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }

    const config = SubwaySurfersConfigSchema.parse(rawConfig);
    this.config = config;
    this.viewerPort = config.viewerPort;
    this.startTime = Date.now();

    this.status = {
      state: 'INITIALIZING',
      health: 100
    };

    const engine = new SubwaySurfersEngine(config);
    this.engine = engine;

    engine.on('log', (entry) => {
      this.emit('log', entry);
    });

    engine.on('crash', (data) => {
      this.progress.deathCount += 1;
      this.emit('log', {
        level: 'warn',
        message: `Subway Surfers Crash: ${data.reason} (Score: ${data.score}, Coins: ${data.coins})`
      });
    });

    engine.on('respawn', (data) => {
      this.progress.reconnectCount += 1;
      this.emit('log', {
        level: 'info',
        message: `Subway Surfers Run #${data.runCount} auto-started.`
      });
    });

    await engine.start();

    this.status = {
      state: 'CONNECTED',
      health: 100,
      connectedServer: 'Local Autonomous Subway Engine'
    };
  }

  public async pause(): Promise<void> {
    if (this.engine) {
      this.status.state = 'PAUSED';
    }
  }

  public async resume(): Promise<void> {
    if (this.engine) {
      this.status.state = 'CONNECTED';
    }
  }

  public async stop(): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }
    // Maintain 24/7 web viewer on port 3008
    await this.initializeStandbyViewer(this.viewerPort);
    this.status = {
      state: 'DISCONNECTED',
      health: 0
    };
  }

  public async getStatus(): Promise<GameStatus> {
    if (!this.engine) return { ...this.status };
    const st = this.engine.getState();
    return {
      state: this.status.state,
      health: st.isCrashed ? 0 : 100,
      food: st.multiplier,
      position: {
        x: st.lane,
        y: st.isJumping ? 1 : (st.isRolling ? -1 : 0),
        z: Math.round(st.distanceMeters)
      },
      connectedServer: 'Subway Surfers Autonomous Loop'
    };
  }

  public async getProgress(): Promise<GameProgress> {
    if (!this.engine) return { ...this.progress };
    const st = this.engine.getState();
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      currentObjective: `High-Score Run #${st.runCount} (Multiplier: ${st.multiplier}X)`,
      objectiveProgressPercent: Math.min(100, Math.round((st.score % 50000) / 500)),
      details: {
        lane: st.lane === -1 ? 'LEFT' : (st.lane === 1 ? 'RIGHT' : 'CENTER'),
        speedKmh: Math.round(st.speedKmh),
        multiplier: st.multiplier,
        hasHoverboard: st.hasHoverboard,
        isJumping: st.isJumping,
        isRolling: st.isRolling,
        coins: st.coins,
        currentScore: st.score,
        topScore: st.topScore
      },
      explorationStats: {
        blocksTraveled: Math.round(st.distanceMeters),
        discoveredPointsOfInterest: st.coins,
        currentSpeed: Math.round(st.speedKmh),
        exploredAreaSquareMeters: Math.round(st.distanceMeters * 3)
      },
      inventorySummary: {
        Coins: st.coins,
        Multiplier: st.multiplier,
        Hoverboard: st.hasHoverboard ? 1 : 0
      },
      deathCount: this.progress.deathCount,
      reconnectCount: this.progress.reconnectCount,
      uptimeSeconds: uptimeSec
    };
  }

  public async handleCommand(command: string, args: string[], sender: string): Promise<{ success: boolean; message: string }> {
    if (!this.engine) {
      return { success: false, message: 'Subway Surfers engine is not currently running.' };
    }

    const cmd = command.toLowerCase();

    if (cmd === 'left' || cmd === 'l') {
      return this.engine.executeAction('left', sender);
    }
    if (cmd === 'right' || cmd === 'r') {
      return this.engine.executeAction('right', sender);
    }
    if (cmd === 'jump' || cmd === 'j' || cmd === 'up') {
      return this.engine.executeAction('jump', sender);
    }
    if (cmd === 'roll' || cmd === 'duck' || cmd === 'slide' || cmd === 'down') {
      return this.engine.executeAction('roll', sender);
    }
    if (cmd === 'board' || cmd === 'hoverboard' || cmd === 'shield') {
      return this.engine.executeAction('hoverboard', sender);
    }
    if (cmd === 'stats' || cmd === 'score') {
      const st = this.engine.getState();
      return {
        success: true,
        message: `@${sender} Score: ${st.score} | Coins: ${st.coins} | Distance: ${Math.round(st.distanceMeters)}m | Speed: ${Math.round(st.speedKmh)}km/h`
      };
    }

    return {
      success: false,
      message: `Unknown command !${command}. Valid commands: !left, !right, !jump, !roll, !hoverboard, !stats`
    };
  }

  public async getViewerEndpoint(): Promise<{ url: string; width: number; height: number } | null> {
    if (!this.config?.enableViewer) return null;
    return {
      url: `http://localhost:${this.viewerPort}`,
      width: 1280,
      height: 720
    };
  }

  public async healthCheck(): Promise<HealthStatus> {
    if (this.status.state === 'CONNECTED') {
      return 'HEALTHY';
    }
    return 'DEGRADED';
  }
}

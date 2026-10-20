import { BaseAdapter } from '@autoplay/adapter-sdk';
import {
  GameAdapterCapabilities,
  MinecraftConfig,
  MinecraftConfigSchema,
  GameProgress
} from '@autoplay/shared';

export class MockMinecraftAdapter extends BaseAdapter {
  public readonly id = 'minecraft-java-mock';
  public readonly displayName = 'Minecraft Java (TEZMC Autonomous Engine)';
  public readonly capabilities: GameAdapterCapabilities = {
    supportsHeadlessVisuals: true,
    supportsRealRendering: true,
    supportsAudioCapture: false,
    supportsReconnection: true,
    supportsMultipleObjectives: true
  };

  private timer: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private config: MinecraftConfig | null = null;
  private posX = 0;
  private posY = 64;
  private posZ = 0;
  private blocksTraveled = 0;

  public async validateConfig(config: unknown): Promise<void> {
    MinecraftConfigSchema.parse(config);
  }

  public async start(rawConfig: unknown): Promise<void> {
    this.config = MinecraftConfigSchema.parse(rawConfig);
    this.startTime = Date.now();
    this.status = {
      state: 'CONNECTED',
      health: 20,
      food: 20,
      position: { x: 0, y: 64, z: 0 },
      connectedServer: 'local-simulated-server'
    };

    this.timer = setInterval(() => {
      if (this.status.state === 'CONNECTED') {
        const angle = (Date.now() / 1000) * 0.2;
        const radius = Math.min(this.config?.exploreRadius || 50, 25);
        this.posX = Math.round(Math.cos(angle) * radius);
        this.posZ = Math.round(Math.sin(angle) * radius);
        this.blocksTraveled += 1;

        this.status.position = { x: this.posX, y: this.posY, z: this.posZ };
        this.emit('progress', this.getProgress());
      }
    }, 1000);
  }

  public async pause(): Promise<void> {
    this.status.state = 'PAUSED';
  }

  public async resume(): Promise<void> {
    this.status.state = 'CONNECTED';
  }

  public async stop(): Promise<void> {
    this.status.state = 'STOPPED';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async getProgress(): Promise<GameProgress> {
    const uptime = this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      currentObjective: 'Bounded Exploration (Radius: 50m)',
      objectiveProgressPercent: Math.min(100, Math.round((this.blocksTraveled / 200) * 100)),
      details: {
        health: this.status.health,
        food: this.status.food,
        position: this.status.position
      },
      explorationStats: {
        blocksTraveled: this.blocksTraveled,
        discoveredPointsOfInterest: Math.floor(this.blocksTraveled / 15),
        currentSpeed: 1.15,
        exploredAreaSquareMeters: Math.round(this.blocksTraveled * 3.8)
      },
      inventorySummary: {
        oak_log: 8,
        cobblestone: 14,
        apple: 2
      },
      deathCount: 0,
      reconnectCount: 0,
      uptimeSeconds: uptime
    };
  }

  public async getViewerEndpoint(): Promise<{ url: string; width: number; height: number } | null> {
    return {
      url: `http://localhost:${this.config?.viewerPort || 3007}`,
      width: 1280,
      height: 720
    };
  }

  public async handleCommand(command: string, args: string[], sender: string): Promise<{ success: boolean; message: string }> {
    const cmd = command.toLowerCase().replace(/^!/, '');
    switch (cmd) {
      case 'jump':
        this.posY += 1;
        setTimeout(() => { this.posY = Math.max(64, this.posY - 1); }, 400);
        this.emit('bot_jump', { sender, timestamp: Date.now() });
        return { success: true, message: `${this.config?.botName || 'TezmcBot'} jumped on command from @${sender}!` };

      case 'coords':
        return { success: true, message: `Current Position: X=${this.posX}, Y=${this.posY}, Z=${this.posZ}` };

      case 'status':
        return {
          success: true,
          message: `Health: ${this.status.health}/20 | Food: ${this.status.food ?? 20}/20 | Traveled: ${this.blocksTraveled}m | Status: ${this.status.state}`
        };

      case 'say':
        const text = args.join(' ');
        return { success: true, message: `[${this.config?.botName || 'TezmcBot'}]: ${text || 'Hello stream!'}` };

      case 'explore':
        const newRadius = args[0] ? parseInt(args[0], 10) : 50;
        return { success: true, message: `Exploration perimeter adjusted to radius ${newRadius}m!` };

      default:
        return { success: false, message: `Unknown command: !${cmd}. Try !jump, !coords, !status, !say, !explore` };
    }
  }
}

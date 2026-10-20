import { BaseAdapter } from '@autoplay/adapter-sdk';
import {
  GameAdapterCapabilities,
  MinecraftConfig,
  MinecraftConfigSchema,
  GameStatus,
  GameProgress,
  HealthStatus
} from '@autoplay/shared';
import mineflayer, { Bot } from 'mineflayer';
import { NavigationEngine } from './NavigationEngine.js';

export class MinecraftAdapter extends BaseAdapter {
  public readonly id = 'minecraft-java';
  public readonly displayName = 'Minecraft Java Edition';
  public readonly capabilities: GameAdapterCapabilities = {
    supportsHeadlessVisuals: true,
    supportsRealRendering: true,
    supportsAudioCapture: false,
    supportsReconnection: true,
    supportsMultipleObjectives: true
  };

  private bot: Bot | null = null;
  private config: MinecraftConfig | null = null;
  private navigationEngine: NavigationEngine | null = null;
  private viewerPort: number = 3007;
  private viewerCloseFn: (() => void) | null = null;
  private startTime: number = 0;
  private deathCounter = 0;
  private reconnectCounter = 0;

  public async validateConfig(config: unknown): Promise<void> {
    MinecraftConfigSchema.parse(config);
  }

  public async start(rawConfig: unknown): Promise<void> {
    const config = MinecraftConfigSchema.parse(rawConfig);
    this.config = config;
    this.viewerPort = config.viewerPort;
    this.startTime = Date.now();

    this.status = {
      state: 'INITIALIZING',
      health: 20
    };

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const botOptions: mineflayer.BotOptions = {
        host: config.host,
        port: config.port,
        username: config.botName,
        auth: config.auth,
        version: config.version,
        checkTimeoutInterval: 30000
      };

      try {
        const bot = mineflayer.createBot(botOptions);
        this.bot = bot;

        bot.once('spawn', async () => {
          this.status.state = 'CONNECTED';
          this.status.connectedServer = `${config.host}:${config.port}`;
          this.status.health = bot.health || 20;
          this.status.food = bot.food || 20;

          const spawnPos = bot.entity?.position || { x: 0, y: 64, z: 0 };
          this.status.position = {
            x: Math.round(spawnPos.x),
            y: Math.round(spawnPos.y),
            z: Math.round(spawnPos.z)
          };

          // Setup real-time 3D Prismarine Viewer if enabled
          if (config.enableViewer) {
            try {
              // Dynamically import prismarine-viewer to support headless canvas
              const { mineflayer: viewerPlugin } = await import('prismarine-viewer');
              viewerPlugin(bot, {
                port: this.viewerPort,
                firstPerson: true,
                viewDistance: config.viewDistance
              });
              this.viewerCloseFn = () => {
                if ((bot as any).viewer) {
                  try {
                    (bot as any).viewer.close();
                  } catch {
                    // ignore
                  }
                }
              };
            } catch (err: any) {
              this.emit('log', {
                level: 'warn',
                message: `Prismarine 3D viewer initialization notice: ${err?.message || err}`
              });
            }
          }

          // Initialize navigation
          this.navigationEngine = new NavigationEngine(bot, {
            center: { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z },
            radius: config.exploreRadius
          });
          this.navigationEngine.init();

          if (config.objective === 'bounded_exploration') {
            this.progress.currentObjective = `Bounded Exploration (Radius: ${config.exploreRadius}m)`;
            this.navigationEngine.startBoundedExploration();
          }

          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        bot.on('health', () => {
          this.status.health = bot.health;
          this.status.food = bot.food;
          this.emit('progress', this.getProgress());
        });

        bot.on('death', () => {
          this.deathCounter++;
          this.progress.deathCount = this.deathCounter;
          this.emit('event', {
            type: 'bot_death',
            timestamp: new Date().toISOString(),
            deathCount: this.deathCounter
          });
        });

        bot.on('respawn', () => {
          if (this.navigationEngine && this.config?.objective === 'bounded_exploration') {
            this.navigationEngine.startBoundedExploration();
          }
        });

        bot.on('error', (err) => {
          this.status.state = 'ERROR';
          this.status.lastError = err.message;
          this.emit('error', err);
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });

        bot.on('kicked', (reason) => {
          this.status.state = 'DISCONNECTED';
          this.status.lastError = typeof reason === 'string' ? reason : JSON.stringify(reason);
          this.emit('event', {
            type: 'kicked',
            reason: this.status.lastError
          });
        });

        bot.on('end', () => {
          if (this.status.state !== 'STOPPED') {
            this.status.state = 'DISCONNECTED';
            this.reconnectCounter++;
            this.progress.reconnectCount = this.reconnectCounter;
          }
        });

        // Fail-safe connection timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Timed out connecting to Minecraft server at ${config.host}:${config.port}`));
          }
        }, 20000);

      } catch (err) {
        this.status.state = 'ERROR';
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  }

  public async pause(): Promise<void> {
    if (this.navigationEngine) {
      this.navigationEngine.stop();
    }
    this.status.state = 'PAUSED';
  }

  public async resume(): Promise<void> {
    if (this.navigationEngine && this.config?.objective === 'bounded_exploration') {
      this.navigationEngine.startBoundedExploration();
    }
    this.status.state = 'CONNECTED';
  }

  public async stop(): Promise<void> {
    this.status.state = 'STOPPED';

    if (this.navigationEngine) {
      this.navigationEngine.stop();
      this.navigationEngine = null;
    }

    if (this.viewerCloseFn) {
      this.viewerCloseFn();
      this.viewerCloseFn = null;
    }

    if (this.bot) {
      try {
        this.bot.quit('Session terminated by AutoPlay AI');
      } catch {
        // ignore
      }
      this.bot = null;
    }
  }

  public async getProgress(): Promise<GameProgress> {
    if (this.bot?.entity?.position) {
      const pos = this.bot.entity.position;
      this.status.position = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        z: Math.round(pos.z),
        yaw: this.bot.entity.yaw,
        pitch: this.bot.entity.pitch
      };
    }

    const navStats = this.navigationEngine ? this.navigationEngine.getStats() : { blocksTraveled: 0, discoveredPointsOfInterest: 0 };
    const uptime = this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    // Inventory summary
    const inv: Record<string, number> = {};
    if (this.bot?.inventory) {
      for (const item of this.bot.inventory.items()) {
        inv[item.name] = (inv[item.name] || 0) + item.count;
      }
    }

    this.progress = {
      currentObjective: this.config?.objective || 'Exploration',
      objectiveProgressPercent: Math.min(100, Math.round((navStats.blocksTraveled / 500) * 100)),
      details: {
        health: this.status.health,
        food: this.status.food,
        position: this.status.position
      },
      explorationStats: {
        blocksTraveled: navStats.blocksTraveled,
        discoveredPointsOfInterest: navStats.discoveredPointsOfInterest,
        currentSpeed: 1.2,
        exploredAreaSquareMeters: Math.round(navStats.blocksTraveled * 3.5)
      },
      inventorySummary: inv,
      deathCount: this.deathCounter,
      reconnectCount: this.reconnectCounter,
      uptimeSeconds: uptime
    };

    return this.progress;
  }

  public async getViewerEndpoint(): Promise<{ url: string; width: number; height: number } | null> {
    if (this.config?.enableViewer && this.status.state === 'CONNECTED') {
      return {
        url: `http://localhost:${this.viewerPort}`,
        width: 1280,
        height: 720
      };
    }
    return null;
  }

  public async handleCommand(command: string, args: string[], sender: string): Promise<{ success: boolean; message: string }> {
    const cmd = command.toLowerCase().replace(/^!/, '');
    if (!this.bot || this.status.state !== 'CONNECTED') {
      return { success: false, message: 'Minecraft bot is currently not connected.' };
    }

    switch (cmd) {
      case 'jump':
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot?.setControlState('jump', false), 350);
        return { success: true, message: `${this.config?.botName || 'TezmcBot'} jumped on command from @${sender}!` };

      case 'coords':
        const pos = this.bot.entity.position.floored();
        return { success: true, message: `Current position: X=${pos.x}, Y=${pos.y}, Z=${pos.z}` };

      case 'status':
        return {
          success: true,
          message: `Health: ${this.bot.health}/20 | Food: ${this.bot.food}/20 | State: ${this.status.state}`
        };

      case 'say':
        const chatText = args.join(' ');
        if (chatText) {
          this.bot.chat(chatText);
          return { success: true, message: `Sent in-game chat: "${chatText}"` };
        }
        return { success: false, message: 'Please provide a message to say.' };

      case 'explore':
        if (this.navigationEngine) {
          this.navigationEngine.startBoundedExploration();
          return { success: true, message: 'Initiated new exploration sweep!' };
        }
        return { success: false, message: 'Navigation engine unavailable.' };

      default:
        return { success: false, message: `Unknown command: !${cmd}. Try !jump, !coords, !status, !say, !explore` };
    }
  }
}

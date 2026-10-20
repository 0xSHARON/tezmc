import { BaseAdapter } from '@autoplay/adapter-sdk';
import {
  GameAdapterCapabilities,
  PokemonRedConfig,
  PokemonRedConfigSchema,
  GameStatus,
  GameProgress,
  HealthStatus
} from '@autoplay/shared';
import { PokemonRedEngine } from './PokemonRedEngine.js';
import { GameBoyButton } from './types.js';

export class PokemonRedAdapter extends BaseAdapter {
  public readonly id = 'pokemon-red';
  public readonly displayName = 'Pokémon Red (Chat Plays Pokémon)';
  public readonly capabilities: GameAdapterCapabilities = {
    supportsHeadlessVisuals: true,
    supportsRealRendering: true,
    supportsAudioCapture: true,
    supportsReconnection: true,
    supportsMultipleObjectives: true
  };

  private engine: PokemonRedEngine | null = null;
  private config: PokemonRedConfig | null = null;
  private viewerPort = 3009;
  private startTime = 0;

  public async initializeStandbyViewer(port = 3009): Promise<void> {
    if (this.engine) return;
    const defaultCfg: PokemonRedConfig = {
      playerTrainerName: 'RED',
      rivalName: 'BLUE',
      mode: 'anarchy',
      chatCooldownMs: 500,
      democracyVoteWindowSeconds: 15,
      enableViewer: true,
      viewerPort: port,
      autoDownloadRom: true,
      starterPokemon: 'charmander'
    };
    this.config = defaultCfg;
    this.viewerPort = port;
    const engine = new PokemonRedEngine(defaultCfg);
    this.engine = engine;
    await engine.start();
  }

  public getEngine(): PokemonRedEngine | null {
    return this.engine;
  }

  public async validateConfig(config: unknown): Promise<void> {
    PokemonRedConfigSchema.parse(config);
  }

  public async start(rawConfig: unknown): Promise<void> {
    if (this.engine) {
      await this.engine.stop();
      this.engine = null;
    }

    const config = PokemonRedConfigSchema.parse(rawConfig);
    this.config = config;
    this.viewerPort = config.viewerPort || 3009;
    this.startTime = Date.now();

    this.status = {
      state: 'INITIALIZING',
      health: 100
    };

    const engine = new PokemonRedEngine(config);
    this.engine = engine;

    engine.on('log', (entry) => {
      this.emit('log', entry);
    });

    await engine.start();

    this.status = {
      state: 'CONNECTED',
      health: 100,
      connectedServer: 'Retro Game Boy Emulation Pipeline'
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
      health: 100,
      food: st.party.length,
      position: {
        x: st.stepCount,
        y: st.badges.length,
        z: st.money
      },
      connectedServer: 'Game Boy DMG (Pokemon Red)'
    };
  }

  public async getProgress(): Promise<GameProgress> {
    if (!this.engine) return { ...this.progress };
    const st = this.engine.getState();
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      currentObjective: `Kanto Journey: ${st.currentMap} (${st.badges.length}/8 Badges)`,
      objectiveProgressPercent: Math.round((st.badges.length / 8) * 100),
      details: {
        trainer: st.trainerName,
        map: st.currentMap,
        mode: st.mode.toUpperCase(),
        badgesCount: st.badges.length,
        partyLead: st.party[0]?.name || 'NONE',
        money: `$${st.money}`,
        steps: st.stepCount,
        rom: st.romTitle
      },
      explorationStats: {
        blocksTraveled: st.stepCount,
        discoveredPointsOfInterest: st.badges.length,
        currentSpeed: 60,
        exploredAreaSquareMeters: st.pokedexSeen * 50
      },
      inventorySummary: {
        Pokeballs: 5,
        Potions: 3,
        Badges: st.badges.length,
        Money: st.money
      },
      deathCount: this.progress.deathCount,
      reconnectCount: this.progress.reconnectCount,
      uptimeSeconds: uptimeSec
    };
  }

  public async handleCommand(command: string, args: string[], sender: string): Promise<{ success: boolean; message: string }> {
    if (!this.engine) {
      return { success: false, message: 'Pokemon Red engine is not currently running.' };
    }

    const cmd = command.toLowerCase();

    // Game Boy Controller Buttons
    const validButtons: GameBoyButton[] = ['a', 'b', 'up', 'down', 'left', 'right', 'start', 'select'];
    if (validButtons.includes(cmd as GameBoyButton)) {
      return this.engine.executeAction(cmd as GameBoyButton, sender);
    }

    // Aliases
    if (cmd === 'u') return this.engine.executeAction('up', sender);
    if (cmd === 'd') return this.engine.executeAction('down', sender);
    if (cmd === 'l') return this.engine.executeAction('left', sender);
    if (cmd === 'r') return this.engine.executeAction('right', sender);

    // Stream Mode Switching
    if (cmd === 'anarchy') {
      return this.engine.setMode('anarchy', sender);
    }
    if (cmd === 'democracy') {
      return this.engine.setMode('democracy', sender);
    }

    // Info Commands
    if (cmd === 'party') {
      const st = this.engine.getState();
      const partyStr = st.party.map(p => `${p.name} (Lv${p.level} HP:${p.currentHp}/${p.maxHp})`).join(', ');
      return {
        success: true,
        message: `@${sender} Party: ${partyStr}`
      };
    }

    if (cmd === 'badges') {
      const st = this.engine.getState();
      return {
        success: true,
        message: `@${sender} Badges (${st.badges.length}/8): ${st.badges.join(', ') || 'None yet'}`
      };
    }

    return {
      success: false,
      message: `Unknown command !${command}. Valid commands: !a, !b, !up, !down, !left, !right, !start, !select, !anarchy, !democracy, !party, !badges`
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

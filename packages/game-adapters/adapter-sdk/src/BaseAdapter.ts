import { EventEmitter } from 'node:events';
import {
  GameAdapter,
  GameAdapterCapabilities,
  GameStatus,
  GameProgress,
  HealthStatus
} from '@autoplay/shared';

export abstract class BaseAdapter extends EventEmitter implements GameAdapter {
  public abstract readonly id: string;
  public abstract readonly displayName: string;
  public abstract readonly capabilities: GameAdapterCapabilities;

  protected status: GameStatus = {
    state: 'INITIALIZING',
    health: 20
  };

  protected progress: GameProgress = {
    currentObjective: 'Idle',
    objectiveProgressPercent: 0,
    details: {},
    explorationStats: {
      blocksTraveled: 0,
      discoveredPointsOfInterest: 0,
      currentSpeed: 0,
      exploredAreaSquareMeters: 0
    },
    inventorySummary: {},
    deathCount: 0,
    reconnectCount: 0,
    uptimeSeconds: 0
  };

  public abstract validateConfig(config: unknown): Promise<void>;
  public abstract start(config: unknown): Promise<void>;
  public abstract pause(): Promise<void>;
  public abstract resume(): Promise<void>;
  public abstract stop(): Promise<void>;

  public async getStatus(): Promise<GameStatus> {
    return { ...this.status };
  }

  public async getProgress(): Promise<GameProgress> {
    return { ...this.progress };
  }

  public async healthCheck(): Promise<HealthStatus> {
    if (this.status.state === 'CONNECTED') {
      return 'HEALTHY';
    }
    if (this.status.state === 'INITIALIZING' || this.status.state === 'PAUSED') {
      return 'DEGRADED';
    }
    if (this.status.state === 'ERROR' || this.status.state === 'DISCONNECTED') {
      return 'UNHEALTHY';
    }
    return 'UNKNOWN';
  }

  public async getViewerEndpoint(): Promise<{ url: string; width: number; height: number } | null> {
    return null;
  }
}

import { SessionState, HealthStatus, StreamStatus, StreamConfig } from '../schemas/index.js';

export interface GameStatus {
  state: 'INITIALIZING' | 'CONNECTED' | 'DISCONNECTED' | 'PAUSED' | 'ERROR' | 'STOPPED';
  health: number; // e.g. 0-20 for Minecraft
  food?: number;
  position?: { x: number; y: number; z: number; yaw?: number; pitch?: number };
  gameTime?: number;
  dimension?: string;
  connectedServer?: string;
  playersNearby?: number;
  lastError?: string;
}

export interface GameProgress {
  currentObjective: string;
  objectiveProgressPercent: number;
  details: Record<string, any>;
  explorationStats: {
    blocksTraveled: number;
    discoveredPointsOfInterest: number;
    currentSpeed: number;
    exploredAreaSquareMeters: number;
  };
  inventorySummary: Record<string, number>;
  deathCount: number;
  reconnectCount: number;
  uptimeSeconds: number;
}

export interface GameEvent {
  id: string;
  type: string;
  timestamp: string;
  gameId: string;
  data: Record<string, any>;
}

export interface AdapterError {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, any>;
  timestamp: string;
}

export interface GameAdapterCapabilities {
  supportsHeadlessVisuals: boolean;
  supportsRealRendering: boolean;
  supportsAudioCapture: boolean;
  supportsReconnection: boolean;
  supportsMultipleObjectives: boolean;
}

export interface GameAdapter {
  id: string;
  displayName: string;
  capabilities: GameAdapterCapabilities;

  validateConfig(config: unknown): Promise<void>;
  start(config: unknown): Promise<void>;
  getStatus(): Promise<GameStatus>;
  getProgress(): Promise<GameProgress>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getViewerEndpoint?(): Promise<{ url: string; width: number; height: number } | null>;
  handleCommand?(command: string, args: string[], sender: string): Promise<{ success: boolean; message: string }>;
  on?(event: string, listener: (...args: any[]) => void): void;
  off?(event: string, listener: (...args: any[]) => void): void;
}

export interface StreamMetrics {
  fps: number;
  bitrateKbps: number;
  totalFrames: number;
  droppedFrames: number;
  encoderCpuPercent: number;
  encoderMemoryMb: number;
  uptimeSeconds: number;
  speed: number;
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  diskFreeMb: number;
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  gameId: string;
  state: SessionState;
  desiredState: 'RUNNING' | 'STOPPED' | 'PAUSED';
  startTime?: string;
  endTime?: string;
  restartCount: number;
  consecutiveFailures: number;
  lastFailureReason?: string;
  gameConfig: Record<string, any>;
  streamConfig?: StreamConfig;
  createdAt: string;
  updatedAt: string;
}

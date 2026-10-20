import { EventEmitter } from 'node:events';
import { StreamConfig, StreamConfigSchema, StreamMetrics, StreamStatus } from '@autoplay/shared';
import { CaptureSource, StreamingProvider } from './types.js';
import { FFmpegProvider } from './FFmpegProvider.js';
import { OBSProvider } from './OBSProvider.js';

export interface StreamingManagerOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export class StreamingManager extends EventEmitter {
  private currentProvider: StreamingProvider | null = null;
  private currentConfig: StreamConfig | null = null;
  private currentSource: CaptureSource | null = null;
  private retryAttempts = 0;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private isIntentionalStop = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: StreamingManagerOptions = {}) {
    super();
    this.maxRetries = options.maxRetries ?? 5;
    this.initialBackoffMs = options.initialBackoffMs ?? 2000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
  }

  public getStatus(): StreamStatus {
    return this.currentProvider ? this.currentProvider.getStatus() : 'INACTIVE';
  }

  public getMetrics(): StreamMetrics {
    return this.currentProvider
      ? this.currentProvider.getMetrics()
      : {
          fps: 0,
          bitrateKbps: 0,
          totalFrames: 0,
          droppedFrames: 0,
          encoderCpuPercent: 0,
          encoderMemoryMb: 0,
          uptimeSeconds: 0,
          speed: 0
        };
  }

  public async startStream(rawConfig: unknown, source: CaptureSource): Promise<void> {
    const config = StreamConfigSchema.parse(rawConfig);
    this.currentConfig = config;
    this.currentSource = source;
    this.isIntentionalStop = false;
    this.retryAttempts = 0;

    await this.spawnProvider();
  }

  public async stopStream(): Promise<void> {
    this.isIntentionalStop = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.currentProvider) {
      await this.currentProvider.stop();
      this.currentProvider = null;
    }
    this.emit('status', 'INACTIVE');
  }

  private async spawnProvider(): Promise<void> {
    if (!this.currentConfig || !this.currentSource) return;

    if (this.currentProvider) {
      try {
        await this.currentProvider.stop();
      } catch {
        // ignore
      }
      this.currentProvider = null;
    }

    const provider: StreamingProvider =
      this.currentConfig.provider === 'obs' ? new OBSProvider() : new FFmpegProvider();

    this.currentProvider = provider;

    provider.on('status', (status: StreamStatus) => {
      this.emit('status', status);
      if (status === 'LIVE_CONFIRMED') {
        this.retryAttempts = 0; // Reset retries upon solid connection
      }
    });

    provider.on('metrics', (metrics: StreamMetrics) => {
      this.emit('metrics', metrics);
    });

    provider.on('log', (logEntry) => {
      this.emit('log', logEntry);
    });

    provider.on('stalled', () => {
      this.handleRecoverableFailure('Encoder stalled (no progress output)');
    });

    provider.on('unexpected_exit', ({ code, signal }) => {
      if (!this.isIntentionalStop) {
        this.handleRecoverableFailure(`Process unexpected exit: code ${code}, signal ${signal}`);
      }
    });

    try {
      await provider.start(this.currentConfig, this.currentSource);
    } catch (err: any) {
      this.handleRecoverableFailure(`Provider start error: ${err.message}`);
    }
  }

  private handleRecoverableFailure(reason: string): void {
    if (this.isIntentionalStop) return;

    this.retryAttempts++;
    this.emit('log', {
      level: 'warn',
      message: `Stream failure detected (${reason}). Attempt ${this.retryAttempts}/${this.maxRetries}`
    });

    if (this.retryAttempts > this.maxRetries) {
      this.emit('log', {
        level: 'error',
        message: `Maximum stream reconnect retries (${this.maxRetries}) exceeded. Failing stream.`
      });
      this.emit('status', 'FAILED');
      return;
    }

    // Exponential backoff with jitter: delay = min(maxBackoff, initialBackoff * 2^(n-1)) + jitter
    const exponential = this.initialBackoffMs * Math.pow(2, this.retryAttempts - 1);
    const jitter = Math.random() * 1000;
    const delayMs = Math.min(this.maxBackoffMs, exponential + jitter);

    this.emit('status', 'RECONNECTING');

    this.reconnectTimer = setTimeout(async () => {
      if (!this.isIntentionalStop) {
        this.emit('log', {
          level: 'info',
          message: `Attempting stream recovery reconnect (attempt ${this.retryAttempts})...`
        });
        await this.spawnProvider();
      }
    }, delayMs);
  }
}

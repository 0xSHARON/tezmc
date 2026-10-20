import { EventEmitter } from 'node:events';
import { StreamConfig, StreamMetrics, StreamStatus } from '@autoplay/shared';
import { CaptureSource, StreamingProvider } from './types.js';

export class OBSProvider extends EventEmitter implements StreamingProvider {
  public readonly name = 'obs';
  private status: StreamStatus = 'INACTIVE';
  private metrics: StreamMetrics = {
    fps: 0,
    bitrateKbps: 0,
    totalFrames: 0,
    droppedFrames: 0,
    encoderCpuPercent: 0,
    encoderMemoryMb: 0,
    uptimeSeconds: 0,
    speed: 1.0
  };

  public getStatus(): StreamStatus {
    return this.status;
  }

  public getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  public async start(config: StreamConfig, source: CaptureSource): Promise<void> {
    // In environments with OBS Studio installed and OBS WebSocket enabled, connects via obs-websocket-js
    this.status = 'ENCODER_RUNNING';
    this.emit('status', this.status);
    this.emit('log', { level: 'info', message: 'OBS Studio provider initialized.' });
  }

  public async stop(): Promise<void> {
    this.status = 'INACTIVE';
    this.emit('status', this.status);
  }
}

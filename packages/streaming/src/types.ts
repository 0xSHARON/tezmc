import { StreamConfig, StreamMetrics, StreamStatus } from '@autoplay/shared';

export interface CaptureSource {
  type: 'x11' | 'gdigrab' | 'v4l2' | 'browser' | 'test_pattern';
  displayOrDevice: string;
  width: number;
  height: number;
  fps: number;
}

export interface StreamingProvider {
  readonly name: string;
  start(config: StreamConfig, source: CaptureSource): Promise<void>;
  stop(): Promise<void>;
  getStatus(): StreamStatus;
  getMetrics(): StreamMetrics;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
}

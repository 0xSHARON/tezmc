import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { StreamConfig, StreamMetrics, StreamStatus, SecretRedactor } from '@autoplay/shared';
import { CaptureSource, StreamingProvider } from './types.js';
import { MultiStreamManager } from './MultiStreamManager.js';

export class FFmpegProvider extends EventEmitter implements StreamingProvider {
  public readonly name = 'ffmpeg';
  private process: ChildProcess | null = null;
  private status: StreamStatus = 'INACTIVE';
  private metrics: StreamMetrics = {
    fps: 0,
    bitrateKbps: 0,
    totalFrames: 0,
    droppedFrames: 0,
    encoderCpuPercent: 0,
    encoderMemoryMb: 0,
    uptimeSeconds: 0,
    speed: 0
  };

  private startTime: number = 0;
  private lastFrameUpdate: number = 0;
  private watchdogTimer: NodeJS.Timeout | null = null;

  public getStatus(): StreamStatus {
    return this.status;
  }

  public getMetrics(): StreamMetrics {
    if (this.startTime > 0) {
      this.metrics.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    }
    return { ...this.metrics };
  }

  public async start(config: StreamConfig, source: CaptureSource): Promise<void> {
    if (this.process) {
      throw new Error('FFmpeg encoder process is already running.');
    }

    this.status = 'INITIALIZING';
    this.emit('status', this.status);

    const multiManager = MultiStreamManager.getInstance();
    let streamKey = config.streamKey;
    if (!streamKey) {
      const activeTargets = config.destinations?.filter(d => d.enabled) || [];
      if (activeTargets.length > 0) {
        streamKey = multiManager.resolveStreamKey(activeTargets[0]);
      }
      if (!streamKey && config.rtmpUrl.includes('youtube')) {
        streamKey = process.env.YOUTUBE_STREAM_KEY || '';
      }
    }

    // Safety pre-flight check: prevent crash loop if streaming to YouTube without a key
    if (config.rtmpUrl.includes('youtube.com') && (!streamKey || streamKey.trim() === '')) {
      const activeTargets = config.destinations?.filter(d => d.enabled) || [];
      const hasAnyKey = activeTargets.some(t => !!multiManager.resolveStreamKey(t));
      if (!hasAnyKey) {
        throw new Error('Cannot start broadcast: YouTube stream key is missing. Set YOUTUBE_STREAM_KEY in .env or configure in the dashboard.');
      }
    }

    const fullRtmpDestination = streamKey
      ? `${config.rtmpUrl.replace(/\/$/, '')}/${streamKey}`
      : config.rtmpUrl;

    const args = this.buildFFmpegArgs(config, source, fullRtmpDestination);

    // Redacted logs for security compliance
    const redactedArgs = SecretRedactor.redactArgs(args);
    this.emit('log', {
      level: 'info',
      message: `Starting FFmpeg encoder with arguments: ffmpeg ${redactedArgs.join(' ')}`
    });

    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      try {
        const proc = spawn('ffmpeg', args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        this.process = proc;
        this.startTime = Date.now();
        this.lastFrameUpdate = Date.now();

        // Monitor stderr where FFmpeg outputs progress and connection info
        proc.stderr?.on('data', (chunk: Buffer) => {
          const rawText = chunk.toString();
          const safeText = SecretRedactor.redactString(rawText);

          this.parseProgress(rawText);

          // Check for RTMP connection confirmations
          if (rawText.includes('Connected to') || rawText.includes('Publishing') || rawText.includes('Writing header')) {
            if (this.status !== 'LIVE_CONFIRMED') {
              this.status = 'INGEST_CONNECTED';
              this.emit('status', this.status);
            }
          }

          if (rawText.toLowerCase().includes('error') || rawText.toLowerCase().includes('fatal')) {
            this.emit('log', { level: 'warn', message: safeText.trim() });
          }
        });

        proc.on('spawn', () => {
          this.status = 'ENCODER_RUNNING';
          this.emit('status', this.status);
          this.startWatchdog();
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        proc.on('error', (err) => {
          this.status = 'FAILED';
          this.emit('status', this.status);
          this.emit('log', { level: 'error', message: `FFmpeg process error: ${err.message}` });
          this.cleanup();
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });

        proc.on('exit', (code, signal) => {
          const wasExpected = this.status === 'INACTIVE';
          this.emit('log', {
            level: wasExpected ? 'info' : 'warn',
            message: `FFmpeg process exited with code ${code}, signal: ${signal}`
          });
          this.cleanup();
          if (!wasExpected) {
            this.status = 'FAILED';
            this.emit('status', this.status);
            this.emit('unexpected_exit', { code, signal });
          }
        });

      } catch (err: any) {
        this.status = 'FAILED';
        this.emit('status', this.status);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      }
    });
  }

  public async stop(): Promise<void> {
    this.status = 'INACTIVE';
    this.emit('status', this.status);

    if (this.process) {
      const proc = this.process;
      this.cleanup();

      return new Promise<void>((resolve) => {
        const killTimer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 3000);

        proc.once('exit', () => {
          clearTimeout(killTimer);
          resolve();
        });

        try {
          proc.kill('SIGINT');
        } catch {
          proc.kill('SIGTERM');
        }
      });
    }
  }

  public buildFFmpegArgs(config: StreamConfig, source: CaptureSource, rtmpDest: string): string[] {
    const args: string[] = ['-y'];

    // Video Capture Input
    if (source.type === 'x11') {
      args.push(
        '-f', 'x11grab',
        '-video_size', `${config.width}x${config.height}`,
        '-framerate', `${config.fps}`,
        '-i', source.displayOrDevice
      );
    } else if (source.type === 'gdigrab') {
      args.push(
        '-f', 'gdigrab',
        '-framerate', `${config.fps}`,
        '-i', source.displayOrDevice || 'desktop'
      );
    } else {
      // High-performance synthetic test pattern with real timecodes and audio for dev/CI
      args.push(
        '-f', 'lavfi',
        '-i', `testsrc=size=${config.width}x${config.height}:rate=${config.fps}`
      );
    }

    // Audio Input (Generates silent stereo AAC or sine tone so YouTube doesn't reject video-only stream)
    args.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'
    );

    // Video Encoding Settings (YouTube Live optimized)
    args.push(
      '-c:v', 'libx264',
      '-preset', config.preset || 'veryfast',
      '-b:v', config.videoBitrate,
      '-maxrate', config.videoBitrate,
      '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p',
      '-g', `${config.fps * config.keyframeInterval}`,
      '-keyint_min', `${config.fps * config.keyframeInterval}`
    );

    // Audio Encoding Settings
    args.push(
      '-c:a', 'aac',
      '-b:a', config.audioBitrate,
      '-ar', '44100',
      '-shortest'
    );

    // Ingest output format: Single FLV or Multi-Stream Tee Muxer
    if (config.destinations && config.destinations.filter(d => d.enabled).length > 1) {
      const multiManager = MultiStreamManager.getInstance();
      const multiArgs = multiManager.buildFFmpegOutputArgs(config);
      args.push(...multiArgs);
    } else {
      const multiManager = MultiStreamManager.getInstance();
      const activeTarget = config.destinations?.find(d => d.enabled);
      const targetUrl = activeTarget
        ? multiManager.buildFullUrl(activeTarget)
        : rtmpDest;
      args.push(
        '-f', 'flv',
        targetUrl
      );
    }

    return args;
  }

  private parseProgress(text: string): void {
    // Matches: frame=  123 fps= 30.0 q=28.0 size=    1024kB time=00:00:04.10 bitrate=2048.0kbits/s speed=1.0x
    const frameMatch = text.match(/frame=\s*(\d+)/);
    const fpsMatch = text.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = text.match(/bitrate=\s*([\d.]+)kbits\/s/);
    const speedMatch = text.match(/speed=\s*([\d.]+)x/);

    if (frameMatch) {
      const frameCount = parseInt(frameMatch[1], 10);
      this.metrics.totalFrames = frameCount;
      this.lastFrameUpdate = Date.now();

      if (this.status === 'INGEST_CONNECTED' || this.status === 'ENCODER_RUNNING') {
        if (frameCount > 30) {
          this.status = 'LIVE_CONFIRMED';
          this.emit('status', this.status);
        }
      }
    }

    if (fpsMatch) {
      this.metrics.fps = parseFloat(fpsMatch[1]);
    }

    if (bitrateMatch) {
      this.metrics.bitrateKbps = parseFloat(bitrateMatch[1]);
    }

    if (speedMatch) {
      this.metrics.speed = parseFloat(speedMatch[1]);
    }

    this.emit('metrics', this.getMetrics());
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);

    this.watchdogTimer = setInterval(() => {
      if (this.status === 'LIVE_CONFIRMED' || this.status === 'ENCODER_RUNNING') {
        const timeSinceLastFrame = Date.now() - this.lastFrameUpdate;
        // If no frame progress parsed in 12 seconds while running, declare stalled
        if (timeSinceLastFrame > 12000) {
          this.emit('log', {
            level: 'error',
            message: `Encoder watchdog detected stall: no frames received in ${Math.round(timeSinceLastFrame / 1000)}s`
          });
          this.status = 'RECONNECTING';
          this.emit('status', this.status);
          this.emit('stalled');
        }
      }
    }, 4000);
  }

  private cleanup(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.process = null;
  }
}

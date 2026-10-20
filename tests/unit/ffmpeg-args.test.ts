import { describe, it, expect } from 'vitest';
import { FFmpegProvider } from '@autoplay/streaming';

describe('FFmpegProvider Argument Construction', () => {
  const provider = new FFmpegProvider();

  it('should construct valid argument arrays for x11 capture without shell interpolation', () => {
    const config = {
      provider: 'ffmpeg' as const,
      rtmpUrl: 'rtmp://localhost:1935/live/test',
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrate: '2500k',
      audioBitrate: '128k',
      keyframeInterval: 2,
      preset: 'veryfast',
      overlayEnabled: true
    };

    const source = {
      type: 'x11' as const,
      displayOrDevice: ':99.0',
      width: 1280,
      height: 720,
      fps: 30
    };

    const args = provider.buildFFmpegArgs(config, source, 'rtmp://localhost:1935/live/test');

    expect(args).toContain('-f');
    expect(args).toContain('x11grab');
    expect(args).toContain(':99.0');
    expect(args).toContain('libx264');
    expect(args).toContain('2500k');
    expect(args).toContain('flv');
  });

  it('should fall back to synthetic test pattern when no screen is present', () => {
    const config = {
      provider: 'ffmpeg' as const,
      rtmpUrl: 'rtmp://localhost:1935/live/test',
      width: 1280,
      height: 720,
      fps: 30,
      videoBitrate: '2500k',
      audioBitrate: '128k',
      keyframeInterval: 2,
      preset: 'veryfast',
      overlayEnabled: true
    };

    const source = {
      type: 'test_pattern' as const,
      displayOrDevice: 'test_pattern',
      width: 1280,
      height: 720,
      fps: 30
    };

    const args = provider.buildFFmpegArgs(config, source, 'rtmp://localhost:1935/live/test');

    expect(args).toContain('lavfi');
    expect(args).toContain('testsrc=size=1280x720:rate=30');
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=44100');
  });
});

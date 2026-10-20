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

  it('should generate tee muxer arguments when multiple stream destinations are provided', () => {
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
      overlayEnabled: true,
      destinations: [
        {
          id: 'yt-1',
          name: 'YouTube',
          platform: 'youtube' as const,
          rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: 'live-key-yt',
          enabled: true
        },
        {
          id: 'tw-1',
          name: 'Twitch',
          platform: 'twitch' as const,
          rtmpUrl: 'rtmp://live.twitch.tv/app',
          streamKey: 'live-key-tw',
          enabled: true
        }
      ]
    };

    const source = {
      type: 'test_pattern' as const,
      displayOrDevice: 'test_pattern',
      width: 1280,
      height: 720,
      fps: 30
    };

    const args = provider.buildFFmpegArgs(config, source, 'rtmp://localhost:1935/live/test');

    expect(args).toContain('-f');
    expect(args).toContain('tee');
    expect(args).toContain('-map');
    expect(args).toContain('0:v');
    expect(args).toContain('1:a');

    const teeMuxerArg = args.find(arg => arg.includes('[f=flv:onfail=ignore]'));
    expect(teeMuxerArg).toBeDefined();
    expect(teeMuxerArg).toContain('[f=flv:onfail=ignore]rtmp://a.rtmp.youtube.com/live2/live-key-yt');
    expect(teeMuxerArg).toContain('[f=flv:onfail=ignore]rtmp://live.twitch.tv/app/live-key-tw');
  });
});


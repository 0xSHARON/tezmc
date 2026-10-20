import { EventEmitter } from 'node:events';
import { StreamDestination, StreamConfig, SecretRedactor } from '@autoplay/shared';

export interface DestinationStatus {
  id: string;
  name: string;
  platform: 'youtube' | 'twitch' | 'kick' | 'tiktok' | 'facebook' | 'custom';
  status: 'ONLINE' | 'STANDBY' | 'ERROR' | 'CONNECTING';
  rtmpUrl: string;
  hasKey: boolean;
  enabled: boolean;
  lastConnected?: string;
  error?: string;
}

export const PLATFORM_PRESETS = {
  youtube: {
    name: 'YouTube Live',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    defaultPort: 1935
  },
  twitch: {
    name: 'Twitch',
    rtmpUrl: 'rtmp://live.twitch.tv/app',
    defaultPort: 1935
  },
  kick: {
    name: 'Kick Gaming',
    rtmpUrl: 'rtmp://fa7237941400.global-contribute.live-video.net/app',
    defaultPort: 1935
  },
  tiktok: {
    name: 'TikTok Live',
    rtmpUrl: 'rtmps://live-upload.tiktok.com:443/app',
    defaultPort: 443
  },
  facebook: {
    name: 'Facebook Live',
    rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
    defaultPort: 443
  },
  custom: {
    name: 'Custom RTMP Server',
    rtmpUrl: '',
    defaultPort: 1935
  }
} as const;

export class MultiStreamManager extends EventEmitter {
  private static instance: MultiStreamManager | null = null;
  private destinations: Map<string, StreamDestination> = new Map();
  private statuses: Map<string, DestinationStatus> = new Map();

  public static getInstance(): MultiStreamManager {
    if (!MultiStreamManager.instance) {
      MultiStreamManager.instance = new MultiStreamManager();
    }
    return MultiStreamManager.instance;
  }

  constructor() {
    super();
    this.initDefaults();
  }

  private initDefaults(): void {
    // Default YouTube primary destination
    const ytId = 'dest-yt-primary';
    const primaryYt: StreamDestination = {
      id: ytId,
      name: 'YouTube Live (Primary)',
      platform: 'youtube',
      rtmpUrl: PLATFORM_PRESETS.youtube.rtmpUrl,
      streamKey: process.env.YOUTUBE_STREAM_KEY || '',
      enabled: true
    };
    this.destinations.set(ytId, primaryYt);
    this.statuses.set(ytId, {
      id: ytId,
      name: primaryYt.name,
      platform: primaryYt.platform,
      status: 'STANDBY',
      rtmpUrl: primaryYt.rtmpUrl,
      hasKey: !!primaryYt.streamKey,
      enabled: true
    });
  }

  public addDestination(input: Omit<StreamDestination, 'id'> & { id?: string }): StreamDestination {
    const id = input.id || `dest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const dest: StreamDestination = {
      id,
      name: input.name || PLATFORM_PRESETS[input.platform]?.name || 'Live Destination',
      platform: input.platform || 'custom',
      rtmpUrl: input.rtmpUrl || (PLATFORM_PRESETS[input.platform]?.rtmpUrl || ''),
      streamKey: input.streamKey || '',
      enabled: input.enabled !== undefined ? input.enabled : true
    };

    this.destinations.set(id, dest);
    this.statuses.set(id, {
      id,
      name: dest.name,
      platform: dest.platform,
      status: 'STANDBY',
      rtmpUrl: dest.rtmpUrl,
      hasKey: !!dest.streamKey,
      enabled: dest.enabled
    });

    this.emit('destinations:updated', this.getSanitizedDestinations());
    return dest;
  }

  public updateDestination(id: string, updates: Partial<StreamDestination>): StreamDestination | null {
    const existing = this.destinations.get(id);
    if (!existing) return null;

    const updated: StreamDestination = {
      ...existing,
      ...updates,
      id
    };

    this.destinations.set(id, updated);
    const prevStatus = this.statuses.get(id);
    this.statuses.set(id, {
      id,
      name: updated.name,
      platform: updated.platform,
      status: prevStatus?.status || 'STANDBY',
      rtmpUrl: updated.rtmpUrl,
      hasKey: !!updated.streamKey,
      enabled: updated.enabled
    });

    this.emit('destinations:updated', this.getSanitizedDestinations());
    return updated;
  }

  public removeDestination(id: string): boolean {
    const removed = this.destinations.delete(id);
    this.statuses.delete(id);
    if (removed) {
      this.emit('destinations:updated', this.getSanitizedDestinations());
    }
    return removed;
  }

  public toggleDestination(id: string, enabled: boolean): StreamDestination | null {
    return this.updateDestination(id, { enabled });
  }

  public setDestinationStatus(id: string, status: DestinationStatus['status'], error?: string): void {
    const current = this.statuses.get(id);
    if (current) {
      current.status = status;
      if (status === 'ONLINE') {
        current.lastConnected = new Date().toISOString();
      }
      if (error) {
        current.error = error;
      }
      this.emit('status:changed', { id, status, error });
    }
  }

  public getDestinations(): StreamDestination[] {
    return Array.from(this.destinations.values());
  }

  public getSanitizedDestinations(): (Omit<StreamDestination, 'streamKey'> & { hasKey: boolean; status: string })[] {
    return Array.from(this.destinations.values()).map(d => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      rtmpUrl: d.rtmpUrl,
      enabled: d.enabled,
      hasKey: !!d.streamKey && d.streamKey.length > 0,
      status: this.statuses.get(d.id)?.status || 'STANDBY'
    }));
  }

  public getActiveDestinations(): StreamDestination[] {
    return Array.from(this.destinations.values()).filter(d => d.enabled);
  }

  public buildFullUrl(dest: StreamDestination): string {
    if (!dest.streamKey) {
      return dest.rtmpUrl;
    }
    const cleanUrl = dest.rtmpUrl.replace(/\/$/, '');
    return `${cleanUrl}/${dest.streamKey}`;
  }

  /**
   * Generates FFmpeg output arguments.
   * If single target: returns ['-f', 'flv', url]
   * If multi target: returns native tee muxer:
   * ['-f', 'tee', '-map', '0:v', '-map', '1:a', '[f=flv:onfail=ignore]url1|[f=flv:onfail=ignore]url2']
   */
  public buildFFmpegOutputArgs(config: StreamConfig, overrideTargets?: StreamDestination[]): string[] {
    const targets = (overrideTargets && overrideTargets.length > 0)
      ? overrideTargets
      : (config.destinations && config.destinations.length > 0)
        ? config.destinations.filter(d => d.enabled)
        : this.getActiveDestinations();

    // Fallback: single primary destination from config.rtmpUrl
    if (targets.length <= 1) {
      const primary = targets[0];
      const targetUrl = primary
        ? this.buildFullUrl(primary)
        : config.streamKey
          ? `${config.rtmpUrl.replace(/\/$/, '')}/${config.streamKey}`
          : config.rtmpUrl;

      return ['-f', 'flv', targetUrl];
    }

    // Multi-Destination Tee Muxer with onfail=ignore
    const teeParts = targets.map(t => {
      const fullUrl = this.buildFullUrl(t);
      return `[f=flv:onfail=ignore]${fullUrl}`;
    });

    return [
      '-f', 'tee',
      '-map', '0:v',
      '-map', '1:a',
      teeParts.join('|')
    ];
  }
}

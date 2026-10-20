import { EventEmitter } from 'node:events';
import { ChatMessage } from '@autoplay/shared';
import { IChatProvider } from './types.js';

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/))([a-zA-Z0-9_-]{11})/i,
    /watch\?.*v=([a-zA-Z0-9_-]{11})/i
  ];
  for (const p of patterns) {
    const match = trimmed.match(p);
    if (match && match[1]) return match[1];
  }
  return null;
}

export class MockChatProvider extends EventEmitter implements IChatProvider {
  public readonly id = 'mock-chat-provider';
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private intervalMs: number;

  private mockUsers = [
    'PixelCrafter_YT',
    'DiamondHunter99',
    'RedstonePro',
    'BlockyExplorer',
    'Alex_Plays',
    'NeonGamerLive',
    'AstroBotFan',
    'VoxelMaster',
    'LunaStream_YT',
    'EchoCoder'
  ];

  private mockComments = [
    'How far are we from the spawn point?',
    'Awesome gameplay! Love the stream quality!',
    '!coords',
    'Are we finding diamonds today? Let\'s go!',
    '!jump',
    'Watch out for creepers behind that hill!',
    '!status',
    'Subscribed! 1080p60 looks super crisp!',
    '!explore 75',
    'TEZMC is really smooth on YouTube!',
    '!jump',
    'Check out that cave entrance on the right!'
  ];

  constructor(intervalMs: number = 8000) {
    super();
    this.intervalMs = intervalMs;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.timer = setInterval(() => {
      this.generateMockMessage();
    }, this.intervalMs);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public injectMessage(
    author: string,
    message: string,
    badge: 'viewer' | 'moderator' | 'sponsor' | 'vip' | 'owner' = 'viewer',
    authorPhotoUrl?: string,
    superChatAmount?: string
  ): ChatMessage {
    const isCommand = message.trim().startsWith('!');
    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      author,
      message,
      timestamp: Date.now(),
      badge,
      isCommand,
      authorPhotoUrl,
      superChatAmount,
      source: 'youtube'
    };

    this.emit('message', msg);
    return msg;
  }

  private generateMockMessage(): void {
    const author = this.mockUsers[Math.floor(Math.random() * this.mockUsers.length)];
    const message = this.mockComments[Math.floor(Math.random() * this.mockComments.length)];
    const roll = Math.random();
    const badge = roll < 0.05 ? 'owner' : roll < 0.2 ? 'sponsor' : (roll < 0.3 ? 'moderator' : 'viewer');
    const superChatAmount = roll < 0.08 ? '$5.00' : undefined;

    this.injectMessage(author, message, badge, undefined, superChatAmount);
  }
}

export interface YouTubeChatOptions {
  apiKey?: string;
  videoId?: string;
  liveUrl?: string;
  liveChatId?: string;
  pollIntervalMs?: number;
}

export class YouTubeLiveChatProvider extends EventEmitter implements IChatProvider {
  public readonly id = 'youtube-live-chat';
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private nextPageToken: string | null = null;
  private apiKey: string;
  private videoId: string | null = null;
  private liveChatId: string | null = null;
  private pollIntervalMs: number;
  private connectionStatus: 'DISCONNECTED' | 'RESOLVING' | 'CONNECTING' | 'LISTENING' | 'ERROR' = 'DISCONNECTED';
  private lastErrorMessage = '';
  private messageCount = 0;

  constructor(optionsOrApiKey: string | YouTubeChatOptions, liveChatId?: string) {
    super();

    if (typeof optionsOrApiKey === 'string') {
      this.apiKey = optionsOrApiKey;
      this.liveChatId = liveChatId || null;
      this.pollIntervalMs = 5000;
    } else {
      this.apiKey = optionsOrApiKey.apiKey || process.env.YOUTUBE_API_KEY || '';
      this.liveChatId = optionsOrApiKey.liveChatId || process.env.YOUTUBE_LIVE_CHAT_ID || null;
      this.pollIntervalMs = optionsOrApiKey.pollIntervalMs || 5000;

      const rawVideo = optionsOrApiKey.videoId || optionsOrApiKey.liveUrl || process.env.YOUTUBE_LIVE_URL || process.env.YOUTUBE_VIDEO_ID;
      if (rawVideo) {
        this.videoId = extractYouTubeVideoId(rawVideo);
      }
    }
  }

  public getStatus() {
    return {
      running: this.running,
      status: this.connectionStatus,
      videoId: this.videoId,
      liveChatId: this.liveChatId,
      hasApiKey: !!this.apiKey,
      messageCount: this.messageCount,
      lastError: this.lastErrorMessage || undefined
    };
  }

  public setVideo(videoOrUrl: string): void {
    this.videoId = extractYouTubeVideoId(videoOrUrl);
    this.liveChatId = null;
    this.nextPageToken = null;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // 1. Resolve liveChatId if not provided but videoId + apiKey exist
    if (!this.liveChatId && this.videoId && this.apiKey) {
      this.connectionStatus = 'RESOLVING';
      this.emit('status', this.connectionStatus);
      await this.resolveLiveChatId();
    }

    if (this.liveChatId && this.apiKey) {
      this.connectionStatus = 'CONNECTING';
      this.emit('status', this.connectionStatus);
      this.poll();
    } else {
      // Standby mode waiting for active live stream details
      this.connectionStatus = 'LISTENING';
      this.emit('status', this.connectionStatus);
    }
  }

  public async stop(): Promise<void> {
    this.running = false;
    this.connectionStatus = 'DISCONNECTED';
    this.emit('status', this.connectionStatus);
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public injectMessage(
    author: string,
    message: string,
    badge: 'viewer' | 'moderator' | 'sponsor' | 'vip' | 'owner' = 'viewer',
    authorPhotoUrl?: string,
    superChatAmount?: string
  ): ChatMessage {
    const isCommand = message.trim().startsWith('!');
    const msg: ChatMessage = {
      id: `yt-inj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      author,
      message,
      timestamp: Date.now(),
      badge,
      isCommand,
      authorPhotoUrl,
      superChatAmount,
      source: 'youtube'
    };

    this.messageCount++;
    this.emit('message', msg);
    return msg;
  }

  private async resolveLiveChatId(): Promise<void> {
    if (!this.videoId || !this.apiKey) return;

    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${this.videoId}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        const item = data.items?.[0];
        const activeChatId = item?.liveStreamingDetails?.activeLiveChatId;
        if (activeChatId) {
          this.liveChatId = activeChatId;
          this.connectionStatus = 'CONNECTING';
          this.emit('status', this.connectionStatus);
        } else {
          this.lastErrorMessage = 'Video found, but no activeLiveChatId detected (is stream live?)';
        }
      } else {
        const errText = await res.text();
        this.lastErrorMessage = `YouTube API Error ${res.status}: ${errText.substring(0, 100)}`;
      }
    } catch (err: any) {
      this.lastErrorMessage = `Failed to resolve liveChatId: ${err?.message || err}`;
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    if (!this.liveChatId && this.videoId && this.apiKey) {
      await this.resolveLiveChatId();
    }

    if (!this.liveChatId || !this.apiKey) {
      if (this.running) {
        this.pollTimer = setTimeout(() => this.poll(), 8000);
      }
      return;
    }

    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${this.liveChatId}&part=snippet,authorDetails&key=${this.apiKey}`;
      if (this.nextPageToken) {
        url += `&pageToken=${this.nextPageToken}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        this.nextPageToken = data.nextPageToken || null;
        this.connectionStatus = 'LISTENING';

        if (data.pollingIntervalMillis) {
          this.pollIntervalMs = Math.max(2500, data.pollingIntervalMillis);
        }

        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const author = item.authorDetails?.displayName || 'YouTube User';
            const message = item.snippet?.displayMessage || item.snippet?.textMessageDetails?.messageText || '';
            const isCommand = message.trim().startsWith('!');

            let badge: ChatMessage['badge'] = 'viewer';
            if (item.authorDetails?.isChatOwner) {
              badge = 'owner';
            } else if (item.authorDetails?.isChatModerator) {
              badge = 'moderator';
            } else if (item.authorDetails?.isChatSponsor) {
              badge = 'sponsor';
            }

            const authorPhotoUrl = item.authorDetails?.profileImageUrl;
            const superChatAmount = item.snippet?.superChatDetails?.amountDisplayString;

            const msg: ChatMessage = {
              id: item.id || `yt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              author,
              message,
              timestamp: new Date(item.snippet?.publishedAt || Date.now()).getTime(),
              badge,
              isCommand,
              authorPhotoUrl,
              superChatAmount,
              source: 'youtube'
            };

            this.messageCount++;
            this.emit('message', msg);
          }
        }
      } else if (res.status === 403 || res.status === 404) {
        const errText = await res.text();
        this.lastErrorMessage = `YouTube Live Chat API ${res.status}: ${errText.substring(0, 100)}`;
        this.connectionStatus = 'ERROR';
        this.emit('status', this.connectionStatus);
      }
    } catch (err: any) {
      this.lastErrorMessage = `Poll error: ${err?.message || err}`;
    } finally {
      if (this.running) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
      }
    }
  }
}

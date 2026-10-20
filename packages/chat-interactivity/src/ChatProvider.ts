import { EventEmitter } from 'node:events';
import { ChatMessage } from '@autoplay/shared';
import { IChatProvider } from './types.js';

export class MockChatProvider extends EventEmitter implements IChatProvider {
  public readonly id = 'mock-chat-provider';
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private intervalMs: number;

  private mockUsers = [
    'PixelCrafter',
    'DiamondHunter99',
    'RedstonePro',
    'BlockyExplorer',
    'Alex_Plays',
    'NeonGamer',
    'AstroBotFan',
    'VoxelMaster',
    'LunaStream',
    'EchoCoder'
  ];

  private mockComments = [
    'How far are we from the spawn point?',
    'Nice pathfinding!',
    '!coords',
    'Are we finding diamonds today?',
    '!jump',
    'Watch out for creepers behind that hill!',
    '!status',
    'Stream quality looks super crisp today 1080p60!',
    '!explore 75',
    'AutoPlay AI is really smooth!',
    '!jump',
    'Check out that cave entrance on the right!'
  ];

  constructor(intervalMs: number = 10000) {
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

  public injectMessage(author: string, message: string, badge: 'viewer' | 'moderator' | 'sponsor' | 'vip' = 'viewer'): ChatMessage {
    const isCommand = message.trim().startsWith('!');
    const msg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      author,
      message,
      timestamp: Date.now(),
      badge,
      isCommand
    };

    this.emit('message', msg);
    return msg;
  }

  private generateMockMessage(): void {
    const author = this.mockUsers[Math.floor(Math.random() * this.mockUsers.length)];
    const message = this.mockComments[Math.floor(Math.random() * this.mockComments.length)];
    const badge = Math.random() < 0.2 ? 'sponsor' : (Math.random() < 0.1 ? 'vip' : 'viewer');
    this.injectMessage(author, message, badge);
  }
}

export class YouTubeLiveChatProvider extends EventEmitter implements IChatProvider {
  public readonly id = 'youtube-live-chat';
  private running = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private nextPageToken: string | null = null;
  private apiKey: string;
  private liveChatId: string;
  private pollIntervalMs = 5000;

  constructor(apiKey: string, liveChatId: string) {
    super();
    this.apiKey = apiKey;
    this.liveChatId = liveChatId;
  }

  public async start(): Promise<void> {
    if (this.running || !this.apiKey || !this.liveChatId) return;
    this.running = true;
    this.poll();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${this.liveChatId}&part=snippet,authorDetails&key=${this.apiKey}`;
      if (this.nextPageToken) {
        url += `&pageToken=${this.nextPageToken}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as any;
        this.nextPageToken = data.nextPageToken || null;
        if (data.pollingIntervalMillis) {
          this.pollIntervalMs = Math.max(3000, data.pollingIntervalMillis);
        }

        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const author = item.authorDetails?.displayName || 'Anonymous';
            const message = item.snippet?.displayMessage || '';
            const isCommand = message.trim().startsWith('!');
            const badge = item.authorDetails?.isChatOwner || item.authorDetails?.isChatModerator ? 'moderator' : (item.authorDetails?.isChatSponsor ? 'sponsor' : 'viewer');

            const msg: ChatMessage = {
              id: item.id || `yt-${Date.now()}`,
              author,
              message,
              timestamp: new Date(item.snippet?.publishedAt || Date.now()).getTime(),
              badge,
              isCommand
            };
            this.emit('message', msg);
          }
        }
      }
    } catch {
      // In case of network / auth error, backoff gracefully
    } finally {
      if (this.running) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
      }
    }
  }
}

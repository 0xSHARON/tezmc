import { EventEmitter } from 'node:events';
import { ChatMessage, CommentaryItem, GameAdapter, GameProgress } from '@autoplay/shared';
import { IChatProvider } from './types.js';
import { MockChatProvider, YouTubeLiveChatProvider, YouTubeChatOptions } from './ChatProvider.js';
import { CommandRegistry } from './CommandRegistry.js';
import { CommentatorEngine } from './CommentatorEngine.js';

export class ChatManager extends EventEmitter {
  private provider: IChatProvider;
  private commandRegistry: CommandRegistry;
  private commentator: CommentatorEngine;
  private activeAdapter: GameAdapter | null = null;
  private chatHistory: ChatMessage[] = [];
  private maxHistory = 50;

  constructor(provider?: IChatProvider) {
    super();

    // Check if YouTube live stream is pre-configured via environment
    if (!provider && (process.env.YOUTUBE_LIVE_URL || process.env.YOUTUBE_VIDEO_ID || process.env.YOUTUBE_API_KEY)) {
      this.provider = new YouTubeLiveChatProvider({
        apiKey: process.env.YOUTUBE_API_KEY,
        liveUrl: process.env.YOUTUBE_LIVE_URL,
        videoId: process.env.YOUTUBE_VIDEO_ID,
        liveChatId: process.env.YOUTUBE_LIVE_CHAT_ID
      });
    } else {
      this.provider = provider || new MockChatProvider();
    }

    this.commandRegistry = new CommandRegistry();
    this.commentator = new CommentatorEngine();

    this.setupListeners();
  }

  private setupListeners(): void {
    this.provider.on('message', async (msg: ChatMessage) => {
      this.chatHistory.push(msg);
      if (this.chatHistory.length > this.maxHistory) {
        this.chatHistory.shift();
      }

      this.emit('chat:message', msg);

      // Check if command
      if (msg.isCommand || msg.message.trim().startsWith('!')) {
        const result = await this.commandRegistry.execute(msg.message, msg.author, this.activeAdapter);
        if (result) {
          this.emit('chat:command', {
            message: msg,
            result
          });

          if (result.success) {
            const cmdName = msg.message.trim().slice(1).split(/\s+/)[0];
            this.commentator.onCommandExecuted(cmdName, msg.author, result.message);
          }
        }
      }
    });

    this.commentator.on('speech', (item: CommentaryItem) => {
      this.emit('commentary:speech', item);
    });
  }

  public async setProvider(newProvider: IChatProvider): Promise<void> {
    if (this.provider) {
      await this.provider.stop().catch(() => {});
      (this.provider as any).removeAllListeners?.('message');
    }

    this.provider = newProvider;
    this.setupListeners();
    await this.provider.start();
    this.emit('provider:changed', { providerId: this.provider.id });
  }

  public async connectYouTube(options: YouTubeChatOptions): Promise<boolean> {
    const ytProvider = new YouTubeLiveChatProvider(options);
    await this.setProvider(ytProvider);
    return true;
  }

  public async useMock(): Promise<void> {
    const mock = new MockChatProvider();
    await this.setProvider(mock);
  }

  public setActiveAdapter(adapter: GameAdapter | null): void {
    this.activeAdapter = adapter;
    if (adapter) {
      adapter.on?.('progress', (progress: GameProgress) => {
        this.commentator.onGameProgress(progress);
      });
    }
  }

  public async start(): Promise<void> {
    await this.provider.start();
  }

  public async stop(): Promise<void> {
    await this.provider.stop();
  }

  public injectMessage(
    author: string,
    message: string,
    badge: 'viewer' | 'moderator' | 'sponsor' | 'vip' | 'owner' = 'viewer',
    authorPhotoUrl?: string,
    superChatAmount?: string
  ): ChatMessage {
    if (this.provider instanceof MockChatProvider || this.provider instanceof YouTubeLiveChatProvider) {
      return (this.provider as any).injectMessage(author, message, badge, authorPhotoUrl, superChatAmount);
    }

    const msg: ChatMessage = {
      id: `manual-${Date.now()}`,
      author,
      message,
      timestamp: Date.now(),
      badge,
      isCommand: message.trim().startsWith('!'),
      authorPhotoUrl,
      superChatAmount,
      source: 'youtube'
    };
    (this.provider as any).emit?.('message', msg);
    return msg;
  }

  public getRecentChat(): ChatMessage[] {
    return [...this.chatHistory];
  }

  public getRecentCommentary(): CommentaryItem[] {
    return this.commentator.getHistory();
  }

  public getCommentator(): CommentatorEngine {
    return this.commentator;
  }

  public getProvider(): IChatProvider {
    return this.provider;
  }

  public getStatus() {
    const isYouTube = this.provider instanceof YouTubeLiveChatProvider;
    return {
      providerId: this.provider.id,
      isYouTube,
      details: isYouTube ? (this.provider as YouTubeLiveChatProvider).getStatus() : null,
      messageCount: this.chatHistory.length
    };
  }
}

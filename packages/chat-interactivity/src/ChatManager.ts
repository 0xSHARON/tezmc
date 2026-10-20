import { EventEmitter } from 'node:events';
import { ChatMessage, CommentaryItem, GameAdapter, GameProgress } from '@autoplay/shared';
import { IChatProvider } from './types.js';
import { MockChatProvider } from './ChatProvider.js';
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
    this.provider = provider || new MockChatProvider();
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

  public injectMessage(author: string, message: string): ChatMessage {
    if (this.provider instanceof MockChatProvider) {
      return this.provider.injectMessage(author, message);
    }

    const msg: ChatMessage = {
      id: `manual-${Date.now()}`,
      author,
      message,
      timestamp: Date.now(),
      badge: 'moderator',
      isCommand: message.trim().startsWith('!')
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
}

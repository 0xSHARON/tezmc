import { ChatMessage, CommentaryItem } from '@autoplay/shared';

export interface CommandContext {
  command: string;
  args: string[];
  rawMessage: string;
  author: string;
  timestamp: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
}

export interface IChatProvider {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage?(message: string): Promise<void>;
  on(event: 'message', listener: (msg: ChatMessage) => void): this;
  off(event: 'message', listener: (msg: ChatMessage) => void): this;
}

export type CommentaryMood = 'calm' | 'excited' | 'cautious' | 'curious';

export interface CommentatorOptions {
  speakerName?: string;
  enabled?: boolean;
  minIntervalSeconds?: number;
}

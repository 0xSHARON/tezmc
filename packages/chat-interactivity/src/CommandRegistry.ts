import { GameAdapter } from '@autoplay/shared';
import { CommandContext, CommandResult } from './types.js';

export class CommandRegistry {
  private userCooldowns = new Map<string, number>();
  private lastGlobalCommandTime = 0;
  private readonly globalCooldownMs: number;
  private readonly userCooldownMs: number;

  constructor(globalCooldownMs = 1500, userCooldownMs = 4000) {
    this.globalCooldownMs = globalCooldownMs;
    this.userCooldownMs = userCooldownMs;
  }

  public async execute(
    rawText: string,
    author: string,
    adapter?: GameAdapter | null
  ): Promise<CommandResult | null> {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith('!')) {
      return null;
    }

    const now = Date.now();

    // Check Global Cooldown
    if (now - this.lastGlobalCommandTime < this.globalCooldownMs) {
      return { success: false, message: 'Commands are being sent too quickly! Please wait a moment.' };
    }

    // Check Per-User Cooldown
    const lastUserTime = this.userCooldowns.get(author) || 0;
    if (now - lastUserTime < this.userCooldownMs) {
      const waitSec = Math.ceil((this.userCooldownMs - (now - lastUserTime)) / 1000);
      return { success: false, message: `@${author}, please wait ${waitSec}s before sending another command.` };
    }

    // Parse command & args
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).map(arg => arg.replace(/[^\w\s-.,]/g, '').slice(0, 50)); // sanitize

    // Built-in commands
    if (command === 'help') {
      return {
        success: true,
        message: 'Available commands: !jump, !roll, !left, !right, !hoverboard, !stats, !about'
      };
    }

    if (command === 'about') {
      return {
        success: true,
        message: 'TEZMC: Autonomous 24/7 gaming platform that controls game-specific bots, captures real gameplay, and streams to YouTube Live.'
      };
    }

    // Forward to active adapter if supported
    if (adapter && typeof adapter.handleCommand === 'function') {
      try {
        const result = await adapter.handleCommand(command, args, author);
        this.lastGlobalCommandTime = now;
        this.userCooldowns.set(author, now);
        return result;
      } catch (err: any) {
        return { success: false, message: `Command execution failed: ${err.message}` };
      }
    }

    return {
      success: false,
      message: `No active game session or command !${command} is not supported by the current adapter.`
    };
  }
}

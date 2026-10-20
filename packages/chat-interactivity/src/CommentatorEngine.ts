import { EventEmitter } from 'node:events';
import { CommentaryItem, GameProgress } from '@autoplay/shared';
import { CommentatorOptions, CommentaryMood } from './types.js';

export class CommentatorEngine extends EventEmitter {
  private speakerName: string;
  private enabled: boolean;
  private minIntervalSeconds: number;
  private lastCommentaryTime = 0;
  private history: CommentaryItem[] = [];

  private ambientRemarks = [
    { text: 'Terrain generation around this sector is quite scenic.', mood: 'calm' as CommentaryMood },
    { text: 'Analyzing optimal waypoints to keep exploration efficient.', mood: 'curious' as CommentaryMood },
    { text: 'Sunlight is shifting nicely over the landscape.', mood: 'calm' as CommentaryMood },
    { text: 'Autonomous pathfinding loop running at target tick rate.', mood: 'calm' as CommentaryMood },
    { text: 'Keeping our inventory organized as we venture further outward.', mood: 'curious' as CommentaryMood },
    { text: 'Always scan the surroundings—unattended exploration never sleeps!', mood: 'excited' as CommentaryMood }
  ];

  constructor(options: CommentatorOptions = {}) {
    super();
    this.speakerName = options.speakerName || 'AutoPlay AI Narrator';
    this.enabled = options.enabled ?? true;
    this.minIntervalSeconds = options.minIntervalSeconds ?? 20;
  }

  public onGameProgress(progress: GameProgress): void {
    if (!this.enabled) return;
    const now = Date.now();

    // Health warning reaction
    if (progress.details?.health !== undefined && progress.details.health <= 8) {
      if (now - this.lastCommentaryTime > 10000) {
        this.speak('Health is dropping low! Playing defensively while we regenerate.', 'cautious');
        return;
      }
    }

    // Milestone distance reaction
    const blocks = progress.explorationStats?.blocksTraveled || 0;
    if (blocks > 0 && blocks % 100 === 0 && now - this.lastCommentaryTime > 15000) {
      this.speak(`Milestone reached: We have explored over ${blocks} blocks on this journey!`, 'excited');
      return;
    }

    // Ambient remark if idle
    if (now - this.lastCommentaryTime > this.minIntervalSeconds * 1000) {
      const remark = this.ambientRemarks[Math.floor(Math.random() * this.ambientRemarks.length)];
      this.speak(remark.text, remark.mood);
    }
  }

  public onCommandExecuted(command: string, author: string, message: string): void {
    if (!this.enabled) return;
    const replies = [
      `Thanks @${author} for triggering !${command}! Running it now.`,
      `Viewer @${author} asked for !${command}. Here we go!`,
      `Executing !${command} courtesy of @${author}. ${message}`
    ];
    const text = replies[Math.floor(Math.random() * replies.length)];
    this.speak(text, 'excited');
  }

  public speak(text: string, mood: CommentaryMood = 'calm'): CommentaryItem {
    const item: CommentaryItem = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      speaker: this.speakerName,
      text,
      mood,
      timestamp: Date.now()
    };

    this.lastCommentaryTime = item.timestamp;
    this.history.push(item);
    if (this.history.length > 50) {
      this.history.shift();
    }

    this.emit('speech', item);
    return item;
  }

  public getHistory(): CommentaryItem[] {
    return [...this.history];
  }
}

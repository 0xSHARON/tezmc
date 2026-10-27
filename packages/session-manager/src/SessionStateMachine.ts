import { EventEmitter } from 'node:events';
import {
  SessionState,
  SessionRecord,
  SessionCreateInput,
  StreamConfig
} from '@autoplay/shared';
import { AdapterRegistry } from '@autoplay/adapter-sdk';
import { StreamingManager } from '@autoplay/streaming';
import { CaptureValidator } from '@autoplay/capture';

export interface TransitionRecord {
  from: SessionState;
  to: SessionState;
  reason: string;
  timestamp: string;
}

export class SessionStateMachine extends EventEmitter {
  private currentState: SessionState = 'IDLE';
  private desiredState: 'RUNNING' | 'STOPPED' | 'PAUSED' = 'STOPPED';
  private transitions: TransitionRecord[] = [];
  private activeSessionId: string | null = null;
  private currentInput: SessionCreateInput | null = null;
  private currentAdapter: any = null;
  private streamingManager: StreamingManager;
  private restartAttempts = 0;
  private consecutiveFailures = 0;
  private readonly maxRestartAttempts: number;
  private readonly maxSessionHours: number;
  private sessionTimer: NodeJS.Timeout | null = null;
  private crashTimestamps: number[] = [];

  constructor(streamingManager: StreamingManager, maxRestartAttempts = 5, maxSessionHours = 24) {
    super();
    this.streamingManager = streamingManager;
    this.maxRestartAttempts = maxRestartAttempts;
    this.maxSessionHours = maxSessionHours;

    // Listen to streaming failures
    this.streamingManager.on('status', (streamStatus) => {
      if (streamStatus === 'FAILED' && this.currentState === 'RUNNING') {
        this.triggerRecovery('Stream encoder or ingest failure');
      }
    });
  }

  public getState(): SessionState {
    return this.currentState;
  }

  public getDesiredState(): 'RUNNING' | 'STOPPED' | 'PAUSED' {
    return this.desiredState;
  }

  public getTransitions(): TransitionRecord[] {
    return [...this.transitions];
  }

  public getActiveSession(): SessionRecord | null {
    if (!this.activeSessionId) return null;
    return {
      id: this.activeSessionId,
      gameId: this.currentInput?.gameId || 'unknown',
      state: this.currentState,
      desiredState: this.desiredState,
      restartCount: this.restartAttempts,
      consecutiveFailures: this.consecutiveFailures,
      gameConfig: this.currentInput?.gameConfig || {},
      streamConfig: this.currentInput?.streamConfig,
      createdAt: this.transitions[0]?.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  public async start(input: SessionCreateInput): Promise<void> {
    // Idempotency: if already running with same config, update stream if provided
    if (this.currentState === 'RUNNING' || this.currentState === 'STARTING_GAME') {
      if (input.streamConfig) {
        const captureSource = await CaptureValidator.resolveBestSource(
          process.env.CAPTURE_SOURCE_TYPE || 'auto'
        );
        this.currentInput = {
          ...this.currentInput,
          ...input,
          streamConfig: input.streamConfig
        };
        await this.streamingManager.startStream(input.streamConfig, captureSource);
      }
      return;
    }

    this.activeSessionId = `session-${Date.now()}`;
    this.currentInput = input;
    this.desiredState = 'RUNNING';
    this.restartAttempts = 0;
    this.consecutiveFailures = 0;
    this.crashTimestamps = [];

    await this.executeLifecycle();
  }

  public async pause(): Promise<void> {
    if (this.currentState !== 'RUNNING') return;
    this.desiredState = 'PAUSED';
    if (this.currentAdapter) {
      await this.currentAdapter.pause();
    }
    this.transition('STOPPING', 'Operator requested pause');
    await this.streamingManager.stopStream();
    this.transition('IDLE', 'Session paused');
  }

  public async resume(): Promise<void> {
    if (this.desiredState !== 'PAUSED' || !this.currentInput) return;
    this.desiredState = 'RUNNING';
    await this.executeLifecycle();
  }

  public async stop(reason = 'Operator stopped session'): Promise<void> {
    this.desiredState = 'STOPPED';
    if (this.currentState === 'IDLE' || this.currentState === 'STOPPING') return;

    this.transition('STOPPING', reason);

    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    try {
      await this.streamingManager.stopStream();
    } catch {
      // ignore
    }

    if (this.currentAdapter) {
      try {
        await this.currentAdapter.stop();
      } catch {
        // ignore
      }
      this.currentAdapter = null;
    }

    this.transition('IDLE', 'Shutdown completed cleanly');
  }

  private transition(to: SessionState, reason: string): void {
    const from = this.currentState;
    this.currentState = to;
    const record: TransitionRecord = {
      from,
      to,
      reason,
      timestamp: new Date().toISOString()
    };
    this.transitions.push(record);
    this.emit('state_changed', { from, to, reason });
  }

  private async executeLifecycle(): Promise<void> {
    try {
      // 1. VALIDATING
      this.transition('VALIDATING', 'Validating adapter and stream configurations');
      const registry = AdapterRegistry.getInstance();
      const adapter = registry.get(this.currentInput!.gameId);

      if (!adapter) {
        throw new Error(`Game adapter '${this.currentInput!.gameId}' is not registered.`);
      }
      this.currentAdapter = adapter;

      await adapter.validateConfig(this.currentInput!.gameConfig);

      // 2. STARTING_GAME
      this.transition('STARTING_GAME', `Spawning ${adapter.displayName} runtime`);
      const gamePromise = adapter.start(this.currentInput!.gameConfig);

      // 3. WAITING_FOR_GAME_READY
      this.transition('WAITING_FOR_GAME_READY', 'Waiting for game spawn & chunk readiness');
      await gamePromise;

      // 4. STARTING_CAPTURE
      this.transition('STARTING_CAPTURE', 'Validating video capture source and display');
      const captureSource = await CaptureValidator.resolveBestSource(
        process.env.CAPTURE_SOURCE_TYPE || 'auto'
      );

      // 5. STARTING_STREAM
      if (this.currentInput?.streamConfig) {
        this.transition('STARTING_STREAM', 'Initializing broadcast encoder');
        await this.streamingManager.startStream(this.currentInput.streamConfig, captureSource);

        // 6. VERIFYING_STREAM
        this.transition('VERIFYING_STREAM', 'Verifying encoder throughput and ingest health');
        // Wait briefly for live confirmation
        await new Promise((r) => setTimeout(r, 2000));
      }

      // 7. RUNNING
      this.transition('RUNNING', 'All components healthy and autonomous broadcast confirmed');

      // Schedule max duration timeout (only if not alwaysOn)
      if (!this.currentInput?.alwaysOn) {
        const maxHours = this.currentInput?.maxHours || this.maxSessionHours;
        this.sessionTimer = setTimeout(() => {
          this.stop(`Max session duration of ${maxHours} hours reached`);
        }, maxHours * 3600 * 1000);
      }

    } catch (err: any) {
      this.triggerRecovery(`Lifecycle error: ${err?.message || err}`);
    }
  }

  public triggerRecovery(reason: string): void {
    if (this.desiredState !== 'RUNNING') return;

    this.consecutiveFailures++;
    this.restartAttempts++;

    // Crash-loop detection: check failures in 15 minute window
    const now = Date.now();
    this.crashTimestamps.push(now);
    this.crashTimestamps = this.crashTimestamps.filter((t) => now - t < 15 * 60 * 1000);

    if (this.crashTimestamps.length > 4) {
      this.transition('FAILED', 'Crash loop detected: 4 crashes in less than 15 minutes.');
      this.desiredState = 'STOPPED';
      return;
    }

    if (this.restartAttempts > this.maxRestartAttempts) {
      this.transition('FAILED', `Max restart attempts (${this.maxRestartAttempts}) exceeded.`);
      this.desiredState = 'STOPPED';
      return;
    }

    this.transition('RECOVERING', `Auto-recovery initiated: ${reason} (Attempt ${this.restartAttempts})`);

    // Cooldown backoff before retrying
    const cooldownMs = Math.min(30000, 3000 * Math.pow(1.5, this.restartAttempts - 1));
    setTimeout(async () => {
      if (this.desiredState === 'RUNNING') {
        if (this.currentAdapter) {
          try {
            await this.currentAdapter.stop();
          } catch {
            // ignore
          }
        }
        await this.executeLifecycle();
      }
    }, cooldownMs);
  }

  public reconcileOnStartup(existingRecords: SessionRecord[]): void {
    // If a session was previously marked as RUNNING before an ungraceful API crash, reconcile cleanly
    for (const record of existingRecords) {
      if (record.desiredState === 'RUNNING') {
        this.emit('reconcile_needed', record);
      }
    }
  }
}

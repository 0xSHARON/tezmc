import { describe, it, expect, beforeAll } from 'vitest';
import { SessionStateMachine } from '@autoplay/session-manager';
import { StreamingManager } from '@autoplay/streaming';
import { AdapterRegistry } from '@autoplay/adapter-sdk';
import { ChromeDinoAdapter } from '@autoplay/adapter-chrome-dino';

describe('SessionStateMachine', () => {
  const streamingManager = new StreamingManager();
  const mockAdapter = new ChromeDinoAdapter();

  beforeAll(() => {
    const reg = AdapterRegistry.getInstance();
    if (!reg.has(mockAdapter.id)) {
      reg.register(mockAdapter);
    }
  });

  it('should initialize in IDLE state', () => {
    const sm = new SessionStateMachine(streamingManager);
    expect(sm.getState()).toBe('IDLE');
    expect(sm.getDesiredState()).toBe('STOPPED');
  });

  it('should transition through lifecycle to RUNNING when starting mock session', async () => {
    const sm = new SessionStateMachine(streamingManager, 3, 1);

    await sm.start({
      gameId: 'chrome-dino',
      gameConfig: {
        mode: 'autonomous_ai',
        speedMultiplier: 1.0,
        autoRestart: true,
        enableViewer: false
      },
      maxHours: 1,
      alwaysOn: false
    });

    const transitions = sm.getTransitions();
    if (sm.getState() !== 'RUNNING') {
      console.error('Transitions:', JSON.stringify(transitions, null, 2));
    }

    expect(sm.getState()).toBe('RUNNING');
    expect(sm.getDesiredState()).toBe('RUNNING');

    const stateNames = transitions.map((t) => t.to);
    expect(stateNames).toContain('VALIDATING');
    expect(stateNames).toContain('STARTING_GAME');
    expect(stateNames).toContain('WAITING_FOR_GAME_READY');
    expect(stateNames).toContain('RUNNING');

    await sm.stop('Test stop');
    expect(sm.getState()).toBe('IDLE');
    expect(sm.getDesiredState()).toBe('STOPPED');
  });

  it('should transition to FAILED if restart attempts exceed limit', () => {
    const sm = new SessionStateMachine(streamingManager, 2, 1);
    // Force running desired state
    (sm as any).desiredState = 'RUNNING';

    sm.triggerRecovery('Simulated fatal fault 1');
    expect(sm.getState()).toBe('RECOVERING');

    sm.triggerRecovery('Simulated fatal fault 2');
    expect(sm.getState()).toBe('RECOVERING');

    sm.triggerRecovery('Simulated fatal fault 3');
    expect(sm.getState()).toBe('FAILED');
    expect(sm.getDesiredState()).toBe('STOPPED');
  });
});

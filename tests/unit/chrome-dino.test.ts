import { describe, it, expect, afterAll } from 'vitest';
import { ChromeDinoAdapter } from '@autoplay/adapter-chrome-dino';

describe('Chrome Dinosaur AI Runner Adapter', () => {
  const adapter = new ChromeDinoAdapter();

  afterAll(async () => {
    await adapter.stop();
  });

  it('should initialize with correct capabilities and metadata', () => {
    expect(adapter.id).toBe('chrome-dino');
    expect(adapter.displayName).toContain('Chrome Dinosaur');
    expect(adapter.capabilities.supportsHeadlessVisuals).toBe(true);
  });

  it('should validate valid Chrome Dino configurations', async () => {
    await expect(adapter.validateConfig({
      mode: 'autonomous_ai',
      speedMultiplier: 1.0,
      autoRestart: true,
      viewerPort: 3019
    })).resolves.not.toThrow();
  });

  it('should start runner engine and handle jump and duck commands', async () => {
    await adapter.start({
      mode: 'autonomous_ai',
      speedMultiplier: 1.0,
      autoRestart: true,
      viewerPort: 3019,
      enableViewer: false
    });

    // Test jump command
    const jumpResult = await adapter.handleCommand('jump', [], 'Viewer1');
    expect(jumpResult.success).toBe(true);
    expect(jumpResult.message).toContain('Jump');

    // Test duck command
    const duckResult = await adapter.handleCommand('duck', [], 'Viewer2');
    expect(duckResult.success).toBe(true);

    // Verify status & progress
    const status = await adapter.getStatus();
    expect(status.state).toBe('CONNECTED');

    const progress = await adapter.getProgress();
    expect(progress.currentObjective).toContain('Score');
  });
});

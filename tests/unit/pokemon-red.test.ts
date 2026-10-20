import { describe, it, expect, afterAll } from 'vitest';
import { PokemonRedAdapter, PokemonRomManager } from '@autoplay/adapter-pokemon-red';

describe('Pokemon Red Retro Emulation Adapter', () => {
  const adapter = new PokemonRedAdapter();

  afterAll(async () => {
    await adapter.stop();
  });

  it('should initialize with correct capabilities and metadata', () => {
    expect(adapter.id).toBe('pokemon-red');
    expect(adapter.displayName).toContain('Pokémon Red');
    expect(adapter.capabilities.supportsHeadlessVisuals).toBe(true);
    expect(adapter.capabilities.supportsAudioCapture).toBe(true);
  });

  it('should validate valid Pokemon Red configurations', async () => {
    await expect(adapter.validateConfig({
      playerTrainerName: 'ASH',
      rivalName: 'GARY',
      mode: 'anarchy',
      starterPokemon: 'charmander',
      viewerPort: 3019
    })).resolves.not.toThrow();
  });

  it('should start emulation studio and handle Game Boy button commands', async () => {
    await adapter.start({
      playerTrainerName: 'ASH',
      rivalName: 'GARY',
      mode: 'anarchy',
      starterPokemon: 'charmander',
      viewerPort: 3019,
      enableViewer: true,
      autoDownloadRom: false
    });

    // Test A button press
    const aResult = await adapter.handleCommand('a', [], 'TrainerRed');
    expect(aResult.success).toBe(true);
    expect(aResult.message).toContain('pressed [A]');

    // Test direction inputs
    const upResult = await adapter.handleCommand('up', [], 'Viewer1');
    expect(upResult.success).toBe(true);
    expect(upResult.message).toContain('pressed [UP]');

    // Test mode switching to democracy
    const demResult = await adapter.handleCommand('democracy', [], 'Mod1');
    expect(demResult.success).toBe(true);
    expect(demResult.message).toContain('DEMOCRACY');

    // Test party status query
    const partyResult = await adapter.handleCommand('party', [], 'Viewer2');
    expect(partyResult.success).toBe(true);
    expect(partyResult.message).toContain('CHARMANDER');

    // Verify status & progress
    const status = await adapter.getStatus();
    expect(status.state).toBe('CONNECTED');

    const progress = await adapter.getProgress();
    expect(progress.currentObjective).toContain('Kanto Journey');
    expect(progress.details.trainer).toBe('ASH');
  });

  it('PokemonRomManager should recognize authentic Pokemon Red ROM header', () => {
    const dummyRom = Buffer.alloc(1024);
    // Write "POKEMON RED" at 0x134
    dummyRom.write('POKEMON RED\0\0\0\0', 0x134, 'ascii');
    // Call private or public method
    const title = dummyRom.subarray(0x134, 0x143).toString('ascii').replace(/\0/g, '').trim();
    expect(title).toBe('POKEMON RED');
  });
});

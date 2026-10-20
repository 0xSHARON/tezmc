import { describe, it, expect } from 'vitest';
import { BRAND } from '@autoplay/shared';
import { OverlayServer } from '@autoplay/overlay';
import { SubwaySurfersAdapter } from '@autoplay/adapter-subway-surfers';

describe('TEZMC Rebranding Verification Tests', () => {
  it('BRAND constants should define TEZMC identity correctly', () => {
    expect(BRAND.name).toBe('TEZMC');
    expect(BRAND.displayName).toBe('TEZMC');
    expect(BRAND.tagline).toBe('Autonomous Gaming & Live Streaming');
    expect(BRAND.description).toContain('24/7 autonomous gaming platform');
    expect(BRAND.defaultBotName).toBe('TezmcBot');
    expect(BRAND.commentatorName).toBe('TEZMC AI Narrator');
    expect(BRAND.colors.primary).toBe('#10b981');
    expect(BRAND.colors.background).toBe('#090a0f');
  });

  it('OverlayServer HTML should display TEZMC branding without old product name', () => {
    const html = OverlayServer.getHtml();
    expect(html).toContain('TEZMC &bull; Live Broadcast');
    expect(html).toContain('TEZMC AI Narrator');
    expect(html).toContain('Powered by TEZMC');
    expect(html).not.toContain('AutoPlay AI');
  });

  it('SubwaySurfersAdapter should have TEZMC displayName', () => {
    const adapter = new SubwaySurfersAdapter();
    expect(adapter.displayName).toBe('Subway Surfers (Autonomous 24/7)');
  });
});

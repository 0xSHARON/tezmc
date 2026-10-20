/**
 * TEZMC Brand Definition — Single Source of Truth
 */
export const BRAND = {
  name: 'TEZMC',
  displayName: 'TEZMC',
  tagline: 'Autonomous Gaming & Live Streaming',
  description: 'A 24/7 autonomous gaming platform that controls game-specific bots, captures real gameplay, streams to YouTube Live, and manages everything from one dashboard.',
  version: '1.0.0',
  defaultBotName: 'TezmcBot',
  commentatorName: 'TEZMC AI Narrator',
  colors: {
    primary: '#10b981', // Clean gaming emerald accent
    primaryGlow: 'rgba(16, 185, 129, 0.25)',
    background: '#090a0f', // Deep dark charcoal/black
    surface: '#0f111a',
    card: '#131622',
    border: '#1f2438',
    textPrimary: '#ffffff',
    textSecondary: '#94a3b8',
    status: {
      running: '#10b981',
      idle: '#64748b',
      starting: '#38bdf8',
      recovering: '#f59e0b',
      failed: '#ef4444'
    }
  }
} as const;

export type BrandConfig = typeof BRAND;

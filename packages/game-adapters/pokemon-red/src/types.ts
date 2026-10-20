export type GameBoyButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';

export interface PokemonPartyMember {
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  status?: string;
  spriteIndex?: number;
}

export interface PokemonRedState {
  trainerName: string;
  rivalName: string;
  currentMap: string;
  badges: string[];
  party: PokemonPartyMember[];
  money: number;
  pokedexOwned: number;
  pokedexSeen: number;
  stepCount: number;
  mode: 'anarchy' | 'democracy' | 'hybrid' | 'autonomous_ai';
  democracyVotes: Record<GameBoyButton, number>;
  democracyCountdown: number;
  recentCommands: Array<{
    id: string;
    sender: string;
    command: string;
    timestamp: number;
  }>;
  lastAction: string;
  isBattle: boolean;
  battleEnemy: {
    name: string;
    level: number;
    hpPercent: number;
  } | null;
  romLoaded: boolean;
  romTitle: string;
  fps: number;
}

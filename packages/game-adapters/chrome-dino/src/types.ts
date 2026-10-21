export type ObstacleType =
  | 'CACTUS_SMALL'
  | 'CACTUS_LARGE'
  | 'CACTUS_GROUP'
  | 'PTERODACTYL_LOW'
  | 'PTERODACTYL_MID'
  | 'PTERODACTYL_HIGH';

export interface Obstacle {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  passed: boolean;
}

export interface DinoState {
  status: 'PLAYING' | 'CRASHED' | 'PAUSED';
  score: number;
  highScore: number;
  distance: number;
  speed: number;
  dinoY: number;
  isJumping: boolean;
  isDucking: boolean;
  jumpCount: number;
  duckCount: number;
  runCount: number;
  nearestObstacleDistance: number;
  nearestObstacleType: ObstacleType | 'NONE';
  aiMode: 'autonomous_ai' | 'chat_democracy' | 'manual';
  theme: string;
}

export interface DinoCommandResult {
  success: boolean;
  message: string;
  state?: DinoState;
}

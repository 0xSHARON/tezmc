export type TrackLane = -1 | 0 | 1; // -1: Left, 0: Center, 1: Right

export type ObstacleType = 
  | 'train'            // Large train block, cannot jump or roll over
  | 'low_barrier'      // Hurdle, must jump
  | 'high_barrier'     // Overhead sign, must roll/duck
  | 'double_train';    // Two adjacent lanes blocked

export interface Obstacle {
  id: string;
  lane: TrackLane;
  zDistance: number;   // Distance in meters ahead of the player
  type: ObstacleType;
  widthMeters: number;
  heightMeters: number;
}

export interface CoinPickup {
  id: string;
  lane: TrackLane;
  zDistance: number;
  collected: boolean;
}

export type PowerupType = 'hoverboard' | 'jetpack' | 'coin_magnet' | 'super_sneakers' | '2x_multiplier';

export interface ActivePowerup {
  type: PowerupType;
  remainingSeconds: number;
}

export interface SubwayGameState {
  score: number;
  coins: number;
  distanceMeters: number;
  speedKmh: number;
  multiplier: number;
  lane: TrackLane;
  targetLane: TrackLane;
  isJumping: boolean;
  jumpProgress: number; // 0 to 1
  isRolling: boolean;
  rollProgress: number; // 0 to 1
  activePowerups: ActivePowerup[];
  hasHoverboard: boolean;
  isCrashed: boolean;
  crashReason?: string;
  runCount: number;
  topScore: number;
}

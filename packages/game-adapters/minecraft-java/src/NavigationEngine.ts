import { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { GameProgress } from '@autoplay/shared';

export interface BoundedExplorationConfig {
  center: { x: number; y: number; z: number };
  radius: number;
}

export class NavigationEngine {
  private bot: Bot;
  private config: BoundedExplorationConfig;
  private movements: Movements | null = null;
  private isExploring = false;
  private explorationTimer: NodeJS.Timeout | null = null;
  private lastPosition: { x: number; y: number; z: number } | null = null;
  private totalDistance = 0;
  private visitedWaypoints = 0;

  constructor(bot: Bot, config: BoundedExplorationConfig) {
    this.bot = bot;
    this.config = config;
  }

  public init(): void {
    // Load pathfinder plugin
    this.bot.loadPlugin(pathfinder);

    const defaultMove = new Movements(this.bot);
    defaultMove.canDig = false; // Safe exploration: don't randomly dig blocks
    defaultMove.allow1by1towers = false;
    defaultMove.allowParkour = true;
    this.movements = defaultMove;
    this.bot.pathfinder.setMovements(this.movements);

    if (this.bot.entity?.position) {
      this.lastPosition = {
        x: this.bot.entity.position.x,
        y: this.bot.entity.position.y,
        z: this.bot.entity.position.z
      };
    }
  }

  public startBoundedExploration(): void {
    if (this.isExploring) return;
    this.isExploring = true;
    this.planNextWaypoint();
  }

  public stop(): void {
    this.isExploring = false;
    if (this.explorationTimer) {
      clearTimeout(this.explorationTimer);
      this.explorationTimer = null;
    }
    if (this.bot?.pathfinder) {
      try {
        this.bot.pathfinder.stop();
      } catch {
        // ignore stop errors
      }
    }
  }

  private planNextWaypoint(): void {
    if (!this.isExploring) return;

    // Pick a random coordinate within configured bounded radius
    const angle = Math.random() * 2 * Math.PI;
    const distance = 5 + Math.random() * (this.config.radius - 5);
    const targetX = Math.floor(this.config.center.x + Math.cos(angle) * distance);
    const targetZ = Math.floor(this.config.center.z + Math.sin(angle) * distance);
    const targetY = this.bot.entity?.position?.y ? Math.floor(this.bot.entity.position.y) : this.config.center.y;

    const goal = new goals.GoalNear(targetX, targetY, targetZ, 2);

    try {
      this.bot.pathfinder.setGoal(goal);
    } catch {
      // Re-schedule if pathfinder fails to find initial path
    }

    // Schedule next waypoint evaluation in 8 to 15 seconds
    this.explorationTimer = setTimeout(() => {
      this.visitedWaypoints++;
      this.updateDistance();
      this.planNextWaypoint();
    }, 10000 + Math.random() * 5000);
  }

  public updateDistance(): void {
    if (!this.bot.entity?.position) return;
    const current = this.bot.entity.position;
    if (this.lastPosition) {
      const dx = current.x - this.lastPosition.x;
      const dz = current.z - this.lastPosition.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.5) {
        this.totalDistance += dist;
      }
    }
    this.lastPosition = { x: current.x, y: current.y, z: current.z };
  }

  public getStats(): { blocksTraveled: number; discoveredPointsOfInterest: number } {
    this.updateDistance();
    return {
      blocksTraveled: Math.round(this.totalDistance),
      discoveredPointsOfInterest: this.visitedWaypoints
    };
  }
}

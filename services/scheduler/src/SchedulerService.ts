import { EventEmitter } from 'node:events';
import { ScheduleConfig } from '@autoplay/shared';
import { SessionStateMachine } from '@autoplay/session-manager';

export class SchedulerService extends EventEmitter {
  private schedules: Map<string, ScheduleConfig> = new Map();
  private sessionMachine: SessionStateMachine;
  private pollTimer: NodeJS.Timeout | null = null;
  private isMaintenanceActive = false;

  constructor(sessionMachine: SessionStateMachine) {
    super();
    this.sessionMachine = sessionMachine;
  }

  public registerSchedule(schedule: ScheduleConfig): void {
    const id = schedule.id || `sched-${Date.now()}`;
    this.schedules.set(id, { ...schedule, id });
  }

  public getSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  public deleteSchedule(id: string): boolean {
    return this.schedules.delete(id);
  }

  public start(): void {
    if (this.pollTimer) return;

    // Check schedules every 30 seconds
    this.pollTimer = setInterval(() => {
      this.evaluateSchedules();
    }, 30000);
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public setMaintenanceWindow(active: boolean, reason?: string): void {
    this.isMaintenanceActive = active;
    if (active) {
      this.emit('maintenance_started', reason);
      if (this.sessionMachine.getState() === 'RUNNING') {
        this.sessionMachine.stop(`Maintenance window initiated: ${reason || 'Scheduled maintenance'}`);
      }
    } else {
      this.emit('maintenance_ended');
    }
  }

  private evaluateSchedules(): void {
    if (this.isMaintenanceActive) return;

    const now = new Date();
    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled) continue;

      // In a production setup, evaluate cron syntax (e.g. standard cron-parser)
      // Check if session machine is idle and schedule matches
      if (this.sessionMachine.getState() === 'IDLE') {
        // Trigger auto-scheduled session if desired
      }
    }
  }
}

import os from 'node:os';
import { EventEmitter } from 'node:events';
import { SystemMetrics } from '@autoplay/shared';

export interface MonitoringThresholds {
  maxCpuPercent: number;
  maxMemoryPercent: number;
  minDiskFreeMb: number;
}

export class MonitoringService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private thresholds: MonitoringThresholds;
  private lastCpuUsage: { idle: number; total: number } | null = null;

  constructor(thresholds: MonitoringThresholds = { maxCpuPercent: 85, maxMemoryPercent: 85, minDiskFreeMb: 2048 }) {
    super();
    this.thresholds = thresholds;
  }

  public start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      const metrics = await this.collectMetrics();
      this.emit('metrics', metrics);
      this.checkThresholds(metrics);
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async collectMetrics(): Promise<SystemMetrics> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    const cpuPercent = this.calculateCpuPercent();

    return {
      cpuUsagePercent: cpuPercent,
      memoryUsagePercent: memPercent,
      totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
      freeMemoryMb: Math.round(freeMem / (1024 * 1024)),
      diskFreeMb: 10240, // Simulated or statvfs
      timestamp: new Date().toISOString()
    };
  }

  private calculateCpuPercent(): number {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type];
      }
      idle += cpu.times.idle;
    }

    if (!this.lastCpuUsage) {
      this.lastCpuUsage = { idle, total };
      return 15; // Initial baseline
    }

    const idleDiff = idle - this.lastCpuUsage.idle;
    const totalDiff = total - this.lastCpuUsage.total;
    this.lastCpuUsage = { idle, total };

    if (totalDiff === 0) return 0;
    const percent = Math.round(100 - (100 * idleDiff) / totalDiff);
    return Math.max(0, Math.min(100, percent));
  }

  private checkThresholds(metrics: SystemMetrics): void {
    if (metrics.cpuUsagePercent > this.thresholds.maxCpuPercent) {
      this.emit('alert', {
        level: 'warn',
        message: `High CPU utilization: ${metrics.cpuUsagePercent}% exceeds threshold of ${this.thresholds.maxCpuPercent}%`
      });
    }

    if (metrics.memoryUsagePercent > this.thresholds.maxMemoryPercent) {
      this.emit('alert', {
        level: 'warn',
        message: `High memory utilization: ${metrics.memoryUsagePercent}% exceeds threshold of ${this.thresholds.maxMemoryPercent}%`
      });
    }
  }
}

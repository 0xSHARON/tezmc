import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { AdapterRegistry } from '@autoplay/game-adapter-sdk';
import { MockMinecraftAdapter } from '@autoplay/adapter-minecraft-java';
import { StreamingManager } from '@autoplay/streaming';
import { SessionStateMachine } from '@autoplay/session-manager';
import { MonitoringService } from '@autoplay/monitoring';
import { SchedulerService } from '@autoplay/scheduler';
import { createApiRouter } from '../../apps/api/src/routes/api.js';

describe('AutoPlay AI API Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let authToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    const reg = AdapterRegistry.getInstance();
    const mock = new MockMinecraftAdapter();
    if (!reg.has(mock.id)) {
      reg.register(mock);
    }

    const streamingManager = new StreamingManager();
    const sessionMachine = new SessionStateMachine(streamingManager);
    const monitoringService = new MonitoringService();
    const schedulerService = new SchedulerService(sessionMachine);

    app.use('/api/v1', createApiRouter(sessionMachine, streamingManager, monitoringService, schedulerService) as any);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health should return system status OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
    expect(body.sessionState).toBe('IDLE');
  });

  it('POST /auth/login should authenticate valid operator and return JWT', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'autoplay2026' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeDefined();
    authToken = body.token;
  });

  it('GET /games should list installed adapters', async () => {
    const res = await fetch(`${baseUrl}/games`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.adapters)).toBe(true);
    expect(body.adapters.some((a: any) => a.id === 'minecraft-java-mock')).toBe(true);
  });

  it('POST /games/:id/validate should validate adapter configuration schema', async () => {
    const res = await fetch(`${baseUrl}/games/minecraft-java-mock/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: 'localhost',
        port: 25565,
        version: '1.20.1',
        botName: 'AutoPlayBot',
        exploreRadius: 50
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it('GET /sessions should list session records', async () => {
    const res = await fetch(`${baseUrl}/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('history');
  });
});

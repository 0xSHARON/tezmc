import { Router, Request, Response } from 'express';
import {
  SessionCreateSchema,
  StreamConfigSchema,
  ScheduleConfigSchema,
  UserCredentialsSchema,
  SecretRedactor
} from '@autoplay/shared';
import { AdapterRegistry } from '@autoplay/adapter-sdk';
import { SessionStateMachine } from '@autoplay/session-manager';
import { StreamingManager } from '@autoplay/streaming';
import { MonitoringService } from '@autoplay/monitoring';
import { SchedulerService } from '@autoplay/scheduler';
import { DbService } from '../services/db.js';
import { generateToken, requireAuth } from '../auth/jwt.js';
import { logger } from '../services/logger.js';

export function createApiRouter(
  sessionMachine: SessionStateMachine,
  streamingManager: StreamingManager,
  monitoringService: MonitoringService,
  schedulerService: SchedulerService
): Router {
  const router = Router();
  const db = DbService.getInstance();
  const registry = AdapterRegistry.getInstance();

  // Public Auth Route
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const credentials = UserCredentialsSchema.parse(req.body);
      // In production, compare hashed password from DB. For local MVP:
      if (credentials.username === 'admin' && credentials.password === 'autoplay2026') {
        const token = generateToken({
          userId: 'user-admin',
          username: 'admin',
          role: 'admin'
        });
        db.recordAuditLog('LOGIN_SUCCESS', 'auth', { username: credentials.username });
        res.json({ token, user: { username: 'admin', role: 'admin' } });
      } else {
        db.recordAuditLog('LOGIN_FAILED', 'auth', { username: credentials.username });
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid username or password' });
      }
    } catch (err: any) {
      res.status(400).json({ error: 'Validation Error', details: err?.errors || err.message });
    }
  });

  // Health and System Status
  router.get('/health', async (_req: Request, res: Response) => {
    const sessionState = sessionMachine.getState();
    const streamStatus = streamingManager.getStatus();
    const isDegraded = sessionState === 'RECOVERING' || streamStatus === 'RECONNECTING';

    res.json({
      status: isDegraded ? 'DEGRADED' : 'OK',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      sessionState,
      streamStatus
    });
  });

  router.get('/system/status', async (_req: Request, res: Response) => {
    const metrics = await monitoringService.collectMetrics();
    const streamMetrics = streamingManager.getMetrics();
    const activeSession = sessionMachine.getActiveSession();

    res.json({
      system: metrics,
      stream: {
        status: streamingManager.getStatus(),
        metrics: streamMetrics
      },
      session: activeSession
    });
  });

  // Game Adapters
  router.get('/games', async (_req: Request, res: Response) => {
    const adapters = registry.list().map((a) => ({
      id: a.id,
      displayName: a.displayName,
      capabilities: a.capabilities
    }));
    res.json({ adapters });
  });

  router.get('/games/:id/status', async (req: Request, res: Response) => {
    const adapter = registry.get(req.params.id);
    if (!adapter) {
      res.status(404).json({ error: 'Not Found', message: `Adapter ${req.params.id} not found.` });
      return;
    }
    const status = await adapter.getStatus();
    const progress = await adapter.getProgress();
    res.json({ status, progress });
  });

  router.post('/games/:id/validate', async (req: Request, res: Response) => {
    const adapter = registry.get(req.params.id);
    if (!adapter) {
      res.status(404).json({ error: 'Not Found', message: `Adapter ${req.params.id} not found.` });
      return;
    }
    try {
      await adapter.validateConfig(req.body);
      res.json({ valid: true });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err?.message || err });
    }
  });

  // Sessions
  router.post('/sessions', requireAuth, async (req: Request, res: Response) => {
    try {
      const input = SessionCreateSchema.parse(req.body);
      await sessionMachine.start(input);
      const active = sessionMachine.getActiveSession();
      if (active) {
        db.saveSession(active);
        db.recordAuditLog('SESSION_START', 'session', { sessionId: active.id, gameId: active.gameId });
      }
      res.status(201).json({ session: active });
    } catch (err: any) {
      logger.error({ err }, 'Failed to start session');
      res.status(400).json({ error: 'Failed to start session', message: err?.message || err });
    }
  });

  router.get('/sessions', async (_req: Request, res: Response) => {
    const active = sessionMachine.getActiveSession();
    const history = db.listSessions(30);
    res.json({ active, history });
  });

  router.get('/sessions/:id', async (req: Request, res: Response) => {
    const active = sessionMachine.getActiveSession();
    if (active && active.id === req.params.id) {
      res.json({ session: active });
      return;
    }
    const session = db.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Not Found', message: 'Session not found' });
      return;
    }
    res.json({ session });
  });

  router.post('/sessions/:id/pause', requireAuth, async (req: Request, res: Response) => {
    await sessionMachine.pause();
    db.recordAuditLog('SESSION_PAUSE', 'session', { sessionId: req.params.id });
    res.json({ status: 'PAUSED' });
  });

  router.post('/sessions/:id/resume', requireAuth, async (req: Request, res: Response) => {
    await sessionMachine.resume();
    db.recordAuditLog('SESSION_RESUME', 'session', { sessionId: req.params.id });
    res.json({ status: 'RESUMED' });
  });

  router.post('/sessions/:id/stop', requireAuth, async (req: Request, res: Response) => {
    await sessionMachine.stop('Operator stopped via API');
    db.recordAuditLog('SESSION_STOP', 'session', { sessionId: req.params.id });
    const active = sessionMachine.getActiveSession();
    if (active) {
      db.saveSession(active);
    }
    res.json({ status: 'STOPPED' });
  });

  // Streaming Endpoints
  router.get('/stream/status', async (_req: Request, res: Response) => {
    res.json({
      status: streamingManager.getStatus(),
      metrics: streamingManager.getMetrics()
    });
  });

  router.post('/stream/stop', requireAuth, async (_req: Request, res: Response) => {
    await streamingManager.stopStream();
    db.recordAuditLog('STREAM_STOP', 'stream', {});
    res.json({ status: 'INACTIVE' });
  });

  // Scheduler Endpoints
  router.get('/schedules', async (_req: Request, res: Response) => {
    res.json({ schedules: schedulerService.getSchedules() });
  });

  router.post('/schedules', requireAuth, async (req: Request, res: Response) => {
    try {
      const schedule = ScheduleConfigSchema.parse(req.body);
      schedulerService.registerSchedule(schedule);
      db.recordAuditLog('SCHEDULE_CREATE', 'schedule', schedule);
      res.status(201).json({ schedule });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation Error', message: err?.message || err });
    }
  });

  // Logs endpoint (redacted)
  router.get('/logs', async (_req: Request, res: Response) => {
    const transitions = sessionMachine.getTransitions();
    res.json({ transitions: SecretRedactor.redactObject(transitions) });
  });

  return router;
}

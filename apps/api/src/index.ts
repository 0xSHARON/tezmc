import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { SOCKET_EVENTS, SecretRedactor } from '@autoplay/shared';
import { AdapterRegistry } from '@autoplay/adapter-sdk';
import { ChromeDinoAdapter } from '@autoplay/adapter-chrome-dino';
import { StreamingManager } from '@autoplay/streaming';
import { SessionStateMachine } from '@autoplay/session-manager';
import { MonitoringService } from '@autoplay/monitoring';
import { SchedulerService } from '@autoplay/scheduler';
import { OverlayServer } from '@autoplay/overlay';
import { ChatManager } from '@autoplay/chat-interactivity';
import { DbService } from './services/db.js';
import { logger } from './services/logger.js';
import { createApiRouter } from './routes/api.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Standard Middlewares
  app.use(cors());
  app.use(express.json());

  // Database initialization
  const db = DbService.getInstance();

  // Adapter Registry & Registration
  const registry = AdapterRegistry.getInstance();
  const chromeDinoAdapter = new ChromeDinoAdapter();
  registry.register(chromeDinoAdapter);

  // Initialize 24/7 standby visual streamer
  await chromeDinoAdapter.initializeStandbyViewer(3010).catch((err) => {
    logger.warn({ err }, 'Failed to bind Chrome Dino standby viewer on port 3010');
  });

  // Streaming & Session Manager
  const streamingManager = new StreamingManager({
    maxRetries: parseInt(process.env.MAX_RESTART_ATTEMPTS || '5', 10)
  });

  const sessionMachine = new SessionStateMachine(
    streamingManager,
    parseInt(process.env.MAX_RESTART_ATTEMPTS || '5', 10),
    parseInt(process.env.MAX_SESSION_HOURS || '24', 10)
  );

  // Monitoring & Scheduler Services
  const monitoringService = new MonitoringService({
    maxCpuPercent: parseInt(process.env.MAX_CPU_PERCENT || '85', 10),
    maxMemoryPercent: parseInt(process.env.MAX_MEMORY_PERCENT || '85', 10),
    minDiskFreeMb: parseInt(process.env.MIN_DISK_FREE_MB || '2048', 10)
  });
  monitoringService.start();

  const schedulerService = new SchedulerService(sessionMachine);
  schedulerService.start();

  // Chat & Viewer Interactivity Manager
  const chatManager = new ChatManager();
  chatManager.setActiveAdapter(chromeDinoAdapter);
  await chatManager.start();

  chatManager.on('chat:message', (msg) => {
    io.emit('chat:message', msg);
  });

  chatManager.on('commentary:speech', (item) => {
    io.emit('commentary:speech', item);
  });

  // Reconcile existing sessions on startup
  const priorSessions = db.listSessions(10);
  sessionMachine.reconcileOnStartup(priorSessions);

  // Forward internal events to WebSockets
  sessionMachine.on('state_changed', ({ to, reason }) => {
    io.emit(SOCKET_EVENTS.SESSION_STATE_CHANGED, to);
    io.emit(SOCKET_EVENTS.LOG_ENTRY, {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'session',
      message: `State transition: ${to} (${reason})`
    });
    logger.info({ state: to, reason }, 'Session state transition');

    // Always use Chrome Dino adapter for chat commands
    if (to === 'RUNNING') {
      chatManager.setActiveAdapter(chromeDinoAdapter);
    }
  });

  streamingManager.on('status', (status) => {
    io.emit(SOCKET_EVENTS.STREAM_STATUS, status);
  });

  streamingManager.on('metrics', (metrics) => {
    io.emit(SOCKET_EVENTS.STREAM_METRICS, metrics);
  });

  streamingManager.on('log', (logEntry) => {
    io.emit(SOCKET_EVENTS.LOG_ENTRY, {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...logEntry,
      message: SecretRedactor.redactString(logEntry.message)
    });
  });

  monitoringService.on('metrics', (metrics) => {
    io.emit(SOCKET_EVENTS.SYSTEM_METRICS, metrics);
  });

  chromeDinoAdapter.on('progress', async () => {
    const progress = await chromeDinoAdapter.getProgress();
    io.emit(SOCKET_EVENTS.GAME_PROGRESS, progress);
  });

  // REST API Routes
  app.use('/api/v1', createApiRouter(sessionMachine, streamingManager, monitoringService, schedulerService, chatManager));

  // Live Stream Browser-Source Overlay Endpoint
  app.get('/overlay', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(OverlayServer.getHtml());
  });

  // Chrome Dino Visual Viewer Endpoint - supports both /dyno and /dino
  app.get(['/dino', '/dino/', '/dino/stream', '/dyno', '/dyno/', '/dyno/stream'], (_req, res) => {
    const engine = chromeDinoAdapter.getEngine();
    if (engine) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(engine.getCanvasHtml());
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html><head><title>Chrome Dino - TEZMC</title><style>body{background:#090a0f;color:#10b981;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style></head><body><h1>🦕 Chrome Dino Engine initializing...</h1></body></html>`);
    }
  });

  app.get(['/dino/state', '/dyno/state'], (_req, res) => {
    const engine = chromeDinoAdapter.getEngine();
    if (engine) {
      res.json({
        ...engine.getState(),
        obstacles: (engine as any).obstacles || [],
        lastAction: 'AUTONOMOUS RUNNER ACTIVE'
      });
    } else {
      res.json({
        score: 0, highScore: 0, speed: 8, distance: 0,
        obstacles: [],
        lastAction: 'STANDBY'
      });
    }
  });

  app.post(['/dino/action', '/dyno/action'], (req, res) => {
    const engine = chromeDinoAdapter.getEngine();
    if (engine) {
      const cmd = String(req.body.command || req.body.action || '').toLowerCase().trim();
      let result: any = { success: false, message: 'Unknown command' };
      if (cmd === 'jump' || cmd === 'space' || cmd === 'up') {
        result = engine.jump(req.body.sender || 'Viewer');
      } else if (cmd === 'duck' || cmd === 'down') {
        result = engine.duck(req.body.sender || 'Viewer');
      } else if (cmd === 'restart') {
        engine.resetGame(true);
        result = { success: true, message: 'Game Reset', state: engine.getState() };
      }
      res.json(result);
    } else {
      res.status(503).json({ error: 'Engine not active' });
    }
  });

  // Socket.IO Connection Handler
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Dashboard client connected via WebSocket');
    // Send immediate snapshot
    socket.emit(SOCKET_EVENTS.SESSION_STATE_CHANGED, sessionMachine.getState());
    socket.emit(SOCKET_EVENTS.STREAM_STATUS, streamingManager.getStatus());
    socket.emit(SOCKET_EVENTS.STREAM_METRICS, streamingManager.getMetrics());
    for (const msg of chatManager.getRecentChat()) {
      socket.emit('chat:message', msg);
    }
    const recentCommentary = chatManager.getRecentCommentary();
    if (recentCommentary.length > 0) {
      socket.emit('commentary:speech', recentCommentary[recentCommentary.length - 1]);
    }
  });

  // Graceful shutdown handling
  const handleShutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated...');
    monitoringService.stop();
    schedulerService.stop();
    await chatManager.stop();
    await sessionMachine.stop(`System received ${signal}`);
    server.close(() => {
      logger.info('TEZMC Control API HTTP & WebSocket server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  server.listen(PORT, HOST, () => {
    logger.info(`TEZMC Control API listening on http://${HOST}:${PORT}`);
    logger.info(`Chrome Dino viewer available at http://${HOST}:${PORT}/dino`);
    logger.info(`Overlay URL available at http://${HOST}:${PORT}/overlay`);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to bootstrap TEZMC API');
  process.exit(1);
});

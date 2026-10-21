import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { SOCKET_EVENTS, SecretRedactor } from '@autoplay/shared';
import { AdapterRegistry } from '@autoplay/adapter-sdk';
import { SubwaySurfersAdapter, SubwaySurfersEngine } from '@autoplay/adapter-subway-surfers';
import { PokemonRedAdapter } from '@autoplay/adapter-pokemon-red';
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
  const subwaySurfersAdapter = new SubwaySurfersAdapter();
  registry.register(subwaySurfersAdapter);

  const pokemonRedAdapter = new PokemonRedAdapter();
  registry.register(pokemonRedAdapter);

  // Initialize 24/7 standby visual streamers on dedicated viewer ports
  await subwaySurfersAdapter.initializeStandbyViewer(3008).catch((err) => {
    logger.warn({ err }, 'Failed to bind Subway Surfers standby viewer on port 3008');
  });
  await pokemonRedAdapter.initializeStandbyViewer(3009).catch((err) => {
    logger.warn({ err }, 'Failed to bind Pokemon Red standby viewer on port 3009');
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
  const activeGame = process.env.ACTIVE_GAME || 'pokemon-red';
  const chatManager = new ChatManager();
  chatManager.setActiveAdapter(activeGame === 'pokemon-red' ? pokemonRedAdapter : subwaySurfersAdapter);
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

    // Update active adapter for chat commands when session starts
    if (to === 'RUNNING') {
      const activeSess = sessionMachine.getActiveSession();
      if (activeSess?.gameId === 'pokemon-red') {
        chatManager.setActiveAdapter(pokemonRedAdapter);
      } else {
        chatManager.setActiveAdapter(subwaySurfersAdapter);
      }
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

  subwaySurfersAdapter.on('progress', async () => {
    const progress = await subwaySurfersAdapter.getProgress();
    io.emit(SOCKET_EVENTS.GAME_PROGRESS, progress);
  });

  pokemonRedAdapter.on('progress', async () => {
    const progress = await pokemonRedAdapter.getProgress();
    io.emit(SOCKET_EVENTS.GAME_PROGRESS, progress);
  });

  // REST API Routes
  app.use('/api/v1', createApiRouter(sessionMachine, streamingManager, monitoringService, schedulerService, chatManager));

  // Live Stream Browser-Source Overlay Endpoint
  app.get('/overlay', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(OverlayServer.getHtml());
  });

  // Subway Surfers Visual Streamer Endpoint on Control API (port 3000)
  app.get(['/subway', '/subway/', '/subway/*'], (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(SubwaySurfersEngine.getCanvasHtml());
  });

  app.get('/subway/state', (_req, res) => {
    const engine = subwaySurfersAdapter.getEngine();
    if (engine) {
      res.json({
        state: engine.getState(),
        lastAction: 'AUTONOMOUS RUNNER ACTIVE'
      });
    } else {
      res.json({
        state: { score: 0, coins: 0, multiplier: 10, speedKmh: 45 },
        lastAction: 'STANDBY'
      });
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
    logger.info(`Overlay URL available at http://${HOST}:${PORT}/overlay`);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to bootstrap TEZMC API');
  process.exit(1);
});

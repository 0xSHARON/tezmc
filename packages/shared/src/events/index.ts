export const SOCKET_EVENTS = {
  SESSION_STATE_CHANGED: 'session:state_changed',
  GAME_PROGRESS: 'game:progress',
  GAME_EVENT: 'game:event',
  STREAM_STATUS: 'stream:status',
  STREAM_METRICS: 'stream:metrics',
  SYSTEM_METRICS: 'system:metrics',
  LOG_ENTRY: 'log:entry',
  ERROR_ALERT: 'error:alert'
} as const;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'api' | 'adapter' | 'stream' | 'session' | 'scheduler';
  message: string;
  metadata?: Record<string, any>;
}

import { z } from 'zod';

export const SessionStateEnum = z.enum([
  'IDLE',
  'VALIDATING',
  'STARTING_GAME',
  'WAITING_FOR_GAME_READY',
  'STARTING_CAPTURE',
  'STARTING_STREAM',
  'VERIFYING_STREAM',
  'RUNNING',
  'RECOVERING',
  'STOPPING',
  'FAILED'
]);

export type SessionState = z.infer<typeof SessionStateEnum>;

export const HealthStatusEnum = z.enum(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN']);
export type HealthStatus = z.infer<typeof HealthStatusEnum>;

export const StreamStatusEnum = z.enum([
  'INACTIVE',
  'INITIALIZING',
  'ENCODER_RUNNING',
  'INGEST_CONNECTED',
  'LIVE_CONFIRMED',
  'RECONNECTING',
  'FAILED'
]);
export type StreamStatus = z.infer<typeof StreamStatusEnum>;

export const MinecraftConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.number().int().min(1).max(65535).default(25565),
  version: z.string().default('1.20.1'),
  botName: z.string().min(1).max(16).default('AutoPlayBot'),
  auth: z.enum(['offline', 'microsoft']).default('offline'),
  exploreRadius: z.number().int().min(5).max(1000).default(50),
  viewDistance: z.number().int().min(2).max(16).default(6),
  viewerPort: z.number().int().min(1024).max(65535).default(3007),
  enableViewer: z.boolean().default(true),
  objective: z.enum(['bounded_exploration', 'idle_survey', 'resource_scout']).default('bounded_exploration')
});

export type MinecraftConfig = z.infer<typeof MinecraftConfigSchema>;

export const StreamConfigSchema = z.object({
  provider: z.enum(['ffmpeg', 'obs']).default('ffmpeg'),
  rtmpUrl: z.string().url().or(z.string().regex(/^rtmps?:\/\/.+/)),
  streamKey: z.string().optional(),
  width: z.number().int().min(640).max(3840).default(1280),
  height: z.number().int().min(360).max(2160).default(720),
  fps: z.number().int().min(15).max(60).default(30),
  videoBitrate: z.string().regex(/^\d+[kKmM]?$/).default('2500k'),
  audioBitrate: z.string().regex(/^\d+[kKmM]?$/).default('128k'),
  keyframeInterval: z.number().int().min(1).max(10).default(2),
  preset: z.string().default('veryfast'),
  overlayEnabled: z.boolean().default(true),
  overlayUrl: z.string().url().optional()
});

export type StreamConfig = z.infer<typeof StreamConfigSchema>;

export const SessionCreateSchema = z.object({
  gameId: z.string().min(1),
  gameConfig: z.record(z.any()),
  streamConfig: StreamConfigSchema.optional(),
  maxHours: z.number().min(0.1).max(720).default(24),
  alwaysOn: z.boolean().default(false)
});

export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;

export const UserCredentialsSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6)
});

export type UserCredentials = z.infer<typeof UserCredentialsSchema>;

export const ScheduleConfigSchema = z.object({
  id: z.string().uuid().optional(),
  gameId: z.string().min(1),
  cronExpression: z.string().min(5),
  timezone: z.string().default('UTC'),
  durationMinutes: z.number().int().positive().default(120),
  enabled: z.boolean().default(true),
  gameConfig: z.record(z.any()).default({})
});

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

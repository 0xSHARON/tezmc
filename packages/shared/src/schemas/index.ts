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

export const SubwaySurfersConfigSchema = z.object({
  botName: z.string().min(1).max(24).default('JakeSurfer'),
  mode: z.enum(['autonomous_ai', 'chat_democracy', 'hybrid']).default('autonomous_ai'),
  difficulty: z.enum(['casual', 'normal', 'hardcore']).default('normal'),
  autoRevive: z.boolean().default(true),
  viewerPort: z.number().int().min(1024).max(65535).default(3008),
  enableViewer: z.boolean().default(true),
  startingMultiplier: z.number().int().min(1).max(30).default(10)
});

export type SubwaySurfersConfig = z.infer<typeof SubwaySurfersConfigSchema>;

export const PokemonRedConfigSchema = z.object({
  playerTrainerName: z.string().min(1).max(12).default('RED'),
  rivalName: z.string().min(1).max(12).default('BLUE'),
  mode: z.enum(['anarchy', 'democracy', 'hybrid', 'autonomous_ai']).default('anarchy'),
  chatCooldownMs: z.number().int().min(100).max(10000).default(500),
  democracyVoteWindowSeconds: z.number().int().min(5).max(60).default(15),
  enableViewer: z.boolean().default(true),
  viewerPort: z.number().int().min(1024).max(65535).default(3009),
  romPath: z.string().optional(),
  autoDownloadRom: z.boolean().default(true),
  starterPokemon: z.enum(['charmander', 'squirtle', 'bulbasaur']).default('charmander')
});

export type PokemonRedConfig = z.infer<typeof PokemonRedConfigSchema>;

export const StreamDestinationSchema = z.object({
  id: z.string().default(() => Math.random().toString(36).substring(2, 9)),
  name: z.string().min(1).default('Primary YouTube'),
  platform: z.enum(['youtube', 'twitch', 'kick', 'tiktok', 'facebook', 'custom']).default('youtube'),
  rtmpUrl: z.string().min(1),
  streamKey: z.string().optional(),
  enabled: z.boolean().default(true)
});

export type StreamDestination = z.infer<typeof StreamDestinationSchema>;

export const StreamConfigSchema = z.object({
  provider: z.enum(['ffmpeg', 'obs']).default('ffmpeg'),
  rtmpUrl: z.string().url().or(z.string().regex(/^rtmps?:\/\/.+/)),
  streamKey: z.string().optional(),
  destinations: z.array(StreamDestinationSchema).optional(),
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
  username: z.string().min(1).default('admin'),
  password: z.string().min(1)
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

export const ChatMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  message: z.string(),
  timestamp: z.number(),
  badge: z.enum(['viewer', 'moderator', 'sponsor', 'vip', 'owner']).default('viewer'),
  isCommand: z.boolean().default(false),
  authorPhotoUrl: z.string().optional(),
  superChatAmount: z.string().optional(),
  source: z.string().optional().default('youtube')
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const CommentaryItemSchema = z.object({
  id: z.string(),
  speaker: z.string().default('TEZMC AI'),
  text: z.string(),
  mood: z.enum(['calm', 'excited', 'cautious', 'curious']).default('calm'),
  timestamp: z.number()
});

export type CommentaryItem = z.infer<typeof CommentaryItemSchema>;


import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { SessionRecord, SessionState } from '@autoplay/shared';
import { logger } from './logger.js';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite');

export class DbService {
  private static instance: DbService;
  private db: any;

  private constructor() {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/autoplay.sqlite';
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.runMigrations();
  }

  public static getInstance(): DbService {
    if (!DbService.instance) {
      DbService.instance = new DbService();
    }
    return DbService.instance;
  }

  private runMigrations(): void {
    const migrationFile = path.resolve(process.cwd(), 'database/migrations/001_initial_schema.sql');
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, 'utf8');
      this.db.exec(sql);
      logger.info('Applied database migration schema 001_initial_schema.sql successfully.');
    } else {
      const fallbackSql = `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL,
          state TEXT NOT NULL,
          desired_state TEXT NOT NULL DEFAULT 'STOPPED',
          start_time TEXT,
          end_time TEXT,
          restart_count INTEGER NOT NULL DEFAULT 0,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          last_failure_reason TEXT,
          game_config TEXT NOT NULL,
          stream_config TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          payload_redacted TEXT,
          ip_address TEXT,
          timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
      `;
      this.db.exec(fallbackSql);
    }
  }

  public saveSession(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, game_id, state, desired_state, start_time, end_time, restart_count, consecutive_failures, last_failure_reason, game_config, stream_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        state = excluded.state,
        desired_state = excluded.desired_state,
        end_time = excluded.end_time,
        restart_count = excluded.restart_count,
        consecutive_failures = excluded.consecutive_failures,
        last_failure_reason = excluded.last_failure_reason,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      session.id,
      session.gameId,
      session.state,
      session.desiredState,
      session.startTime || null,
      session.endTime || null,
      session.restartCount,
      session.consecutiveFailures,
      session.lastFailureReason || null,
      JSON.stringify(session.gameConfig),
      session.streamConfig ? JSON.stringify(session.streamConfig) : null,
      session.createdAt,
      session.updatedAt
    );
  }

  public getSession(id: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapSessionRow(row);
  }

  public listSessions(limit = 50): SessionRecord[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => this.mapSessionRow(r));
  }

  public recordAuditLog(action: string, resource: string, payload: any, userId = 'operator', ip = '127.0.0.1'): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource, payload_redacted, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      `audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      userId,
      action,
      resource,
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      ip,
      new Date().toISOString()
    );
  }

  private mapSessionRow(row: any): SessionRecord {
    return {
      id: row.id,
      gameId: row.game_id,
      state: row.state as SessionState,
      desiredState: row.desired_state,
      startTime: row.start_time,
      endTime: row.end_time,
      restartCount: row.restart_count,
      consecutiveFailures: row.consecutive_failures,
      lastFailureReason: row.last_failure_reason,
      gameConfig: JSON.parse(row.game_config || '{}'),
      streamConfig: row.stream_config ? JSON.parse(row.stream_config) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

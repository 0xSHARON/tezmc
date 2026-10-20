-- AutoPlay AI Production Database Schema (SQLite / PostgreSQL Compatible)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS roles (
    name TEXT PRIMARY KEY,
    description TEXT,
    permissions TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_adapters (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS adapter_configs (
    id TEXT PRIMARY KEY,
    adapter_id TEXT NOT NULL,
    config_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY(adapter_id) REFERENCES game_adapters(id)
);

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

CREATE TABLE IF NOT EXISTS session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS game_progress (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    current_objective TEXT NOT NULL,
    progress_percent REAL NOT NULL DEFAULT 0.0,
    blocks_traveled INTEGER NOT NULL DEFAULT 0,
    death_count INTEGER NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS stream_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'ffmpeg',
    rtmp_url TEXT NOT NULL,
    encrypted_stream_key TEXT,
    width INTEGER NOT NULL DEFAULT 1280,
    height INTEGER NOT NULL DEFAULT 720,
    fps INTEGER NOT NULL DEFAULT 30,
    video_bitrate TEXT NOT NULL DEFAULT '2500k',
    audio_bitrate TEXT NOT NULL DEFAULT '128k',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS stream_events (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    metrics_json TEXT,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    duration_minutes INTEGER NOT NULL DEFAULT 120,
    enabled INTEGER NOT NULL DEFAULT 1,
    game_config TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS system_metrics (
    id TEXT PRIMARY KEY,
    cpu_usage_percent REAL NOT NULL,
    memory_usage_percent REAL NOT NULL,
    free_memory_mb REAL NOT NULL,
    disk_free_mb REAL NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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

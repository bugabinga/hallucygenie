-- HallucyGenie v1.0.0 released SQLite schema fixture
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE app_state (
    key TEXT PRIMARY KEY, -- noqa: RF04
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'audio', 'music')),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    prompt TEXT,
    tool_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    params_json TEXT
);

CREATE TABLE daily_usage (
[date] TEXT NOT NULL,
feature TEXT NOT NULL,
count INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY ([date], feature)
) ;

CREATE TABLE drafts (
session_id TEXT NOT NULL,
kind TEXT NOT NULL CHECK (kind IN ('chat', 'create')),
value_json TEXT NOT NULL,
updated_at TEXT NOT NULL DEFAULT (datetime ('now')),
PRIMARY KEY (session_id, kind),
FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
) ;

CREATE TABLE messages (
id INTEGER PRIMARY KEY AUTOINCREMENT,
session_id TEXT NOT NULL,
role TEXT NOT NULL,
content TEXT NOT NULL,
tool_calls_json TEXT,
tool_call_id TEXT,
created_at TEXT NOT NULL DEFAULT (datetime ('now')),
thinking TEXT
) ;

CREATE TABLE preferences (
key TEXT PRIMARY KEY, -- noqa: RF04
value TEXT NOT NULL,
updated_at TEXT NOT NULL DEFAULT (datetime ('now'))
) ;

CREATE TABLE schema_migrations (
version INTEGER PRIMARY KEY,
applied_at TEXT NOT NULL
) ;

CREATE TABLE sessions (
id TEXT PRIMARY KEY,
name TEXT NOT NULL,
name_source TEXT NOT NULL CHECK (name_source IN ('default', 'manual', 'auto')),
created_at TEXT NOT NULL DEFAULT (datetime ('now')),
updated_at TEXT NOT NULL DEFAULT (datetime ('now')),
archived_at TEXT
) ;

CREATE TABLE tool_input_history (
id TEXT PRIMARY KEY,
session_id TEXT NOT NULL,
kind TEXT NOT NULL,
origin TEXT NOT NULL CHECK (origin IN ('create', 'chat', 'agent')),
tool_name TEXT NOT NULL,
input_json TEXT NOT NULL,
status TEXT NOT NULL CHECK (status IN ('submitted', 'succeeded', 'failed')),
asset_id TEXT,
hidden_at TEXT,
created_at TEXT NOT NULL DEFAULT (datetime ('now')),
updated_at TEXT NOT NULL DEFAULT (datetime ('now')),
FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
) ;

CREATE INDEX idx_assets_session ON assets (session_id, created_at DESC) ;

CREATE INDEX idx_assets_session_created ON assets (
session_id,
created_at DESC
) ;

CREATE INDEX idx_drafts_session_kind ON drafts (session_id, kind) ;

CREATE INDEX idx_messages_session ON messages (session_id, created_at) ;

CREATE INDEX idx_messages_session_created ON messages (
session_id,
created_at,
id
) ;

CREATE INDEX idx_sessions_active_updated ON sessions (
archived_at,
updated_at DESC
) ;

CREATE INDEX idx_tool_input_history_session_kind
ON tool_input_history (
session_id,
kind,
hidden_at,
created_at DESC
) ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(1, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(2, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(3, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(4, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(5, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(6, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(7, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(8, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(9, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(10, '2026-05-27T00:00:00Z') ;

INSERT INTO
schema_migrations (version, applied_at)
VALUES
(11, '2026-05-27T00:00:00Z') ;

COMMIT ;

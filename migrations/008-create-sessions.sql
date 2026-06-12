CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_source TEXT NOT NULL CHECK (
        name_source IN ('default', 'manual', 'auto')
    ),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_active_updated ON sessions (
    archived_at, updated_at DESC
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages (
    session_id, created_at, id
);

CREATE INDEX IF NOT EXISTS idx_assets_session_created ON assets (
    session_id, created_at DESC
);

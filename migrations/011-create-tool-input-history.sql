CREATE TABLE IF NOT EXISTS tool_input_history (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('create', 'chat', 'agent')),
    tool_name TEXT NOT NULL,
    input_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'succeeded', 'failed')),
    asset_id TEXT,
    hidden_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tool_input_history_session_kind
ON tool_input_history (
    session_id, kind, hidden_at, created_at DESC
);

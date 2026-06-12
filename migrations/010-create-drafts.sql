CREATE TABLE IF NOT EXISTS drafts (
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('chat', 'create')),
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (session_id, kind),
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_drafts_session_kind ON drafts (session_id, kind);

CREATE TABLE IF NOT EXISTS mcp_credentials (
    mcp_id TEXT PRIMARY KEY,
    secret TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

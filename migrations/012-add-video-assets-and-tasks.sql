-- Add generated video assets and durable MiniMax video task state.
CREATE TABLE IF NOT EXISTS video_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    provider_task_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending',
            'running',
            'succeeded',
            'failed',
            'timeout',
            'cancelled'
        )
    ),
    prompt TEXT NOT NULL,
    file_id TEXT,
    asset_id TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_tasks_session ON video_tasks (session_id, updated_at DESC);

ALTER TABLE assets
RENAME TO assets_old;

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('image', 'audio', 'music', 'video')),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    prompt TEXT,
    tool_name TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    params_json TEXT
);

INSERT INTO
    assets (
        id,
        session_id,
        type,
        filename,
        mime_type,
        prompt,
        tool_name,
        size_bytes,
        created_at,
        params_json
    )
SELECT
    id,
    session_id,
    type,
    filename,
    mime_type,
    prompt,
    tool_name,
    size_bytes,
    created_at,
    params_json
FROM
    assets_old;

DROP TABLE assets_old;

CREATE INDEX IF NOT EXISTS idx_assets_session ON assets (session_id, created_at DESC);

-- Draft persistence: chat drafts and Create form drafts scoped to session
CREATE TABLE drafts (
    session_id TEXT NOT NULL,
    draft_type TEXT NOT NULL CHECK (draft_type IN ('chat', 'create')),
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime ('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime ('now')),
    PRIMARY KEY (session_id, draft_type)
);

CREATE INDEX IF NOT EXISTS idx_drafts_session ON drafts (session_id);

# Task: HG-019 — Media Asset Persistence + Gallery

**Created:** 2026-04-18
**Size:** M

## Review Level: 2 (Plan + Code)

**Assessment:** New DB table + file storage + gallery UI. Data model change.
**Score:** 4/8 — Blast radius: 2 (backend + frontend + DB), Pattern novelty: 1 (new storage pattern), Security: 0, Reversibility: 1 (new table, migration)

## Mission

Persist generated media files to disk and track them in SQLite. Add a gallery UI where the kid can browse all generated images, music, and voice recordings sorted by date. Files stored in `data/assets/{sessionId}/` — not as SQLite blobs (blobs bloat DB, prevent streaming, slow backups).

**Why:** Currently generated media lives only in the chat stream. If the kid wants to see that cool image from yesterday, they have to scroll through the whole conversation. Gallery gives instant access.

## Dependencies

- **Task:** HG-018 (media tools must exist first — we're persisting their output)

## Context to Read First

- `tools.ts` — current tool executors that return media
- `db.ts` — SQLite patterns, migration system
- `public/app.ts` — existing UI
- `public/style.css` — dark theme

## File Scope

- `db.ts` — add `assets` table, `saveAsset()`, `getAssets()`, `deleteAsset()`
- `migrations/005-create-assets.sql` — new migration
- `tools.ts` — wire saveAsset into image/music/TTS executors
- `server.ts` — add `GET /assets/:sessionId/:filename` static file serving
- `public/app.ts` — gallery button, modal, grid rendering
- `public/style.css` — gallery grid styles
- `*.test.ts` — test new functions and UI

## Steps

### Step 1: Database migration and CRUD

- [ ] Create `migrations/005-create-assets.sql`: `assets (id INTEGER PRIMARY KEY, session_id TEXT, type TEXT, filename TEXT, prompt TEXT, created_at TEXT)`
- [ ] Add `saveAsset(db, sessionId, type, filename, prompt)`
- [ ] Add `getAssets(db, sessionId, type?, limit?, offset?)` — sorted by created_at DESC
- [ ] Add `deleteAsset(db, id)`
- [ ] Test all CRUD functions

### Step 2: File storage + static serving

- [ ] Create `data/assets/{sessionId}/` directory on demand
- [ ] In each tool executor that returns media (image, TTS, music): save file to disk, call `saveAsset()`
- [ ] Images: save from URL (fetch + write) or buffer
- [ ] Audio: save hex MP3 decoded to file (existing `Buffer.from(hex, "hex")` pattern)
- [ ] Add `GET /assets/:sessionId/:filename` route in server.ts — serve with correct MIME type, scoped to session
- [ ] Ensure `data/assets/` is in `.gitignore`

### Step 3: Gallery UI

- [ ] Add 📸 button in header (next to Create button)
- [ ] Clicking opens gallery modal/drawer
- [ ] Grid of thumbnails, sorted newest first
- [ ] Filter tabs: All | 🎨 Images | 🎵 Music | 🎤 Voice
- [ ] Each item: thumbnail/preview, date, truncated prompt
- [ ] Click to expand: full-size image, audio player, original prompt, delete button
- [ ] Fetch from `GET /api/assets?sessionId=...&type=...` (new endpoint wrapping `getAssets()`)

### Step 4: Test

- [ ] Test asset CRUD operations
- [ ] Test file saving with mocked FS
- [ ] Test gallery rendering
- [ ] Test static file serving
- [ ] `just test` passes all tests

## Do NOT

- Store media as SQLite blobs — use files
- Serve assets without session scoping
- Delete chat messages when deleting assets (they're independent)
- Load all assets at once — paginate (20 per page)

## Must Update

- `AGENTS.md` — add assets storage to architecture
- `Tasks/CONTEXT.md` — update test coverage
- `.gitignore` — add `data/assets/`

## Check If Affected

- `agent.ts` — should NOT change
- `log.ts` — should NOT change

## Git Commit Convention

```
HG-019: add media asset persistence and gallery

- SQLite assets table + file storage in data/assets/
- Tool executors save generated media to disk
- Gallery UI with filter tabs and audio playback
- Static file serving scoped to session
- Co-authored-by: task-agent
```

## Amendments

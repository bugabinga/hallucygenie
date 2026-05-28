# Changelog

## 1.0.0 - 2026-05-27

First release.

### Kid notes

• Create images, voices, music, lyrics, searches, and image analysis from one UI.
• Save generated assets locally and reopen them from the Assets tab.
• Switch chats without losing drafts.
• Profile avatar and style notes personalize creative help.
• “What’s new?” is available from the header.

### Parent notes

• No built-in auth. Run on localhost or a trusted network only.
• MiniMax calls use real quota when `MINIMAX_API_KEY` is set.
• Generated media is stored under `data/` and should be backed up before upgrades.
• YouTube cover extraction is disabled unless `COVER_EXTRACTOR_URL` is configured.

### Database

• First release baseline is SQLite schema version 11.
• Future schema changes must add numbered migrations and release notes.
• No destructive migration exists in this release.

### Container

• GHCR image: `ghcr.io/bugabinga/hallucygenie:v1.0.0`.
• Runtime uses non-root `bun` user.
• Image includes OCI labels. Podman run/Quadlet config uses `/api/health` healthcheck.

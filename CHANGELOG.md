# Changelog

## 1.0.2 - 2026-06-12

First published release.

### Kid notes

• Create images, voices, music, lyrics, searches, image analysis, videos, reference-image pictures, and long narrations from one UI.
• Save generated images, audio, music, and videos locally and reopen them from the Assets tab.
• Switch chats without losing drafts, Create inputs, history, pending tasks, or profile style notes.
• Use friendlier Create controls: fixed choices, sliders, upload/drag-drop, clear tool cards, and edit/reuse actions.
• “What’s new?” is available from the header.

### Parent notes

• No built-in auth. Run on localhost or a trusted network only.
• MiniMax calls use real quota when `MINIMAX_API_KEY` is set; image, voice, music, video, search, and analysis provider failures are shown and persisted.
• Generated media is stored under `data/` and should be backed up before upgrades.
• Long video/TTS tasks persist locally so reloads do not lose pending work.
• YouTube cover extraction is disabled unless `COVER_EXTRACTOR_URL` is configured.

### Database

• First published baseline is SQLite schema version 14.
• Baseline includes sessions, drafts, create history, assets, video tasks, async TTS tasks, and provider diagnostics.
• Future schema changes must add numbered migrations and release notes.
• No destructive migration exists in this release.

### Fixed issues

• Fixed 131 tracked release issues through HG-ISSUE-142, including MiniMax tool drift, media asset persistence, profile/avatar flows, session/draft persistence, accessibility, mobile layout, release automation, POSIX CI smoke testing, Podman publish compatibility, Podman smoke testing, video, subject-reference image generation, and async long TTS.
• All `.system/issues/` release blockers are fixed or folded into the v1 baseline.

### Container

• GHCR image: `ghcr.io/bugabinga/hallucygenie:v1.0.2`.
• Runtime uses non-root `bun` user.
• Image includes OCI labels. Podman run/Quadlet config uses `/api/health` healthcheck.

## 1.0.1 - 2026-06-12

Superseded before publication.

• Tag was cut and local release proof passed.
• GHCR publish failed before image upload because GitHub Actions Podman does not support `podman build --push`.
• Use `v1.0.2`.

## 1.0.0 - 2026-06-12

Superseded before publication.

• Tag was cut and local release proof passed.
• GHCR publish failed before image upload because the CI shell is POSIX `sh` and the release smoke recipe used Bash-only `$RANDOM`.
• Use `v1.0.2`.

# HG-TICKET-042 — YouTube metadata result card UI

**Spec:** `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-040-youtube-video-info-tool.md`

## Goal

Render fetched YouTube metadata safely in chat/Create context.

## Scope

- Card with title, thumbnail, channel, small description excerpt.
- Buttons/prompts can use as inspiration.
- Sanitize all untrusted metadata.
- No dashboard/feed.

## Tests

- Frontend unit: card renders title/thumbnail safely.
- Unit: raw HTML in metadata is escaped.

## Devil check

Fetched YouTube text is untrusted. Never render raw HTML.

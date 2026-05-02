# HG-TICKET-041 — `youtube_channel_recent` tool

**Spec:** `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-038-youtube-api-research.md`, `HG-TICKET-039-youtube-url-parsers.md`

## Goal

Fetch a tiny recent-video list for a channel if research approves.

## Scope

- Input: channel URL/handle, limit.
- Clamp `limit <= 5`.
- Return titles/thumbnails/channel names only.
- Safe/friendly errors.

## Tests

- Unit: limit clamp.
- Integration: mocked recent uploads.
- Unit: output sanitized/trimmed.

## Devil check

No infinite feed, analytics, comments, or doom-scrolling UI.

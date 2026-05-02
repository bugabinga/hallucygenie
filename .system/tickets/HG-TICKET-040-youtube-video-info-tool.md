# HG-TICKET-040 — `youtube_video_info` tool

**Spec:** `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-038-youtube-api-research.md`, `HG-TICKET-039-youtube-url-parsers.md`

## Goal

Fetch small public metadata for one YouTube video if research approves.

## Scope

- Tool input: `url_or_id`.
- Output: title, channel, thumbnail_url, description excerpt, published_at.
- `YOUTUBE_API_KEY` optional config; friendly error if missing.
- Sanitize/trim text output.

## Tests

- Unit: missing API key friendly error.
- Integration: mocked YouTube API video info.
- Unit: metadata sanitized/trimmed.

## Devil check

No comments, upload, OAuth, or account data.

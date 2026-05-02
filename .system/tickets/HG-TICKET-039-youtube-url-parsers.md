# HG-TICKET-039 — YouTube URL parsing helpers

**Spec:** `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** S  
**Depends:** `HG-TICKET-038-youtube-api-research.md`

## Goal

If research approves implementation, add small parsers for YouTube video/channel inputs.

## Scope

- Parse video IDs from normal/short/embed URLs.
- Parse channel handles/channel URLs.
- Reject unsupported/ambiguous inputs.

## Tests

- Unit: URL variants.
- Unit: invalid inputs fail with friendly error.

## Devil check

No network calls here. Pure parsing only.

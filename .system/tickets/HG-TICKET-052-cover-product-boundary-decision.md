# HG-TICKET-052 — Cover/remix product boundary decision

**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`, `.system/specs/HG-SPEC-010-youtube-api-integration-research.md`  
**Status:** Blocked  
**Priority:** Medium  
**Size:** S  
**Depends:** `HG-TICKET-038-youtube-api-research.md`, `HG-TICKET-051-music-cover-minimax-research.md`

## Goal

Choose the safest valuable v1 for cover/remix.

## Scope

- Compare bundled samples, legal direct audio URL, own YouTube videos, arbitrary URL + attestation.
- Decide build/no-build for YouTube extraction.
- Update specs with chosen boundary.

## Tests

None; product decision doc/spec update.

## Devil check

If rights/legal path is unclear, choose no-build or bundled samples.

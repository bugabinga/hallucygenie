# HG-TICKET-053 — Cover rights gate UI

**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-052-cover-product-boundary-decision.md`

## Goal

Require explicit rights attestation before cover/remix generation.

## Scope

- UI checkboxes: own video/music, royalty-free/public-domain, permission.
- Block continue if none selected.
- Offer safer alternative: generate new song with similar vibe.
- Store attestation in asset params when generation exists.

## Tests

- Frontend unit: generation blocked without attestation.
- Frontend unit: selected attestation sent/saved.

## Devil check

Rights gate is not legal magic. Keep scope conservative.

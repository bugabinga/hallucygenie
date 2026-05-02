# HG-TICKET-054 — Music cover smallest safe implementation

**Spec:** `.system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md`  
**Status:** Blocked  
**Priority:** Low  
**Size:** M  
**Depends:** `HG-TICKET-052-cover-product-boundary-decision.md`, `HG-TICKET-053-cover-rights-gate-ui.md`, `HG-TICKET-033-asset-params-db.md`

## Goal

Implement only the approved smallest safe cover/remix slice.

## Scope

- Depends on product boundary decision.
- Save output as local music asset.
- Store source metadata and rights attestation in params.
- Clean temp files on success/failure.
- No raw source/output audio in messages/context.

## Tests

- Unit/integration: rights gate, payload, asset save, temp cleanup.
- DB invariant: no raw audio in messages/context.

## Devil check

Do not implement arbitrary YouTube extraction unless explicitly approved.

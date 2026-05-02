# HG-TICKET-046 — MiniMax lyrics API smoke research

**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** Ready  
**Priority:** Medium  
**Size:** S

## Goal

Verify `POST /v1/lyrics_generation` request/response shape for current plan.

## Scope

- Run mocked/unit design first; live smoke only via existing MiniMax test path if approved.
- Record response shape: plain text vs structured sections.
- Decide whether `lyrics_optimizer` stays internal.
- Update MiniMax docs/spec notes.

## Tests

- If script changes: unit test output hides raw long content/secrets.

## Devil check

Research only. Do not spend music quota accidentally except explicit smoke.

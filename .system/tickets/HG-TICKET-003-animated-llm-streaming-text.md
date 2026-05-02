# HG-TICKET-003: Animated LLM streaming text

**Spec:** `.system/specs/HG-SPEC-002-animated-llm-streaming-text.md`  
**Status:** Done  
**Priority:** Medium  
**Size:** M

## Goal

Add low-risk themed streaming state for assistant text: subtle neon glow + caret while streaming, final markdown remains source of truth.

## Scope

1. Add streaming class/state to active assistant text region.
2. Add CSS caret/glow animation.
3. Remove streaming class on done/error.
4. Respect `prefers-reduced-motion`.
5. Do not animate restored history.
6. Do not use chunk spans in v1.

## Devil review

Do not implement chunk reveal first. It risks markdown jump, DOM churn, and flaky tests.

Safe path:

- caret/glow only
- no extra ARIA live regions
- no per-token spans
- no layout-affecting animation
- final markdown render unchanged

## Open questions

None. Chunk reveal deferred.

## Tests

- `test/app.test.ts`: active text region gets `.is-streaming`, removed on done/error.
- `test/static.test.ts`: caret keyframes and reduced-motion rule exist.
- E2E: streaming class observable with delayed mock stream.

## Completion notes

Implemented 2026-05-01:

- `.assistant-text-region.is-streaming` applied during streamed text.
- Class removed on `done`/finish.
- CSS neon text-shadow + caret blink added.
- Reduced-motion rule disables animation.
- Chunk reveal deferred.

## Acceptance criteria

- [x] Active assistant text shows themed streaming state.
- [x] Streaming state removed on done/error.
- [x] Final markdown correct.
- [x] Tool cards unaffected.
- [x] Reduced motion disables animation.
- [x] `just check` + `just test-unit` pass.

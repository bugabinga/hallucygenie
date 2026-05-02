# HG-ISSUE-016 — Streaming text animation not perceptible

**Status:** Fixed
**Severity:** Medium
**Reported:** 2026-05-01
**Components:** `public/app.ts`, `public/style.css`, `.system/specs/HG-SPEC-002-animated-llm-streaming-text.md`, `.system/tickets/HG-TICKET-003-animated-llm-streaming-text.md`

## Description

Assistant streaming text does not look animated in practice. Text appears normally with little/no visible streaming effect.

## Existing Spec / Ticket Status

### Spec exists

- `.system/specs/HG-SPEC-002-animated-llm-streaming-text.md`
- Status section: **Revised after devil review**
- Acceptance checklist in spec is still unchecked:
  - `[ ] Assistant streaming has themed animation/state.`
  - `[ ] Prior content does not reanimate every update.`
  - `[ ] Final message renders markdown correctly.`
  - `[ ] Reduced motion disables animation.`

### Ticket exists and is marked Done

- `.system/tickets/HG-TICKET-003-animated-llm-streaming-text.md`
- `**Status:** Done`
- Completion notes say implemented:
  - `.assistant-text-region.is-streaming` applied during streamed text
  - CSS neon text-shadow + caret blink added
  - chunk reveal deferred

## Current Implementation

`public/app.ts`:

```ts
textRegion.classList.add("is-streaming");
textRegion.innerHTML = renderMarkdown(rawTextBuffer);
```

`public/style.css`:

```css
.assistant-text-region.is-streaming {
  text-shadow: 0 0 10px rgba(0, 232, 162, 0.18);
}

.assistant-text-region.is-streaming::after {
  content: "▌";
  color: var(--color-secondary);
  animation: caret-blink 900ms steps(1) infinite;
}
```

## Root Cause

The implemented "animation" is only:

- faint text shadow (`rgba(..., 0.18)`)
- blinking caret pseudo-element

There is **no actual chunk reveal / materialization / fade-in animation**. Also, each chunk re-renders the entire markdown region with:

```ts
textRegion.innerHTML = renderMarkdown(rawTextBuffer);
```

That means per-chunk DOM identity is destroyed. Any CSS animation applied to child nodes would restart or flicker unless carefully handled.

The ticket was marked Done for Phase 1 only, but user-visible expectation is closer to Phase 2 from the spec.

## Fix Direction

Implement a perceptible but safe Phase 2:

- keep final markdown as source of truth
- avoid per-character spans
- animate only newly received text chunks
- do not reanimate old chunks
- no layout shift
- reduced-motion disables animation

Possible implementation:

1. During stream, render plain escaped chunks into `.stream-chunk` spans.
2. Append only new chunk span per SSE text delta.
3. Animate `.stream-chunk` with subtle opacity/translate/glow.
4. On `done`, replace streaming region once with final `renderMarkdown(rawTextBuffer)`.
5. Remove all `.stream-chunk` nodes after finalization.

## Tests Needed

- Unit: during stream, new chunks get `.stream-chunk`
- Unit: old chunks do not get duplicated/reanimated
- Unit: on `[DONE]`, final markdown replaces stream chunks
- Static: `.stream-chunk` animation exists
- Static: reduced-motion disables `.stream-chunk` animation
- E2E: delayed SSE stream visibly has streaming state before done

## 2026-05-02 fix

Streaming now appends only new `.stream-chunk` spans during SSE text deltas. On `[DONE]`, chunks are replaced once with final markdown HTML.

Verification:

- Regression test proves `.stream-chunk` exists during streaming and is gone after final markdown render.
- Manual Chrome observed `chunks: 1`, `streaming: 1` mid-stream, then `chunks: 0`, `streaming: 0` after done.

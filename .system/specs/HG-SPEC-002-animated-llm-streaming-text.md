# HG-SPEC-002: Animated LLM streaming text

**Status:** Done

## Goal

Make assistant streaming feel magical, fast, and on-theme without hurting readability, markdown correctness, accessibility, or performance.

## Verdict status

**Revised after devil review.** First implementation should prefer a low-risk streaming caret/glow + optional chunk reveal that never compromises final markdown.

## Theme fit

HallucyGenie theme: dark, neon red/green/gold, playful genie/gaming vibe.

Animation should feel like:

- magic text materializing
- neon terminal/glow reveal
- subtle assistant energy

## Non-goals

- No heavy animation library.
- No canvas/WebGL.
- No per-character DOM explosion.
- No animation on restored history.
- No markdown correctness regression.
- No screen-reader announcement spam.

## UX requirements

1. While assistant streams, bubble shows subtle themed activity.
2. New text may get chunk-level reveal, but only if it does not reanimate old chunks.
3. Final message renders markdown correctly.
4. No visible duplicate/jump at `done`.
5. Tool cards remain stable and never get wiped/reanimated.
6. Reduced motion disables animation.

```css
@media (prefers-reduced-motion: reduce) {
  .stream-chunk,
  .assistant-text-region.is-streaming::after {
    animation: none;
    filter: none;
    transform: none;
  }
}
```

## Recommended implementation

### Phase 1: safe caret/glow

Keep current markdown rendering stable. Add `.is-streaming` to active `.assistant-text-region` while SSE stream is open.

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

Remove `.is-streaming` on `done` and on error.

### Phase 2: optional chunk reveal

If implemented, use chunk-level spans only for new raw text during stream:

```html
<span class="stream-chunk">new escaped chunk</span>
```

Rules:

1. Keep raw accumulated markdown text separately.
2. Append only newly arrived escaped text chunks.
3. Do not rebuild old chunk DOM during stream.
4. On `done`, replace streaming text region exactly once with final rendered markdown.
5. After finalization, no `.stream-chunk` nodes remain in completed msg.
6. If markdown finalization would cause visible jump, fall back to Phase 1 only.

## Markdown correctness

Streaming chunks may split markdown syntax:

```text
**bo
ld**
```

Therefore:

- streaming display may be plain escaped text or current full markdown render
- final `done` render is source of truth
- final markdown snapshot tests must pass

## Accessibility

- Keep `#message-list` live region unchanged.
- Do not add nested live regions.
- Do not create one ARIA-announced node per token.
- Respect reduced motion.
- Text remains selectable/copyable after final render.

## Performance constraints

- No per-character spans.
- Coalesce tiny chunks if chunk reveal is used.
- No timers per token.
- Avoid forced layout reads.
- Cap transient chunk nodes; final cleanup is mandatory.

## Tests

### Unit/frontend

Update `test/app.test.ts`:

- active assistant text region gets `.is-streaming` during stream
- `.is-streaming` removed on `done`
- final markdown renders correctly after stream
- tool cards persist while text streams after tool result
- optional chunk reveal does not duplicate old chunks
- completed message contains no `.stream-chunk` after `done`

### Static

Update `test/static.test.ts`:

- `caret-blink` or `stream-materialize` keyframes exist
- reduced-motion rule disables streaming animation
- no per-character animation selectors required

### E2E

Update `e2e/run-e2e.ts`:

- mocked SSE stream includes deterministic delay so streaming state is observable
- assert `.is-streaming` appears during stream
- assert `.is-streaming` removed after done
- assert final assistant text visible
- assert input/header dimensions remain stable within tolerance

## Acceptance criteria

- [ ] Assistant streaming has themed animation/state.
- [ ] Prior content does not reanimate every update.
- [ ] Final message renders markdown correctly.
- [ ] No visible duplicate/jump at stream completion.
- [ ] Tool cards persist during/after streaming.
- [ ] Reduced motion disables animation.
- [ ] No input/header layout shift.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] `just test-e2e` passes.

## Decisions

1. Start with caret/glow as safest first pass.
2. Chunk reveal is optional and must clean up on `done`.
3. Thinking text may use dimmer variant only after base streaming animation is stable.
4. User message animation is out of scope.

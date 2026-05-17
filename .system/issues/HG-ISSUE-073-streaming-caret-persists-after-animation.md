---
{ "status": "fixed", "specs": ["HG-SPEC-002"] }
---

# HG-ISSUE-073: Streaming caret persists after animation

Repro:

- Send a message and wait for the assistant response to finish streaming.
- Observe previous assistant messages after text animation/rendering has completed.

Observed:

- Some completed assistant messages still show a blinking cursor/caret.
- The caret is fine during active text streaming animation, but looks broken after completion.

Expected:

- The blinking cursor/caret is visible only while the assistant message is actively streaming or animating in.
- Once stream `done` and final render/animation finish, no completed message shows the caret.
- Restored history never shows a streaming caret.

Cause:

- The caret is attached to `.assistant-text-region.is-streaming::after`.
- Some path likely leaves `.is-streaming` on a completed region, or re-adds it without guaranteed cleanup after final animation.

Fix:

- Ensure every stream completion/error/cancel path removes `.is-streaming` from all assistant text regions.
- If animation continues briefly after stream `done`, use a separate short-lived animation class instead of keeping `.is-streaming` alive.
- Add regression tests that completed messages and loaded history have no `.is-streaming` regions/caret selectors active.

Resolution 2026-05-17:

- `streamChat()` now calls `finishStreaming()` if the SSE body closes without an explicit `[DONE]` event.
- `finishStreaming()` removes `.is-streaming` from every assistant text region, not just the current assistant container.
- Stale `.stream-chunk` wrappers from previous messages are unwrapped so old messages keep text but lose caret/animation state.
- Added regression coverage for streams that close without `[DONE]` and stale prior messages that still had `.is-streaming`.

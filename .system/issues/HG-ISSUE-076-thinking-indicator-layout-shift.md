---
{ "status": "fixed", "specs": ["HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-076: Thinking indicator causes chat layout shift

Repro:

- Send a chat message.
- While the assistant is thinking/streaming, observe the bottom of the message list and input area.

Observed:

- The bottom `#typing-indicator` appears during assistant thinking.
- With long scrollback, final text renders while the indicator is visible.
- When the indicator disappears after `[DONE]`, the bottom of the list visibly changes again.
- This breaks stable UI during the final transition from thinking to done.

Expected:

- Thinking/typing status should not change chat list layout while active.
- The message list and input area should keep stable dimensions.
- Indicator may overlay, float, or live inside a reserved/status layer, but must not push content or change scroll geometry.
- Indicator remains accessible as status text for assistive tech.

Cause:

- Visual bottom status duplicates the assistant placeholder bubble.
- Even outside normal flow, it changes the perceived bottom edge of long scrollback.
- Streaming caret consumes inline width and can wrap to an extra line.
- Removing the streaming state after final text renders shrinks the assistant bubble.

Fix:

- Keep `#typing-indicator` as an accessible `role="status"` only.
- Remove visual dots and visual height.
- Use assistant placeholder/streaming bubble as visible thinking state.
- Make streaming caret zero-width so it cannot wrap or resize the bubble.
- Test long scrollback. Assert scroll height and last assistant message rect do not change when indicator hides after final text.

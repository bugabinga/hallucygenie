---
{ "status": "fixed", "specs": ["HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-076: Thinking indicator causes chat layout shift

Repro:

- Send a chat message.
- While the assistant is thinking/streaming, observe the bottom of the message list and input area.

Observed:

- The bottom `#typing-indicator` appears/disappears as a normal layout element.
- Showing or hiding it changes the vertical layout / available list height.
- This breaks the stable UI requirement; the list layout shifts while the assistant is thinking.

Expected:

- Thinking/typing status should not change chat list layout while active.
- The message list and input area should keep stable dimensions.
- Indicator may overlay, float, or live inside a reserved/status layer, but must not push content or change scroll geometry.
- Indicator remains accessible as status text for assistive tech.

Cause:

- `#typing-indicator` is rendered after `#message-list` as a normal block.
- `setStreamingUI()` toggles `hidden`, which removes/adds it from layout flow.

Fix:

- Redesign typing/thinking indicator as non-layout-affecting UI:
  - fixed/absolute overlay anchored above composer or inside chat shell
  - or always reserved layer with visibility/opacity instead of `display: none`
- Update tests to assert it is out of normal flow and toggled without layout-affecting display changes.

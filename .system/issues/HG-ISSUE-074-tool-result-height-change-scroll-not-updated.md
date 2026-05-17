---
{ "status": "open", "specs": ["HG-SPEC-004", "HG-SPEC-011", "HG-SPEC-012"] }
---

# HG-ISSUE-074: Tool result height change does not update scroll state

Repro:

- Start near the bottom of a chat.
- Ask the LLM to call a tool, e.g. image, voice, music, search, or analyze image.
- While the tool is running, the tool widget renders in loading state with height `x`.
- Wait for the tool to finish.

Observed:

- The same widget is replaced/expanded into the final result state with height `y`, where `y > x`.
- The message list scroll position is not adjusted after the height change.
- The newest content can end below the viewport even though the user was effectively following the stream/tool output.

Expected:

- If the user is at or near the bottom when the tool result arrives, the message list should remain pinned to the bottom after the widget height changes.
- If the user intentionally scrolled up, do not force-scroll.
- Height changes from images/audio/tool cards should keep scroll-follow behavior consistent with text streaming.

Cause:

- Scroll-to-bottom likely runs when the loading widget is inserted, but not after the final tool result replaces/expands it.
- Media/tool result layout can change after DOM replacement or after media metadata loads, requiring another scroll adjustment.

Fix:

- Track whether the chat was near bottom before replacing a tool loading card.
- After rendering the tool result, re-scroll to bottom only if it was near bottom.
- For media cards, also handle late layout changes from image/audio load/metadata events.
- Add regression tests for loading-card → taller result-card replacement preserving bottom-follow state.

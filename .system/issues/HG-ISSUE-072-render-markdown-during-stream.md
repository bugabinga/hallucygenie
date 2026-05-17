---
{ "status": "fixed", "specs": ["HG-SPEC-002"] }
---

# HG-ISSUE-072: Render markdown during streaming

Repro:

- Send a prompt that streams Markdown, e.g. bullets, bold text, links, code, or headings.
- Watch assistant text while chunks arrive.

Observed:

- Incoming chunks first appear as raw Markdown text.
- Chunk reveal animation then runs on raw text.
- On stream `done`, the message is replaced with rendered Markdown.
- This causes a visible state change/jump from unrendered Markdown to rendered HTML.

Expected:

- Streaming assistant text should be rendered as Markdown throughout the stream.
- The final `done` render should not visibly transform raw Markdown into formatted Markdown.
- Animation should still feel like text materializing.
- Partial/incomplete Markdown should degrade gracefully without unsafe HTML or broken layout.

Cause:

- `appendText()` appends escaped raw text inside `.stream-chunk` spans during SSE.
- `finalizeStreamingMessages()` later replaces the whole streaming region with `renderMarkdown(rawTextBuffer)`.

Possible fix:

- During streaming, render accumulated Markdown on each text chunk or on a short debounce/frame.
- Preserve chunk-level or region-level animation without per-character DOM.
- Avoid replacing stable tool cards/thinking blocks.
- Ensure links/images/raw HTML remain sanitized by the Markdown renderer during partial streams.
- Add regression tests proving raw Markdown tokens are not visible after streaming updates when enough syntax has arrived.

Resolution 2026-05-17:

- `appendText()` now renders the accumulated Markdown buffer during streaming instead of appending escaped raw chunk spans.
- Streaming animation moved to `.stream-chunk` wrappers around only newly added rendered text so the whole Markdown message does not flicker.
- `finishStreaming()` still performs a final render and removes `.is-streaming`, but no longer visibly transforms raw Markdown into formatted HTML.
- Added regression coverage that completed Markdown syntax renders before `done` and no `.stream-chunk` raw-text wrappers remain.

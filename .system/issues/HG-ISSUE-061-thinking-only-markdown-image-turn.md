---
{ "status": "fixed", "specs": ["HG-SPEC-002", "HG-SPEC-011"] }
---

Repro:

- Open session `Manual QA Markdown`.
- User prompt: `Output exactly this markdown image and nothing else: ![tiny](https://www.gstatic.com/webp/gallery/1.jpg). No tools.`
- Assistant bubble shows thinking, but final answer is empty.
- DB evidence: session `74ff725e-2f06-405d-b199-02161b3899ec`; user message `id=72`, assistant message `id=73`; assistant `content_len=0`, `thinking_len=320`, no tool calls.
- Thinking says model planned to output the requested markdown image; final content was not persisted/rendered.
- `logs/dev.log` has only request lifecycle evidence for later history loads; no provider stream/body for this turn.

Cause:

- Unknown whether provider emitted no final `text_delta`, app stripped image-only final text, or old stream/save code persisted thinking-only assistant rows.
- Current behavior violates HG-SPEC-002 final message rendering contract.
- Markdown-image path overlaps HG-SPEC-011 raw-media boundary and HG-ISSUE-056 sanitization fix.
- Related: HG-ISSUE-056 changed assistant markdown images to safe links/placeholders; HG-ISSUE-019 covered oversized rendered markdown images.

Fix:

- Thinking-only model turns now emit/persist user-visible fallback: `I got an empty final answer. Please try again.`
- No empty assistant row persists for thinking-only SSE.
- Agent/server regressions cover fallback text, thinking retention, and non-empty assistant persistence.

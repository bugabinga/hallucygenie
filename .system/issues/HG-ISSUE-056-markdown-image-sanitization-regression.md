---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-056: Assistant markdown images still render external media, including thinking

Repro:

- `just dev`, `just dev-chrome`.
- New clean session.
- Ask: `Output exactly this markdown image and nothing else: ![tiny](https://www.gstatic.com/webp/gallery/1.jpg). No tools.`
- Inspect assistant DOM.

Observed:

- Two external `<img>` elements rendered:
  - one inside `.assistant-thinking-region`
  - one inside `.assistant-text-region`
- Both loaded `https://www.gstatic.com/webp/gallery/1.jpg` directly.
- Images had `class="markdown-image"`, `max-width: 100%`, but were not rewritten to asset refs or blocked.

Expected:

- Assistant markdown must not render arbitrary external media as first-class chat media.
- Thinking blocks must never render markdown images.
- HG-ISSUE-019 says image markdown was sanitized/rewrite-sized; this is not true for external markdown images.

Cause:

- Markdown renderer allows image syntax in assistant text and thinking.
- Sanitization only adds sizing/referrer attrs; it does not block/rewrite image markdown.

Fix:

- In assistant/thinking markdown, replace image markdown with safe links or text placeholders.
- Allow real media previews only from tool → asset storage path.
- Add regression: `![x](https://...)` creates zero `<img>` in assistant and thinking regions.

Resolution:

- Markdown image syntax renders as safe links, not `<img>` tags.
- Assistant/thinking regression tests assert external markdown images create zero arbitrary media elements.

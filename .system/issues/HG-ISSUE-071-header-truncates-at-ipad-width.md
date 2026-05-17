---
{ "status": "fixed", "specs": ["HG-SPEC-009", "HG-SPEC-014", "HG-SPEC-015"] }
---

# HG-ISSUE-071: Header truncates at iPad width

Repro:

- Open app at iPad Pro/tablet width.
- Inspect the header.
- The header content is constrained too tightly, so the app identity can truncate while controls remain visible.

Observed:

- `#header` reused `--content-max-width: 720px` for horizontal padding.
- At tablet widths, this leaves roughly chat-column width for the whole header.
- Current header contains identity, session picker, profile, create, and quota controls, which need a wider row budget than chat messages.

Expected:

- Chat content can remain narrow for readability.
- Header controls should use a wider responsive budget and only wrap at genuinely narrow widths.
- `HallucyGenie` remains visible at iPad/tablet widths.

Cause:

- Header was tied to the chat content max width instead of a header-specific control width.

Fix:

- Add `--header-content-max-width: 1040px`.
- Use the wider header max width only for `#header` padding.
- Keep `--content-max-width: 720px` for chat/input readability.
- Add static regression coverage for the distinct header width token.

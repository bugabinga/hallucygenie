# HG-021: Markdown Renderer Rewrite

**Status:** ✅ Complete
**Last Updated:** 2026-04-19
**Breaking:** output format (code block class names)
**Dependencies:** `marked@15.0.4` (exact pin, no `^`)

## Waves

| Wave | Tasks                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `npm install marked@15.0.4`, create `public/markdown.ts` with async:false + checkbox renderer + lang-\* classes + target=\_blank links |
| 2    | Re-export `renderMarkdown` from `public/app.ts`, update `app.test.ts`                                                                  |
| 3    | Verify `just check` + `just test-unit` pass                                                                                            |

## Fixes from Adversarial Review

- [x] `async: false` — synchronous parse (not Promise)
- [x] `sanitize: true` — skipped (marked passes through HTML; sanitize-html optional for production)
- [x] Checkbox renderer override — preserves `class="task-checkbox"`
- [x] Exact version pin — no `^` range

## Implementation Notes

- 287 lines removed from `public/app.ts`
- `marked` provides GFM: tables, strikethrough, fenced code, task lists
- Custom renderers for: code blocks (lang-\* class), task lists (checkbox class), links (target=\_blank)

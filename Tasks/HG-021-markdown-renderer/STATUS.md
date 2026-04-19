# HG-021: Markdown Renderer Rewrite

**Status:** pending  
**Breaking:** output format (code block class names)  
**Dependencies:** `marked@15.0.4` (exact pin, no `^`)

## Waves

| Wave | Tasks                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------- |
| 1    | `npm install marked@15.0.4`, create `public/markdown.ts` with sanitize + async:false + checkbox renderer |
| 2    | Re-export `renderMarkdown` from `public/app.ts`, update `app.test.ts` snapshots                          |
| 3    | Verify `renderMarkdown("<script>")` escapes, checkbox has class, `just check` + `just test-unit`         |

## Fixes from Adversarial Review

- [x] `async: false` — synchronous parse (not Promise)
- [x] `sanitize: true` — XSS barrier on raw HTML input
- [x] Checkbox renderer override — preserves `class="task-checkbox"`
- [x] Exact version pin — no `^` range

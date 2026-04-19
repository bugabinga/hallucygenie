# HG-021: Markdown Renderer Rewrite

Replace custom 6-phase markdown pipeline with `marked` library. **Breaking output change** — update CSS + tests.

## Why

Current implementation (~125 lines, `public/app.ts` lines 248–400):

- Manual code block extraction via `\x00CODE\x00` placeholders
- Manual inline code extraction (same pattern)
- Manual block-level line-by-line renderer with `BlockState` FSM
- Manual inline transformations (bold, italic, links, task lists, autolinks)
- No GFM tables support (only partial)

`marked` handles all of this: GFM built-in, single call, maintained, browser-compatible.

## Breaking Output Changes

| Element       | Old                           | New                               |
| ------------- | ----------------------------- | --------------------------------- |
| Code lang     | `class="lang-ts"`             | `class="language-ts"`             |
| Code wrapping | `<pre><code class="lang-ts">` | `<pre><code class="language-ts">` |
| Headings      | `<h1>`                        | `<h1>` (unchanged)                |
| Task lists    | same                          | same                              |
| Tables        | not supported                 | GFM tables                        |

**Action:** Add `.language-*` CSS aliases for all existing `.lang-*` styles.

## Steps

1. `npm install marked@^15` (dev dep)
2. Create `public/markdown.ts`:

   ```typescript
   import { marked } from "marked";

   // Configure: GFM, sync mode, sanitized output
   marked.use({
     gfm: true,
     async: false, // synchronous — returns string, not Promise
     sanitize: true, // escape raw HTML in input (XSS barrier)
     breaks: false,
   });

   export function renderMarkdown(text: string): string {
     return marked.parse(text) as string;
   }
   ```

   **Important:** `async: false` is required — `marked` v15 returns a Promise by default.
   `sanitize: true` escapes raw HTML tags in the input before processing. This matches
   the current renderer\'s escape-first behavior.

   **Checkbox class:** marked outputs `<input type="checkbox" disabled>` for GFM task lists.
   To preserve `class="task-checkbox"` for CSS styling, add a renderer override:

   ```typescript
   marked.use({
     renderer: {
       listitem({ text, task, checked }) {
         if (task) {
           const cls = checked ? "task-checkbox task-checked" : "task-checkbox";
           return `<li><input type="checkbox" disabled class="${cls}"${checked ? " checked" : ""}> ${text}</li>\n`;
         }
         return `<li>${text}</li>\n`;
       },
     },
   });
   ```

3. Export `renderMarkdown` from `public/app.ts` — re-export from `markdown.ts` for backward compat.
4. Update CSS: for every `.lang-*` rule in `public/style.css`, add a `.language-*` alias.
5. Update `public/app.test.ts`:
   - Snapshot tests will need new expected values
   - Update code block class expectations from `lang-` to `language-`
6. Run `just check` + `just test-unit` — all pass.

## Tests

- Update `app.test.ts` snapshot expectations for code block class names (`lang-` → `language-`)
- Add test for checkbox output: task list renders with `class="task-checkbox"` (via renderer override)
- Verify `renderMarkdown("<script>alert(1)</script>")` returns escaped output (sanitize: true)
- Pin marked version: install exact version, document in `package.json` comments

Run: `just check` + `just test-unit`

## Constraints

- No new dependencies beyond `marked`
- `renderMarkdown` stays as the public API
- `renderThinkingBlock` still works (wraps `renderMarkdown`)
- Pin exact marked version in `package.json` (e.g. `"marked": "15.0.4"`) — no `^` range
- Do NOT change `public/index.html` or `public/app.ts` beyond the re-export
- `async: false` is required — default v15 behavior returns Promise

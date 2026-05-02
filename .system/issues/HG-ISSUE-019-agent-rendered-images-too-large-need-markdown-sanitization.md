# HG-ISSUE-019 — Agent-rendered image markdown/HTML can create oversized duplicate images

**Status:** Fixed
**Severity:** Medium
**Reported:** 2026-05-01
**Components:** `public/markdown.ts`, `public/style.css`, `src/agent.ts`

## Description

After a successful image tool call, the UI correctly shows the tool card image. But the assistant follow-up text can also include an image markdown tag, e.g.

```md
Here's your image:

![Agent harness with evil laugh](http://hailuo-image...jpeg?...)
```

That image renders inside normal assistant text, separate from the tool card. It can be too large for the chat UI and duplicates the tool output.

In principle assistant markdown images can be useful, but currently they are uncontrolled: no rewrite/sanitize layer, no sizing rule, and raw HTML passthrough is enabled by `marked`.

## Steps to Reproduce

1. Use Create image or prompt:
   ```text
   Use generate_image with prompt: agent harness with optimal evil laugh
   Tool params: aspect_ratio=16:9
   ```
2. Tool card renders the generated image correctly
3. Assistant follow-up text also includes markdown image `![...](...)`
4. Markdown image renders as a second huge image in chat

## Root Cause

`public/markdown.ts` calls:

```ts
return marked.parse(text) as string;
```

No renderer override for images. No sanitization. No HTML filtering. Current tests even assert raw HTML passthrough:

```ts
renderMarkdown > renders script tag (HTML passthrough)
```

CSS has specific styling for `.tool-result-image`, but generic assistant markdown images do not have strict size/containment rules.

## Risks

- Duplicate media output after tool cards
- Huge image blows up chat layout
- External image URLs can track/load arbitrary content
- Raw HTML passthrough is unsafe and can break layout
- Agent can emit arbitrary `<img>`, `<video>`, `<iframe>`, `<script>` etc.

## Possible Fixes

### A. CSS containment for markdown images

Add generic assistant markdown image styles:

```css
.message-content img {
  display: block;
  max-width: min(100%, 320px);
  max-height: 220px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  margin: var(--space-sm) 0;
}
```

Fast UI fix, but does not sanitize HTML.

### B. Override markdown image renderer

In `marked` renderer, rewrite `image()` output to controlled HTML:

```html
<img
  class="markdown-image"
  src="..."
  alt="..."
  loading="lazy"
  referrerpolicy="no-referrer"
/>
```

Then style `.markdown-image`. Optionally make it clickable to lightbox later.

### C. Strip or replace images when tool card already exists

Harder: needs assistant/tool context. If the current assistant turn already has a tool image card, remove markdown image tags from final assistant text or replace with a small link.

### D. Disable raw HTML / sanitize output

Use a sanitizer or custom renderer to escape raw HTML. At minimum strip dangerous tags/attrs:

- `script`
- `iframe`
- `style`
- `object`
- `embed`
- event handler attrs (`onclick` etc.)

Given app is for a kid, raw HTML passthrough should not be allowed.

## Recommendation

Implement in stages:

1. **Immediate UI fix:** CSS containment for `.message-content img`
2. **Markdown renderer fix:** override `image()` with class, lazy loading, no referrer
3. **Sanitization:** disable/strip raw HTML passthrough and update tests
4. **Optional:** remove duplicate markdown image from assistant text if tool card already exists in same turn

## Affected Code

- `public/markdown.ts` — `marked.parse()` with raw HTML passthrough, no image renderer override
- `public/style.css` — no generic markdown image sizing rule
- `test/app.test.ts` — currently expects script tag passthrough
- `src/agent.ts` — prompt should probably say: after image tool results, do not embed the same image as markdown; describe it briefly instead

## Tests Needed

- Unit: markdown image renders with controlled `.markdown-image` class
- Unit: markdown image has `loading="lazy"` and `referrerpolicy="no-referrer"`
- Unit/static: `.message-content img` max-width/max-height rule exists
- Unit: raw `<script>` is escaped/removed after sanitizer change
- E2E: tool card image + assistant follow-up does not create oversized duplicate

## 2026-05-02 fix

Markdown image rendering is controlled:

- raw HTML is escaped
- markdown images render as `.markdown-image`
- images get `loading="lazy"` and `referrerpolicy="no-referrer"`
- `.markdown-image` is constrained to `max-width: min(100%, 320px)` and `max-height: min(45vh, 260px)`
- server history replay strips assistant media markup via `sanitizeAssistantMediaMarkup()`

Verification:

- Regression tests cover markdown image attrs and CSS containment.
- Manual Chrome rendered markdown image with safe attrs and constrained computed height.

# HG-ISSUE-015 — Agent markdown output too spaced out, partially unrendered

**Status:** Fixed
**Severity:** Medium
**Reported:** 2026-05-01
**Components:** `public/markdown.ts`, `public/style.css`, `public/app.ts`, `src/agent.ts`

## Description

Some assistant responses render with excessive whitespace, overly tall line height, and missing/partial markdown formatting.

Example output:

```md
Here are some titles:

**"I Found the SECRET DARK MAGE CAT in Minecraft..."** (classic mystery angle)

**"POV: You Angered the Wrong Cat 😈🐱** (POV format = engagement)

**"The Cat That DESTROYED the Ender Dragon (Minecraft)"** (bold claim)

**"My Cat Became a DEMON LORD... (Minecraft Story)"** (dramatic storytelling)

**"Dark Mage Cat: I Made the Cursed Cat in Minecraft 😱** (challenge/build angle)

**"Nobody Expected the CAT to be the Final Boss 🐱💀** (plot twist energy)

Try #2 or #5 — those tend to get good click rates. Mix and match however you like!
```

Observed problems:

- Some `**bold**` sections do not render as bold
- Large vertical gaps between lines
- Overall line height feels too tall
- Output has lots of low-value blank space

## Root Cause

Multiple causes combine.

### 1. Model emits malformed markdown

Some lines start bold with `**` but never close it:

```md
**"POV: You Angered the Wrong Cat 😈🐱** (POV format = engagement)
**"Dark Mage Cat: I Made the Cursed Cat in Minecraft 😱** (challenge/build angle)
**"Nobody Expected the CAT to be the Final Boss 🐱💀** (plot twist energy)
```

These are missing the closing quote/bold structure. Markdown parser cannot reliably render malformed emphasis.

### 2. Excess blank lines from model are preserved visually

The model emitted multiple blank lines after the intro and before the final paragraph. `renderMarkdown()` passes raw text straight to `marked.parse()` with no normalization.

### 3. CSS preserves whitespace too aggressively

`public/style.css`:

```css
.message-content {
  white-space: pre-wrap;
}
```

This applies to rendered HTML content, not just plain text. Combined with markdown block elements (`<p>`, lists, etc.), this can preserve whitespace/newline text nodes around HTML blocks and exaggerate spacing.

### 4. Assistant line height and block margins are loose

Relevant CSS:

```css
.message-bubble {
  line-height: 1.6;
}
.message-content p {
  margin: var(--space-xs) 0;
}
.message-content li {
  line-height: 1.6;
  margin: var(--space-xs) 0;
}
```

Good for readability, but too tall for short list-like title suggestions.

## Possible Fixes

### A. Normalize markdown before rendering

Add a small preprocessor before `marked.parse()`:

- trim outer whitespace
- collapse 3+ newlines to 2
- optionally collapse excessive spaces/tabs

Example:

```ts
function normalizeMarkdownInput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

### B. Stop using `white-space: pre-wrap` for markdown HTML

Use normal whitespace for rendered markdown:

```css
.message-content {
  white-space: normal;
}

.message--user .message-content,
.message--steer .message-content {
  white-space: pre-wrap;
}
```

Assistant markdown is HTML; user text can still preserve typed newlines.

### C. Tighter assistant markdown spacing

Lower assistant markdown line height and margins:

```css
.message--assistant .message-content {
  line-height: 1.45;
}
.message--assistant .message-content p {
  margin: 0.25rem 0;
}
.message--assistant .message-content li {
  margin: 0.15rem 0;
  line-height: 1.45;
}
```

### D. Encourage list output in system prompt

For title suggestions, tell agent to prefer compact bullets:

```md
- **Title** — reason
- **Title** — reason
```

This is prompt-side polish, not a rendering fix.

### E. Do not auto-repair malformed markdown too aggressively

Could repair common unclosed `**`, but this is risky. Better to normalize whitespace + improve prompt. Markdown parser should not guess semantics.

## Recommendation

Implement A + B + C first.

- Normalize excessive blank lines before `marked.parse()`
- Use `white-space: normal` for assistant markdown
- Tighten assistant paragraph/list spacing

Then adjust the system prompt if title/list outputs still look sloppy.

## Affected Code

- `public/markdown.ts` — `renderMarkdown()` no input normalization
- `public/style.css:510-512` — `.message-content { white-space: pre-wrap; }`
- `public/style.css:502-505` — `.message-bubble { line-height: 1.6; }`
- `public/style.css:1264-1266` — paragraph margins
- `public/style.css:1337-1339` — list item margins/line-height
- `src/agent.ts` — prompt could request compact markdown lists

## Tests Needed

- Unit: `renderMarkdown()` collapses 3+ blank lines before rendering
- Snapshot: sample title output renders compactly
- Static/CSS test: assistant markdown does not use `white-space: pre-wrap`
- Visual/E2E: assistant title list has no huge vertical gaps

## 2026-05-02 fix

Applied minimal renderer/CSS fix:

- `renderMarkdown()` trims outer whitespace and collapses 3+ blank lines to 2.
- Assistant markdown uses normal whitespace; user/steer text keeps `pre-wrap`.
- Assistant paragraph/list spacing is tighter.
- Inline markdown inside list items now renders correctly.

Verification:

- Regression tests cover blank-line normalization and bold inside list items.
- Manual Chrome stream rendered compact markdown and bold list text after `[DONE]`.

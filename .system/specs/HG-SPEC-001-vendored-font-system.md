# HG-SPEC-001: Vendored 3-font system

**Status:** Done

## Tickets

- `HG-TICKET-001-vendored-font-system.md`
- `HG-TICKET-002-smart-font-asset-caching.md`

## Verdict status

**Revise incorporated.** This spec now includes reproducible font artifacts, real selector targets, server/deploy/CSP requirements, HTTP/browser/container verification, and a `just fonts-update` workflow.

## Idea

Use 3 distinct fonts:

- **Human/user input + user bubbles:** Playwrite DE SAS  
  https://fonts.google.com/specimen/Playwrite+DE+SAS
- **LLM/assistant bubbles + assistant text:** Roboto Flex  
  https://fonts.google.com/specimen/Roboto+Flex
- **UI chrome/buttons/labels/header:** Pixelify Sans  
  https://fonts.google.com/specimen/Pixelify+Sans

Fonts must be vendored. No runtime Google Fonts requests.

## Goals

1. Strong visual separation between user, assistant, and UI.
2. Offline/self-hosted font loading.
3. Reproducible vendoring: pinned sources + checksums.
4. Prove runtime serving + browser application, not just file existence.
5. Ensure production/container artifact includes fonts.
6. Keep CSS simple: no framework, no font loader JS.

## Non-goals

- No external CDN.
- No runtime `fonts.googleapis.com` or `fonts.gstatic.com`.
- No dynamic font switching UI.
- No full variable-axis customization beyond sane defaults.

## Reproducible font manifest

Add committed manifest:

```text
public/fonts/fonts.manifest.json
```

Required shape:

```json
{
  "version": 1,
  "generated_at": "2026-05-01T00:00:00Z",
  "source": {
    "repo": "https://github.com/google/fonts",
    "commit": "<pinned commit sha>",
    "downloaded_by": "just fonts-update"
  },
  "fonts": [
    {
      "id": "playwrite-de-sas",
      "family": "Playwrite DE SAS",
      "css_family": "HG Playwrite DE SAS",
      "role": "user",
      "source_path": "ofl/playwritedesas/PlaywriteDESAS[wght].ttf or upstream path",
      "file": "public/fonts/playwrite-de-sas/PlaywriteDESAS.woff2",
      "format": "woff2",
      "axes": { "wght": [100, 400] },
      "sha256": "<sha256>",
      "license": "public/fonts/playwrite-de-sas/OFL.txt"
    },
    {
      "id": "roboto-flex",
      "family": "Roboto Flex",
      "css_family": "HG Roboto Flex",
      "role": "assistant",
      "source_path": "ofl/robotoflex/RobotoFlex[...].ttf or upstream path",
      "file": "public/fonts/roboto-flex/RobotoFlex.woff2",
      "format": "woff2",
      "axes": { "wght": [100, 1000] },
      "sha256": "<sha256>",
      "license": "public/fonts/roboto-flex/OFL.txt"
    },
    {
      "id": "pixelify-sans",
      "family": "Pixelify Sans",
      "css_family": "HG Pixelify Sans",
      "role": "ui",
      "source_path": "ofl/pixelifysans/PixelifySans[wght].ttf or upstream path",
      "file": "public/fonts/pixelify-sans/PixelifySans.woff2",
      "format": "woff2",
      "axes": { "wght": [400, 700] },
      "sha256": "<sha256>",
      "license": "public/fonts/pixelify-sans/OFL.txt"
    }
  ]
}
```

Manifest tests must validate:

- source repo + pinned commit present
- each file exists
- each `sha256` matches actual bytes
- each license path exists
- each CSS family appears in `style.css`

## Font update command

Add a just recipe and script:

```just
# download latest pinned Google font files, convert/subset to woff2, update manifest checksums
[group('setup')]
fonts-update commit="main":
    bun scripts/update-fonts.ts {{ commit }}
```

Script requirements:

1. Input: Google Fonts repo commit/tag/ref (`main` allowed for manual update, but manifest must store resolved commit SHA).
2. Download only the 3 font families and OFL files.
3. Produce `.woff2` outputs under `public/fonts/**`.
4. Update `public/fonts/fonts.manifest.json` with resolved commit, source paths, axes/weights, SHA256.
5. Do not touch unrelated files.
6. Fail if downloaded license is missing.
7. Print old/new checksums.

Preferred implementation: Bun TS script using `fetch`, `crypto.subtle` or `Bun.hash`, and `bun` APIs. No Python.

## File layout

```text
public/
  fonts/
    fonts.manifest.json
    playwrite-de-sas/
      PlaywriteDESAS.woff2
      OFL.txt
    roboto-flex/
      RobotoFlex.woff2
      OFL.txt
    pixelify-sans/
      PixelifySans.woff2
      OFL.txt
scripts/
  update-fonts.ts
```

Exact upstream filenames may differ, but public URLs and manifest paths must be stable.

## Licensing

All three Google Fonts are expected to be SIL Open Font License. Vendor the license text alongside each font:

- `public/fonts/*/OFL.txt`

Do not vendor Google-generated CSS unless needed for reference. If vendored for reference, it must not be loaded by `index.html`.

## Actual selector targets

Selectors must target the real rendered DOM from `public/index.html` and `public/app.ts`.

### User/human text

Real selectors:

```css
.message--user .message-content,
.message--steer .message-content,
#chat-input {
  font-family: var(--font-user);
}
```

Notes:

- `renderUserMessage()` creates `.message.message--user .message-content`.
- `renderSteerMessage()` creates `.message.message--steer.message--user .message-content`.
- If manual test shows Playwrite hurts typing readability, remove `#chat-input` from user font and document exception in manifest/spec notes.

### Assistant/LLM text

Real selectors:

```css
.message--assistant .message-content,
.assistant-text-region,
.assistant-thinking-region,
.thinking-content {
  font-family: var(--font-assistant);
}
```

Notes:

- `renderAssistantMessage()` creates `.message.message--assistant .message-content`.
- Streaming text uses `.assistant-text-region`.
- Thinking uses `.assistant-thinking-region` + `.thinking-content`.
- Tool cards are UI, not assistant prose.

### UI

Real selectors:

```css
body,
button,
input,
select,
textarea,
.header-title,
.quota-badge,
.create-tab,
.btn-primary,
.form-group label,
.tool-card,
.assets-empty,
.error-toast,
.steer-hint {
  font-family: var(--font-ui);
}
```

Important cascade order: define UI base first, then override user/assistant message selectors after it.

## CSS design

Add `@font-face` definitions in `public/style.css` near custom properties.

```css
@font-face {
  font-family: "HG Pixelify Sans";
  src: url("/fonts/pixelify-sans/PixelifySans.woff2") format("woff2");
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "HG Roboto Flex";
  src: url("/fonts/roboto-flex/RobotoFlex.woff2") format("woff2");
  font-weight: 100 1000;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "HG Playwrite DE SAS";
  src: url("/fonts/playwrite-de-sas/PlaywriteDESAS.woff2") format("woff2");
  font-weight: 100 400;
  font-style: normal;
  font-display: swap;
}
```

Then define font tokens:

```css
:root {
  --font-ui: "HG Pixelify Sans", system-ui, sans-serif;
  --font-assistant: "HG Roboto Flex", system-ui, sans-serif;
  --font-user: "HG Playwrite DE SAS", cursive, system-ui, sans-serif;
}
```

## Server/static serving requirements

Audit/update `src/server.ts`:

1. Static serving must allow nested paths like `/fonts/roboto-flex/RobotoFlex.woff2`.
2. MIME table must include:

```ts
".woff2": "font/woff2",
".woff": "font/woff",
".ttf": "font/ttf",
```

3. Missing font URLs must return real 404, not `index.html` fallback.
4. Path traversal must remain blocked.
5. Font responses should include cache header:

```http
Cache-Control: public, max-age=31536000, immutable
```

or document why not.

## CSP requirements

Current server has no CSP. If CSP is added or already present at implementation time, it must allow self-hosted fonts:

```http
Content-Security-Policy: default-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'
```

If CSP remains absent, tests should assert no CSP blocks exist and browser font loading succeeds.

Browser checks must listen for console/CSP violations and assert none.

## Deployment/container requirements

Audit `deploy/Dockerfile` and any deploy packaging:

1. `public/fonts/**` must be copied into production image/artifact.
2. `public/app.js` must be built during image build.
3. Runtime container must serve `/fonts/**` with `font/woff2`.

Add built-container smoke check:

```bash
podman build -f deploy/Dockerfile -t hallucygenie-font-smoke .
podman run --rm -p 3010:3000 --env MINIMAX_API_KEY=test hallucygenie-font-smoke
curl -I http://127.0.0.1:3010/fonts/pixelify-sans/PixelifySans.woff2
```

Acceptance: `200`, `Content-Type: font/woff2`, non-zero content length.

## UX constraints

### User font readability

Playwrite is handwriting-style. Use conservative sizing/line-height:

```css
.message--user .message-content,
.message--steer .message-content,
#chat-input {
  line-height: 1.7;
  letter-spacing: 0.01em;
}
```

If readability is bad on mobile, restrict Playwrite to user/steer bubbles only and leave `#chat-input` as UI/assistant/system font. Decision after manual Chrome test.

### Assistant font readability

Roboto Flex should be highly readable. Use it for assistant prose, markdown, and thinking text.

### UI font readability

Pixelify is playful but can hurt dense forms. If form inputs suffer, keep only controls/labels/header/buttons on Pixelify and form text entry on Roboto Flex/system.

## Performance constraints

1. Use `.woff2` only in runtime CSS.
2. Subset if downloaded files are large.
3. Prefer variable font single-file builds over many static weights.
4. Target total font payload under ~500KB compressed if possible; if exceeded, document actual payload in manifest.
5. Use `font-display: swap`.

## Tests

### Unit/static tests

Add/update `test/static.test.ts`:

1. `public/fonts/fonts.manifest.json` exists and matches schema.
2. Each manifest file exists.
3. SHA256 checksums match actual bytes.
4. `OFL.txt` exists per font dir.
5. `style.css` contains exactly 3 `@font-face` blocks for:
   - `HG Playwrite DE SAS`
   - `HG Roboto Flex`
   - `HG Pixelify Sans`
6. `style.css` contains no:
   - `fonts.googleapis.com`
   - `fonts.gstatic.com`
7. CSS URLs are local `/fonts/...` URLs.
8. CSS uses actual selectors listed above.
9. `justfile` contains `fonts-update` recipe and references `scripts/update-fonts.ts`.

### Server HTTP integration tests

Add/update `test/integration.test.ts`:

1. GET each manifest font URL returns `200`.
2. `Content-Type` is `font/woff2`.
3. Body length > 0.
4. Missing font URL returns `404`.
5. Path traversal under `/fonts/**` is blocked.

### Browser/computed-style tests

Add E2E/manual-browser automated checks:

1. `document.fonts.check('16px "HG Pixelify Sans"')` is true.
2. `document.fonts.check('16px "HG Roboto Flex"')` is true.
3. `document.fonts.check('16px "HG Playwrite DE SAS"')` is true.
4. Computed style checks:

```js
getComputedStyle(document.querySelector(".message--user .message-content"))
  .fontFamily;
getComputedStyle(document.querySelector(".message--assistant .message-content"))
  .fontFamily;
getComputedStyle(document.querySelector(".header-title")).fontFamily;
getComputedStyle(document.querySelector("#chat-input")).fontFamily;
```

5. Assert no network entries include `fonts.googleapis.com` or `fonts.gstatic.com`.
6. Assert font resource entries are `/fonts/...`.
7. Assert no CSP violation console messages.

### Snapshot tests

Update snapshots affected by font-related class/structure changes only if DOM changes. CSS-only changes do not need HTML snapshot updates.

### Container smoke tests

Add a script or just recipe for container font smoke. At minimum document command in ticket and run before closing.

## Manual Chrome test

Check:

1. Network resources: fonts load from `/fonts/...`, not Google.
2. User bubble visibly uses Playwrite.
3. Assistant bubble visibly uses Roboto Flex.
4. Header/buttons/tabs visibly use Pixelify Sans.
5. Mobile viewport: no clipped text, no unreadable controls.
6. Chat input still comfortable for typing.
7. No CSP/font console errors.
8. Production/container smoke serves fonts.

## Acceptance criteria

- [ ] Fonts vendored under `public/fonts/`.
- [ ] Licenses vendored.
- [ ] `fonts.manifest.json` committed with source commit, axes, files, SHA256.
- [ ] `just fonts-update` updates fonts/manifest reproducibly.
- [ ] No external font network requests.
- [ ] `src/server.ts` serves nested `/fonts/**` with `font/woff2`.
- [ ] CSP allows `font-src 'self'` if CSP exists.
- [ ] Deploy/container artifact includes `public/fonts/**`.
- [ ] CSS applies three-font split to actual selectors.
- [ ] Static + HTTP + browser/computed-style + container smoke checks pass.
- [ ] `just check` passes.
- [ ] `just test-unit` passes.
- [ ] Manual Chrome test passes on mobile + desktop viewport.

## Risks

1. Playwrite may be too decorative for long user messages.
2. Pixelify may reduce UI readability.
3. Font payload could be large if variable fonts are not subset.
4. Google font filenames/axis metadata may differ from simple names above.
5. CSP/deploy regressions can make local dev pass while prod fails.

## Rollback

Keep font tokens isolated. Rollback = change tokens to existing system stack or remove `@font-face` declarations. Font files can remain vendored until cleanup.

# HG-TICKET-001: Implement vendored 3-font system

**Spec:** `.system/specs/HG-SPEC-001-vendored-font-system.md`  
**Status:** Done  
**Priority:** Medium  
**Size:** L

## Goal

Vendor and apply 3 Google Fonts locally, reproducibly, and prove they work in browser + server + container:

- Playwrite DE SAS → user/steer bubbles + maybe chat input
- Roboto Flex → assistant/LLM bubbles + thinking/text regions
- Pixelify Sans → UI chrome/buttons/labels/header/tool cards

No runtime requests to Google Fonts.

## Blocking requirements from review

- Font artifacts pinned in committed manifest with source commit + checksums
- CSS selectors audited against actual rendered DOM
- `/fonts/**` served by `src/server.ts` with correct MIME
- Production/container artifact includes fonts
- CSP (if present) permits `font-src 'self'`
- Browser computed-style tests prove fonts apply
- Just command downloads newest font set reproducibly

## Scope

### 1. Add font manifest

Create:

```text
public/fonts/fonts.manifest.json
```

Must include for each font:

- `id`
- `family`
- `css_family`
- `role`
- upstream repo URL
- resolved upstream commit SHA
- upstream source path
- local `.woff2` path
- axes/weights
- SHA256 checksum
- license path

### 2. Add font assets

Create:

```text
public/fonts/playwrite-de-sas/PlaywriteDESAS.woff2
public/fonts/playwrite-de-sas/OFL.txt
public/fonts/roboto-flex/RobotoFlex.woff2
public/fonts/roboto-flex/OFL.txt
public/fonts/pixelify-sans/PixelifySans.woff2
public/fonts/pixelify-sans/OFL.txt
```

Exact filenames may differ, but manifest + CSS must agree.

### 3. Add `just fonts-update`

Add recipe:

```just
# download latest pinned Google font files, convert/subset to woff2, update manifest checksums
[group('setup')]
fonts-update commit="main":
    bun scripts/update-fonts.ts {{ commit }}
```

Create:

```text
scripts/update-fonts.ts
```

Script requirements:

1. Resolve the supplied Google Fonts repo ref to a commit SHA.
2. Download only the 3 font families + OFL files.
3. Convert/subset to `.woff2` if upstream file is not already woff2.
4. Write files under `public/fonts/**`.
5. Update manifest with commit, source paths, axes/weights, SHA256.
6. Fail on missing license.
7. Print old/new checksums.
8. No Python.

### 4. CSS

Update `public/style.css`:

- add 3 `@font-face` declarations
- add tokens:
  - `--font-ui`
  - `--font-assistant`
  - `--font-user`
- apply to actual selectors:

```css
.message--user .message-content,
.message--steer .message-content,
#chat-input {
  font-family: var(--font-user);
}

.message--assistant .message-content,
.assistant-text-region,
.assistant-thinking-region,
.thinking-content {
  font-family: var(--font-assistant);
}

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

Cascade order matters: UI defaults first, user/assistant overrides later.

### 5. Server/static serving

Audit/update `src/server.ts`:

- nested `/fonts/**` must serve from `public/fonts/**`
- add MIME:
  - `.woff2` → `font/woff2`
  - `.woff` → `font/woff`
  - `.ttf` → `font/ttf`
- missing font URL returns 404
- traversal stays blocked
- optional cache: `Cache-Control: public, max-age=31536000, immutable`

### 6. CSP

If CSP exists or is added, include:

```http
font-src 'self'
```

If no CSP exists, browser test still must assert fonts load and no CSP violations occur.

### 7. Deploy/container

Audit `deploy/Dockerfile`:

- `public/fonts/**` copied into image
- `public/app.js` built during image build
- container serves font URLs with `font/woff2`

Add/run built-container smoke:

```bash
podman build -f deploy/Dockerfile -t hallucygenie-font-smoke .
podman run --rm -p 3010:3000 --env MINIMAX_API_KEY=test hallucygenie-font-smoke
curl -I http://127.0.0.1:3010/fonts/pixelify-sans/PixelifySans.woff2
```

Expected: `200`, `Content-Type: font/woff2`, non-zero length.

## Tests

### Static/unit

Update/add tests in `test/static.test.ts`:

- manifest exists + schema valid
- manifest has pinned source commit
- every font file exists
- every SHA256 matches
- every `OFL.txt` exists
- CSS has exactly 3 `@font-face` blocks
- CSS has no `fonts.googleapis.com` / `fonts.gstatic.com`
- CSS URLs are local `/fonts/...`
- CSS selectors match actual selector plan
- justfile contains `fonts-update` recipe + `scripts/update-fonts.ts`

### Integration HTTP

Update `test/integration.test.ts`:

- GET each manifest font URL returns `200`
- `Content-Type` = `font/woff2`
- body length > 0
- missing `/fonts/nope.woff2` returns 404
- traversal blocked

### Browser/computed-style

Add E2E or manual-CDP automated check:

- `document.fonts.check('16px "HG Pixelify Sans"')`
- `document.fonts.check('16px "HG Roboto Flex"')`
- `document.fonts.check('16px "HG Playwrite DE SAS"')`
- computed style contains expected family for:
  - `.message--user .message-content`
  - `.message--assistant .message-content`
  - `.header-title`
  - `#chat-input`
- no resource URL contains `fonts.googleapis.com` or `fonts.gstatic.com`
- all loaded font resources are `/fonts/...`
- no CSP violation console errors

### Snapshot

Only update HTML snapshots if DOM changes. CSS-only font changes don't require snapshot updates.

## Manual test

Use Chrome:

- network shows local `/fonts/**`
- no Google Fonts network
- user bubble visually Playwrite
- assistant bubble visually Roboto Flex
- UI visually Pixelify Sans
- mobile viewport readable
- chat input usable
- container smoke passed

## Implementation steps

1. Add `scripts/update-fonts.ts`.
2. Add `just fonts-update`.
3. Run `just fonts-update <pinned-ref-or-main>`.
4. Commit generated font files + manifest.
5. Update CSS font faces/tokens/selectors.
6. Update `src/server.ts` MIME/cache if needed.
7. Add static manifest/checksum/CSS tests.
8. Add HTTP font serving integration tests.
9. Add browser computed-style checks.
10. Audit/update `deploy/Dockerfile` and run container smoke.
11. Run:
    ```bash
    just check
    just test-unit
    just test-integration
    just test-e2e
    ```
12. Manual Chrome mobile + desktop check.

## Acceptance criteria

- [ ] `public/fonts/fonts.manifest.json` committed and validated
- [ ] Fonts + licenses vendored
- [ ] `just fonts-update` works and updates checksums
- [ ] No Google Fonts runtime requests
- [ ] CSS applies 3-font system to actual selectors
- [ ] `/fonts/**` served with correct MIME
- [ ] Browser computed styles prove fonts apply
- [ ] CSP does not block fonts
- [ ] Container smoke proves production artifact includes fonts
- [ ] Static + unit + integration + E2E tests pass
- [ ] Manual Chrome check passes

## Completion notes

- Implemented `just fonts-update` via `scripts/update-fonts.ts`.
- Vendored fonts pinned to Google Fonts commit `8fee968603b86ac85d4fbf0f3ffbde3fed1d84e1`.
- Runtime font payload: ~943KB total (`RobotoFlex.woff2` dominates at ~791KB). Subsetting can be a follow-up if needed.
- Container smoke passed with `Content-Type: font/woff2`, `Content-Length: 22984` for Pixelify Sans.

## Notes

- If Playwrite hurts typing readability, keep Playwrite on user bubbles but use UI/assistant font for `#chat-input`; update tests/spec note accordingly.
- If font payload exceeds ~500KB compressed, document actual size and consider subsetting follow-up.

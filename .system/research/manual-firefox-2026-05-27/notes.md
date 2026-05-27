# Manual Firefox validation — 2026-05-27

Server:

- mocked MiniMax for media flow screenshots
- real MiniMax LLM for chat + session auto-name
- final pass on `http://localhost:3000` with Firefox BiDi

Screenshots:

- `screenshots/01-home.png`
- `screenshots/02-onboarding.png`
- `screenshots/03-profile.png`
- `screenshots/04-create-image.png`
- `screenshots/05-image-result.png`
- `screenshots/06-lightbox.png`
- `screenshots/07-assets-tab.png`
- `screenshots/08-real-llm-chat.png`
- `screenshots/09-music-tab.png`
- `screenshots/10-voice-tab.png`
- `screenshots/11-analyze-tab.png`
- `screenshots/12-search-tab.png`
- `screenshots/13-profile-real-save.png`
- `screenshots/14-youtube-search-oembed.png`
- `screenshots/15-youtube-search-deduped.png`
- `screenshots/17-reduced-motion-active.png`
- `screenshots/18-keyboard-create-focus-trap.png`
- `screenshots/19-keyboard-create-focus-trap-open.png`
- `screenshots/20-analyze-local-upload.png`
- `screenshots/21-assets-cards.png`
- `screenshots/22-session-new-blank.png`
- `screenshots/23-cover-youtube-disabled.png`

Screenshot audit:

- Screenshots are viewport captures, but several are weak evidence.
- `05-image-result.png`, `06-lightbox.png`, `07-assets-tab.png`: generated image preview appears blank/alt-only. `HG-ISSUE-100` fixed: E2E MiniMax image mock now returns a valid PNG and E2E asserts loaded chat, lightbox, and Assets images.
- Some modal screenshots are dimmed by backdrop and show partial scroll state only.
- Use DOM/API/test results as primary proof; retake clean screenshots when visual evidence is required.

Manual validation:

- Home shell: full-width header/footer, no body scrollbar in normal view, quota status aria text present.
- Onboarding: appears on first visit, progresses, dismisses, focus returns to chat.
- Profile: fields save via DB, no raw avatar data, avatar upload input now has associated label.
- Create image: kid controls, surprise code, generate via mocked MiniMax, image tool card, lightbox, asset card, download link, recent history.
- Create music: lyrics helper button, instrumental lyrics field, cover two-step controls, YouTube option disabled when extractor off.
- Create voice: bounded speed/select/range controls, voice optgroup order English/Deutsch/Europe/Rest.
- Analyze: local image picker/dropzone uploaded `manual.png` to `/asset/asset_...`, rendered preview, URL fallback and prompt field present.
- Search: query-only create flow.
- Assets: cards show image preview, media badge, prompt/tool/date, params/download link; audio cards are covered by automated tests.
- Drafts: chat draft survives reload; empty DB draft clears Firefox-restored stale textarea.
- Sessions: new session clears UI; switching restores previous conversation; real LLM auto-name produced `Say Hi In One Short` / prior auto names.
- Real LLM chat: streamed thinking + markdown answer persisted.
- YouTube web search enrichment: oEmbed metadata appears from direct YouTube query/result; duplicate short/watch URLs now collapse to one metadata block.
- Reduced motion: separate Firefox profile with `ui.prefersReducedMotion=1`; `matchMedia` true; `.stream-chunk` animation `none`; global transition duration `0.00001s`.
- Keyboard: Tab reaches header controls/chat/links; Create modal traps Tab within modal; Escape closes modal and restores focus to Create button.
- Browser storage: after manual sweeps, `localStorage` keys are only `["hg_onboarding_done"]`.

Firefox DOM/API assertions from final pass:

- `document.title` = `HallucyGenie`.
- Viewport meta = `width=device-width, initial-scale=1.0`.
- All `input/textarea/select` controls had associated labels: `[]` unlabeled.
- Modals expose dialog semantics: Create/Profile/Lightbox all `role="dialog"`, `aria-modal="true"`.
- Create tabs/panels: Image, Music, Voice, Analyze, Search, Assets all have `aria-controls`, `role="tabpanel"`, `aria-labelledby`.
- Stable modal shell: Image/Music/Voice/Analyze/Search/Assets tab switches all kept shell `[336,302,560,720]`, title `y=320`, tabbar `y=358`.
- Kid controls: image count/ratio/size are `SELECT`; width/height/seed are hidden; voice id is `SELECT`; volume/pitch are `range`; cover source is `SELECT`; analyze has file/dropzone; search has query textarea.
- Cover extractor off: `/api/music-cover/status` returned `{"youtubeEnabled":false}` and the YouTube option is disabled with text `YouTube link (extractor off)`.
- Scroll shell: `body` overflow hidden; `#app` max-width none; `#message-list` overflow auto; chat input overflow hidden until overflowing.
- Vendored fonts loaded in Firefox: `HG Pixelify Sans`, `HG Roboto Flex`, `HG Playwrite DE SAS`; no external runtime resources found.
- Raw media invariant: SQLite query found `0` data URLs/base64 blobs in `messages` and `drafts`; raw bytes stayed in `assets` (`assets_count=4`).

Spec matrix:

- HG-SPEC-001 vendored fonts: PASS — Firefox font set loaded locally; static tests verify manifest/no CDN.
- HG-SPEC-002 streaming animation: PASS — real LLM stream, thinking/markdown persisted, reduced-motion profile disables animation.
- HG-SPEC-003 DB profile/avatar: PASS — DB profile save/reset/avatar asset flow, API rejects raw avatar data.
- HG-SPEC-004 stable Create modal: PASS — measured shell/title/tabbar unchanged across all tabs.
- HG-SPEC-005 DB draft/UI state: PASS — chat/create drafts reload, DB-empty clears Firefox restored stale value, localStorage limited.
- HG-SPEC-006 Create input history: PASS — Recent list fills/removes; create/chat/agent history covered by tests.
- HG-SPEC-007 DB-first state: PASS — active session in DB APIs, asset URLs omit session query, localStorage only onboarding.
- HG-SPEC-008 useful Assets UI: PASS — preview cards/download/params verified manually and by unit tests.
- HG-SPEC-009 multi-session: PASS — header switcher/new chat/manual session partition verified; stream-switch confirmation covered by unit regression.
- HG-SPEC-010 YouTube integration: PASS — no separate UI, web_search oEmbed enrichment capped/deduped, no API key/OAuth.
- HG-SPEC-011 simplification/raw bytes: PASS — DB/server tests + SQLite manual query show no raw bytes in messages/drafts.
- HG-SPEC-012 music creator: PASS — lyrics helper + generate music flow covered; Create UI exposes editable lyrics and instrumental path.
- HG-SPEC-013 music cover: PASS — direct/upload/Youtube source controls present; extractor-off disables YouTube option; sidecar integration remains external by spec.
- HG-SPEC-014 viewport/scroll: PASS — viewport allows zoom, full-width shell, one message scroll owner, chat input overflow behavior.
- HG-SPEC-015 accessibility baseline: PASS — labels, dialog ARIA, dynamic status labels, reduced motion, keyboard navigation/focus traps.
- HG-SPEC-016 kid-friendly controls: PASS — bounded selects/ranges/checkboxes, hidden technical fields, labels/helper text are outcome-oriented.

Tests extended from manual findings:

- `test/unit/static.test.ts`: associated labels/localStorage/Create controls/accessibility.
- `test/integration/integration.test.ts`: served HTML label audit + YouTube oEmbed HTTP flow.
- `test/unit/app.test.ts`: Firefox-restored empty DB draft, focus traps/restore, stream session confirmation, no transient error localStorage.
- `test/unit/tools.test.ts`: YouTube oEmbed direct/result/cap/dedupe cases.
- `e2e/run-e2e.ts`: generated image loads in chat card, lightbox, and Assets preview.

Findings fixed during run:

- `HG-ISSUE-097`: `#profile-avatar-upload` missing associated label.
- `HG-ISSUE-098`: Firefox-restored textarea could defeat DB-empty draft state.
- `HG-ISSUE-099`: YouTube oEmbed duplicated metadata for same video via short + watch URLs.
- `HG-ISSUE-100`: E2E image mock returned undecodable PNG bytes, weakening image preview proof.

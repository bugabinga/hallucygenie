# Review fixed issues

Manual app checks to verify after pulling latest:

## Header/onboarding/accessibility

- Load app fresh.
- Confirm welcome text has no giant leading spaces.
- Confirm favicon shows genie icon.
- Confirm quota badge shows 3 counters: `🎨`, `🎙️`, `🎵`.
- Open onboarding: one dot row only, 4 dots.
- Inspect chat input/create controls: labels present; Create modal announces as dialog; connection dot has accessible status.

Covers: HG-E2E-001, 003, 004, 005, 006, 007, 008, 012, HG-ISSUE-013.

## Create modal

- Open Create.
- Check Image/Voice/Music textareas/selects: left border visible.
- Open Music: no old `Instrumental` checkbox; lyrics says `Lyrics (optional, empty = instrumental)`.
- Generate/seed an image; open Assets: image appears.

Covers: HG-ISSUE-011, 017, 022.

## Chat rendering

- Send response with bullets, bold markdown, blank lines, and markdown image.
- While streaming: text should materialize visibly.
- After done: markdown renders compactly; bold inside list renders; markdown image is small/safe.
- Tool card image/audio should stay as tool card, not duplicate huge media in text.

Covers: HG-ISSUE-012, 015, 016, 019.

## Active session state

- Start app with a fresh `data/` directory.
- Load `/` in Chrome; app should start normally.
- Inspect SQLite: `app_state.active_session_id` exists and is stable across restart.
- Without `X-Session-Id`, `/api/history`, `/api/chat`, `/api/steer`, and `/assets` should use the active DB session.
- With explicit `X-Session-Id`, old debug/test session partitioning should still work.
- In browser devtools, `localStorage.hallucygenie_session_id` should be absent after reload; `hg_onboarding_done` may remain.
- Network tab: frontend `/api/chat`, `/api/history`, `/api/steer`, `/assets` requests should not send `X-Session-Id`.

Covers: HG-TICKET-013, HG-TICKET-014, HG-TICKET-015, HG-SPEC-007.

## Dev/test health

- Run `just dev`: bundle is rebuilt first.
- Run `just test-unit`: no nock quota noise; no stale bundle crash.
- Root layout is src/test/deploy/public organized; generated bundle ignored.

Covers: HG-E2E-002, 009, 010, 011, 014.

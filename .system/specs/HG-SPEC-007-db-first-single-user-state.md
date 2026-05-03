# HG-SPEC-007: DB-first single-user state

## Problem

State split between SQLite and localStorage. Reloads lose data. Session identity is browser-driven. Single-user app doesn't need browser session partitioning.

## Design decisions

- DB owns all app state. Browser is view/controller.
- One active local user/session by default.
- `app_state` table or singleton `app_settings` with `active_session_id`.
- Server resolves active session when `X-Session-Id` header absent.
- Asset URLs drop `?s=` query param. `GET /asset/:id` serves by id alone.
- `localStorage` only for `hg_onboarding_done`.
- No multi-user auth. No login. No browser sync. No state framework.

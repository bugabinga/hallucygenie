# HG-SPEC-005: DB-first draft + UI state persistence

## Problem

User input must survive reload/crash. Currently lost. Drafts and UI state should live in SQLite, not localStorage.

## Design decisions

- DB owns: chat draft, Create form drafts, selected Create tab, profile, messages, assets, tool history, quotas.
- localStorage allowed only for: `hg_onboarding_done`, recent error toast (10min TTL), in-progress stream scratch (capped).
- Draft APIs: `GET/PUT/DELETE /api/draft/chat`, `GET/PUT/DELETE /api/draft/create`.
- Debounced writes (150-300ms). Flush on submit, modal close, tab change, visibilitychange, pagehide.
- Clear chat draft only after stream completes with `done` + no error. Clear Create draft only after matching tool history success.

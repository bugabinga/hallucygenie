# HG-SPEC-005: DB-first draft + UI state persistence

## Problem

User input must survive reload/crash. Currently lost. Drafts and UI state should live in SQLite, not localStorage.

## Design decisions

- DB owns: chat draft, Create form drafts, selected Create tab, profile, messages, assets, tool history, quotas.
- Header quota mirrors MiniMax provider quota shape.
- Token Plan unified usage shows as General.
- Video shows separately while MiniMax returns a separate video row.
- Provider `total=0` means exact count unknown, not exhausted.
- Video `total=0` is a suspected upstream quota-reporting bug; recheck later.
- No fake per-feature quota counts.
- localStorage allowed only for: `hg_onboarding_done`, recent error toast (10min TTL), in-progress stream scratch (capped).
- Draft APIs: `GET/PUT/DELETE /api/draft/chat`, `GET/PUT/DELETE /api/draft/create`.
- Debounced writes (150-300ms). Flush on submit, modal close, tab change, visibilitychange, pagehide.
- Clear chat draft only after stream completes with `done` + no error. Clear Create draft only after matching tool history success.

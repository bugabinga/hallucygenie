---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

# HG-ISSUE-096: Tracked frontend bundle drift

Repro: `just build` rewrote tracked `public/app.js`, leaving dirty generated diff after normal review/test work.

Cause: `.gitignore` ignored `public/app.js`, but git still tracked it and `build-check` compared against tracked output.

Fix: remove bundle from tracking. Build checks compile to temp output. E2E builds ignored bundle when needed. Static tests assert bundle remains untracked.

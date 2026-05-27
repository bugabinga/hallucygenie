---
{ "status": "fixed", "specs": ["HG-SPEC-011"] }
---

Repro: README lacks first-release container run docs and `.env.example` is absent.
Cause: operators must infer env, volumes, ports, backups, quota risk, and no-built-in-auth posture.
Fix: add container install docs, trusted-network note, `MINIMAX_API_KEY`, `data/` volume, backup notes, quota warning, and `.env.example`.

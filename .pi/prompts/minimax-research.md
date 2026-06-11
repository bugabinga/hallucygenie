---
description: Research MiniMax API changes
---

Research MiniMax API capabilities for HallucyGenie.

1. Read `/skill:minimax` and `/skill:research`.
2. Fetch current MiniMax docs into `.pi/research/pages/` with date suffix:
   - `https://platform.minimax.io/docs/llms.txt`
   - relevant `.md` docs
   - linked OpenAPI JSON for affected APIs
3. Diff against previous dated cache. Check models, endpoints, auth, quotas, payload shapes, defaults, limits, and response fields.
4. Search current code for affected constants/payloads in `src/tools.ts`, `src/db.ts`, `src/agent.ts`, `src/server.ts`, tests, specs, docs.
5. Update `.pi/skills/minimax/SKILL.md` only for factual changes.
6. Report findings as:
   - required code changes
   - optional future features
   - no project impact
7. Do not run live quota-consuming tests unless explicitly asked.
8. Do not recommend exposing raw provider complexity to kids unless spec requires it. HallucyGenie picks best models internally.
9. If no changes are needed, say so.

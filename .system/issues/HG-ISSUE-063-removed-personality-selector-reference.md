---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-003"] }
---

Repro:

- Search codebase for `personality` / `personality-select`.
- Only current hit: `test/static.test.ts` asserts generated bundle does not contain removed `personality-select`.
- No runtime UI/API path found.
- `logs/dev.log` has normal frontend/profile loads only: `GET /app.js` returned `200`; `GET /style.css` returned `200`; `GET /api/profile` returned `200`.

Cause:

- Personality selector was removed from product UI, but dead-name regression text remains in tests.
- HG-SPEC-003 profile personalization is source of truth now.
- HG-SPEC-011 says delete compat/dead branches not required by accepted specs.
- Related: HG-ISSUE-048 moved personalization into Profile fields.

Fix:

- Remove `personality` / `personality-select` references from codebase, including tests.
- Replace with current contract names if a regression is still useful.
- Add static assertion that no `personality` tokens remain in tracked source.

Resolution 2026-05-17:

- Replaced stale `profile-style-select` bundle guard with a current no-personality-token source/bundle guard.
- Confirmed no runtime UI/API/source references remain.

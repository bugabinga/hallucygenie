---
{ "status": "fixed", "specs": ["HG-SPEC-020"] }
---

Repro: `bun scripts/verify-new-specs.ts` absent; HG-SPEC-020 checks were manual/test-backed.

Cause: image flow was text-to-image only. `generate_image` schema forbade direct `subject_reference`; no app-owned reference path existed.

Fix:
- Added Create Image reference upload, preview, clear, draft restore, history/tweak restore.
- Added existing image asset selection from Assets.
- Added `/api/reference-image` PNG/JPG validation and asset save.
- Added server-owned transient MiniMax `subject_reference` payload from local asset bytes.
- Kept raw bytes/base64/data URLs out of messages/prompts/logs/tool input history.

Proof:
- `bun test test/unit/app.test.ts test/unit/server.test.ts test/unit/static.test.ts`
- `just typecheck`
- `just build-check`

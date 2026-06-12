---
{ "status": "open", "specs": ["HG-SPEC-005", "HG-SPEC-019"] }
---

Repro: real `GET /v1/token_plan/remains` with Subscription Key now returns only:

- `general`, `total=0`, `used=0`
- `video`, `total=0`, `used=0`

Docs say Token Plan now uses usage-based deduction and a unified quota pool. Console usage bar is source of truth. Text/image/audio quotas are not separated.

Observed app header still renders legacy feature slots:

- image
- speech
- music
- video
- lyrics

Current `?` fallback is honest but mismatched to provider shape.

Expected:

- Header mirrors provider quota shape: General + Video.
- General means unified MiniMax usage, not per-feature remaining counts.
- Video `total=0` remains unknown/temporary upstream inconsistency, not local blocker.
- Treat video `total=0` as suspected upstream quota-reporting bug until rechecked.
- Recheck MiniMax quota response later before making this permanent policy.
- Provider create/query errors remain authoritative for video availability.
- No fake per-feature counts.

Cause: MiniMax moved from fixed per-model quotas to unified usage. App still exposes old per-feature quota taxonomy.

Fix: replace feature quota badge with provider-shaped quota badge. Keep video zero-total as unknown. Add a follow-up recheck note for MiniMax quota API behavior. Update tests and docs contract after human spec approval.

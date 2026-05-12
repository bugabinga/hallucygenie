---
{ "status": "fixed", "specs": ["HG-SPEC-003", "HG-SPEC-011"] }
---

# HG-ISSUE-050: Profile API accepts raw avatar data URL payload

Repro:

```bash
curl -i -X PUT http://localhost:3000/api/profile \
  -H 'Content-Type: application/json' \
  -d '{"username":"Manual QA","interests":"Minecraft","hates":"ads","favorites":"blue fire","avatar":"data:image/png;base64,AAAA"}'
```

Observed:

- Server returns `200 OK`.
- Response silently defaults avatar to `🎮`.
- Same malformed string avatar payload with `🧪` also returns `200` and saves `🎮`.

Expected:

- Server rejects raw asset data at API boundary.
- Server rejects wrong avatar shape/type loudly.
- No silent fallback on invalid user profile input.

Cause:

- Client helper rejects data URL avatars.
- Server boundary accepts malformed `avatar` string payload and normalizes it away.
- Tests cover client/helper object shape, not hostile/malformed HTTP payload shape.

Fix:

- Validate exact profile payload shape server-side.
- Reject raw `data:` anywhere in profile input with 400.
- Reject invalid avatar type/shape with 400.
- Add HTTP regression tests for string avatar data URL and invalid avatar object.

Resolution:

- Server profile normalization now rejects non-object avatar payloads and raw `data:` avatars loudly.
- HTTP and DB regression tests cover data URL strings and invalid avatar shapes.

---
{ "status": "open", "specs": ["HG-SPEC-006", "HG-SPEC-011", "HG-SPEC-012", "HG-SPEC-016"] }
---

# HG-ISSUE-079: Create internal tool directives visible

Repro:

- Open Create.
- Submit Image, Music, Voice, Analyze, or Write lyrics.
- Watch live chat.
- Open Recent for same Create tab.

Observed:

- User bubble shows internal protocol:
  `Use generate_image with prompt: ...`
  `Use analyze_image with image_url: ...`
- Tool history records explicit directives with `origin=chat`.
- Create-origin actions are indistinguishable from chat-origin directives.

Expected:

- Kid sees kid-facing Create result/card only.
- Internal tool protocol never renders as user chat.
- Create-triggered tools record `origin=create`.

Cause:

- Create forms call generic `sendMessage()` with internal directive strings.
- Server direct execution records all explicit directives as `origin=chat`.

Fix:

- Add structured Create execution path or `/api/create-tool` endpoint.
- Send tool name, origin, prompt, params as JSON.
- Render kid-facing submitted/result UI.
- Persist compact assistant/tool result only.
- Assert no `.message--user` contains `Use generate_`, `Use analyze_`, or `Tool params:` after Create actions.

---
{ "status": "fixed", "specs": ["HG-SPEC-005"] }
---

# HG-ISSUE-055: Steering live UI duplicates output and leaves steer bubble at bottom

Repro:

- `just dev`, `just dev-chrome`.
- New clean session.
- Send: `Write a 300-word kid-friendly story about a pixel turtle. No tools.`
- During stream, send steer: `Steer: make the ending about teamwork.`
- Wait for completion.

Observed live DOM before reload:

- Assistant response contained original story plus revised story in same bubble.
- First ending still said bravery; second ending said teamwork.
- Steer bubble remained visually after assistant response, at bottom of transcript.
- `message--steer` class was removed, but bubble text stayed as last DOM message.

Observed DB/reload:

- DB persisted correct chronological turns:
  user → assistant → user steer → assistant.
- Reload fixed ordering.

Expected:

- Live DOM order matches persisted DB order.
- Steer should either modify future generation cleanly or create a new user turn + assistant turn.
- No duplicate contradictory answer in one assistant bubble.
- No orphan steer bubble after completion.

Cause:

- Streaming DOM path appends steer-triggered assistant continuation into current assistant node.
- Live DOM is not rebuilt from persisted message turns after steer processing.

Fix:

- When steer is accepted, close current assistant turn or render steer as real user message before next assistant turn.
- Do not concatenate pre-steer and post-steer outputs into one assistant bubble.
- Add E2E: mid-stream steer live DOM must equal reload DOM.

Resolution:

- Each new assistant turn emits an `assistant_turn_start` event, causing the frontend to create a fresh assistant bubble instead of appending to the pre-steer bubble.
- Regression tests cover tool/thinking/text ordering and orphan prevention.

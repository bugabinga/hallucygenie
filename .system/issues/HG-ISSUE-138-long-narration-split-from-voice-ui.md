---
{ "status": "fixed", "specs": ["HG-SPEC-021", "HG-SPEC-016", "HG-SPEC-005", "HG-SPEC-006"] }
---

Repro: open Create. Voice and Narration are separate top-level tabs: `create-tab-voice` and `create-tab-narration`. Switching tabs writes `selectedTab: "narration"` and loads separate histories: `kind=voice` vs `kind=narration`.

Cause: HG-ISSUE-134 fix implemented async long TTS as `Create Narration tab beside Voice`. HG-SPEC-021 says one long-form voice flow, keeps short Voice unchanged, and reuses Voice/style controls. It does not explicitly authorize a separate top-level Narration tab. Result: long narration is visible as a separate mode, not a transparent Voice special case. Related: HG-ISSUE-134.

Fix: Voice submit transparently routes long text over 1000 chars to `generate_long_speech`; short text still uses `text_to_speech`. Removed top-level Narration tab/form. `generate_long_speech` history/tweak kind is Voice. Draft/history tests align Voice UI, `text_to_speech`, and `generate_long_speech`. Cross-ref HG-ISSUE-139 for compacting the expanded interjection controls after this merge.

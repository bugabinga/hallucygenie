---
{ "status": "open", "specs": ["HG-SPEC-011", "HG-SPEC-016"] }
---

Repro: ask the chat agent what HallucyGenie can do or how to use Create, Assets, profile, sessions, image/music/voice/search/analyze tools. Agent gives generic assistant help instead of app-aware guidance.
Cause: agent system context describes behavior/tools but does not include a compact product help map for HallucyGenie UI/features, kid-facing workflows, and tool affordances.
Fix: add tested self-help context to the agent prompt: app name, mission, tabs, Create workflows, chat tool abilities, Assets/history, profile/session basics, quota warning, and raw-media safety rule. Keep it compact and derived from code/docs, not DB. Cross-ref HG-ISSUE-049, HG-ISSUE-066, HG-ISSUE-075, HG-ISSUE-078, HG-ISSUE-112.

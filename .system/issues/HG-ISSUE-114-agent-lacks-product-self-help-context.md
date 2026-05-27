---
{ "status": "fixed", "specs": ["HG-SPEC-011", "HG-SPEC-016"] }
---

Repro: ask the chat agent what HallucyGenie can do or how to use Create, Assets, profile, sessions, image/music/voice/search/analyze tools. Agent gives generic assistant help instead of app-aware guidance.
Cause: agent system context describes behavior/tools but does not include a compact product help map for HallucyGenie UI/features, kid-facing workflows, and tool affordances.
Fix: added tested product help context to the agent prompt: app surfaces, Create workflows, chat tool abilities, Assets/history, profile/session basics, quota warning, tool-card tweak/details, and raw-media safety rule. Cross-ref HG-ISSUE-049, HG-ISSUE-066, HG-ISSUE-075, HG-ISSUE-078, HG-ISSUE-112.

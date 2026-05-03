---
{ "status": "fixed", "specs": ["HG-SPEC-005"] }
---

# HG-ISSUE-010: Steering messages not processed after turn

Yellow steer bubble appeared but stayed orphaned after agent turn completed.
Cause: `SteerQueue` had no active `runAgentLoop` to consume it.
Fix: drain remaining steers after turn completion or trigger new turn.

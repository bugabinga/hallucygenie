---
{ "status": "fixed", "specs": ["HG-SPEC-007"] }
---

# HG-ISSUE-014: Reload missing thinking blocks and tool outputs

After reload, conversation history lost thinking blocks and tool output cards.
Cause: history API returned plain text only, not structured tool/thinking data.
Fix: persist and restore thinking blocks and tool result metadata in history.
Completed tool observations are now committed before browser delivery or provider continuation.
Partial visible prose and reasoning survive interrupted streams.
Regression coverage: `test/integration/context-failure.test.ts`.

## Plan Review: Step 3 — System Prompt

### Verdict: APPROVE

### Summary

The plan is well-scoped and correctly identifies the three outcomes needed: write the system prompt constant, build a helper function that appends user preferences, and test both. The existing codebase already has the right hooks (`createAgentState(systemPrompt)` in `agent.ts`, `getPreferences(db)` in `db.ts`), and the plan leverages them cleanly. Injection of the system prompt into `runAgentLoop` calls is correctly deferred to Step 4 when the chat endpoint gets wired.

### Issues Found

None.

### Missing Items

None. The plan covers all outcomes from PROMPT.md Step 3 that belong in this step. The "inject system prompt into every `runAgentLoop` call" checkbox from PROMPT.md is rightfully Step 4's job — that's when the server calls the agent loop and will use `buildSystemPrompt()` to construct the system message.

### Suggestions

- **Export the new symbols** — `SYSTEM_PROMPT` and `buildSystemPrompt` should be exported from `agent.ts` so `server.ts` can import them in Step 4. The worker likely knows this, but worth noting.
- **Keep `buildSystemPrompt` DB-decoupled** — The plan's signature `buildSystemPrompt(preferences?)` is the right design (takes a `Record<string, string>`, not a DB instance). This keeps `agent.ts` free of SQLite imports. The server in Step 4 will call `getPreferences(db)` and pass the result in.
- **System prompt content guidelines** (from PROMPT.md, for reference when writing the actual text):
  - Extremely concise — "Think Twitter, not email"
  - No filler prefixes like "Sure!" or "I'd be happy to help!"
  - When calling image/music tools, craft detailed descriptive prompts itself, don't ask user to refine
  - Knows popular games, video editing, thumbnail design
  - Not condescending (11, not 5) — no lectures, no safety warnings, no disclaimers
- **Consider snapshot testing the system prompt** — Since PROMPT.md says "The user will review and edit the system prompt later", a snapshot test on the prompt text makes the intent to review/change it visible. Minor — the planned tests (non-empty, preferences append) are sufficient.

## Plan Review: Step 1 — Tool Definitions and Execution

### Verdict: APPROVE

### Summary

The Step 1 plan in STATUS.md is well-structured and covers all the outcomes required by PROMPT.md: tool schemas, executeTool dispatcher, three tool implementations (image, TTS, music), and comprehensive tests including error cases and snapshots. The checkboxes are at the right level of granularity — they describe meaningful outcomes, not implementation minutiae.

### Issues Found

None blocking.

### Missing Items

1. **Justfile update for tools.test.ts** — The STATUS.md plan includes a checkbox "Update justfile to include tools.test.ts in test commands." This is good — the current justfile's `test`, `test-coverage`, and `test-update-snapshots` recipes only reference `server.test.ts agent.test.ts`. The worker must add `tools.test.ts` to all three recipes. The plan correctly captures this.

2. **API key usage in tool functions** — The PROMPT.md specifies reading from `Bun.env.MINIMAX_API_KEY`. The tool functions will need the API key to make MiniMax calls. The plan doesn't explicitly mention how the key flows into tool implementations, but since `executeTool` is a plain function dispatcher and the existing server already reads the key from env, this is implementation detail the worker can handle. Not blocking.

3. **Tool schema format alignment** — The existing `tools.ts` already exports `ToolDefinition` interface (OpenAI function calling format) which server.ts's `buildMiniMaxPayload` uses via `getToolDefinitions()`. The worker just needs to populate the currently-empty `getToolDefinitions()` return value. This is straightforward from the plan.

### Suggestions

- **Consider `MINIMAX_BASE` reuse** — server.ts already exports `MINIMAX_BASE = "https://api.minimax.io"`. The tool functions should import and reuse this constant rather than hardcoding the base URL, to stay DRY.
- **Audio conversion utility** — Both TTS and music tools do the same hex→base64→data URL conversion. A shared helper like `hexToAudioDataUrl(hex: string): string` would avoid duplication. This is an implementation detail, not a plan requirement.
- **Snapshot directory** — No `__snapshots__/` directory exists yet. The worker will need to create it. The plan's snapshot test checkbox covers this implicitly.
- **Test file naming** — Note that the PROMPT.md says `tools.test.ts` but the justfile pattern uses the Node.js test runner. The existing tests use `node:test` with `describe`/`it`. The worker should follow this same pattern for consistency.

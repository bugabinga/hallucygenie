---
{ "status": "fixed", "specs": ["HG-SPEC-006", "HG-SPEC-008", "HG-SPEC-011"] }
---

# HG-ISSUE-075: Tool result context lost after MiniMax tool-id rejection

Repro/session evidence:

- Local DB: `data/hallucygenie.db`
- Session: `Sup My Man`
- Session id: `664fca1a-cf54-4c76-a595-38b4a2128a50`
- Timeline:
  - `20:11:27` user: `lets start with the thumbnail: make me a funny face with sparkles`
  - `20:11:46` assistant called `generate_image` with `call_function_5flntgptbxld_1`
  - `20:11:46` tool saved `/asset/asset_46caec37-b1e4-4818-b144-3776841af18d`
  - `20:11:57` user: `nice, any ideas for improvemnets?`
  - `20:12:19` assistant called `generate_image` again with similar thumbnail prompt instead of giving improvement ideas
  - `20:12:25` user: `give me a list of ideas`
  - `20:12:45` assistant called `generate_image` a third time instead of listing ideas
  - `20:13:24` user: `list 5 thumbnail ideas`
  - `20:13:29` assistant finally returned text list

Log evidence:

- `logs/dev.log:22549` MiniMax rejected first tool result id:
  - `invalid params, tool result's tool id(call_function_5flntgptbxld_1) not found (2013)`
- `logs/dev.log:22578` rejected second tool result id:
  - `call_function_0saw1sfss1qa_1`
- `logs/dev.log:22605` rejected third tool result id:
  - `call_function_stfm3715c4nc_1`

Observed:

- Tool calls and tool results were persisted in DB, but each post-tool model continuation hit MiniMax `tool id not found`.
- The app suppressed that provider error and ended the turn after persisting only the assistant tool-call row plus tool result row.
- On later turns, the LLM behaved as if it did not understand that a tool had just run and repeated image generation for conversational follow-ups like "ideas" / "list".

Expected:

- After a tool succeeds, the assistant should be aware of the tool result in the same turn or in later turns.
- If the provider rejects `tool_result` continuation, the app should still preserve a coherent assistant-visible summary that says the tool already completed.
- Follow-up asks for ideas/improvements should not trigger repeated tool calls unless the user explicitly asks to generate another asset.

Regression risk:

- This can burn media quota and confuse kids by generating duplicate assets instead of answering follow-up questions.
- It also hides a protocol failure behind a superficially successful UI tool card.

Possible fix:

- Investigate why MiniMax rejects the returned `tool_result` id immediately after accepting the `tool_use` stream.
- Do not silently end the turn with only tool protocol rows when provider continuation fails.
- Add a persisted assistant summary after successful tool execution if continuation fails, e.g. `Generated image with generate_image: /asset/...`.
- Ensure future context replays compact tool summaries in a provider-compatible way, not malformed Anthropic tool protocol if MiniMax cannot accept it.
- Add a regression test for: user asks tool → tool succeeds → provider rejects continuation → next user asks for ideas → model context includes prior generated asset summary and does not require a duplicate tool call.

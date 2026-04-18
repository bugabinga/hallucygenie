# Task: HG-018 — Media Tools + Forms UI

**Created:** 2026-04-18
**Size:** L

## Review Level: 2 (Plan + Code)

**Assessment:** Adds 5+ new tool integrations + full forms UI. Wide but not deep — same pattern repeated.
**Score:** 4/8 — Blast radius: 2 (backend + frontend), Pattern novelty: 1 (extending existing patterns), Security: 0, Reversibility: 1 (new code, easy to remove)

## Mission

Add all missing MiniMax tool integrations (web search, vision, lyrics, music cover, voice list) and a media tools dropdown UI in the header. The dropdown opens forms for each media type with kid-friendly parameter controls. Form submission generates a structured prompt that the agent executes as a tool call.

**Why:** Kid should be able to explicitly request "make me an image" with parameters, not just hope the agent decides to use a tool. Also unlocks web search and vision — powerful features the plan includes.

## Dependencies

- **Task:** HG-010 (Anthropic migration — tools use `input_schema` format)

## Context to Read First

- `tools.ts` — existing tool definitions and executors
- `agent.ts` — how tools are registered and called
- `public/app.ts` — existing UI rendering
- `public/style.css` — dark theme, red/green/gold

## File Scope

- `tools.ts` — add 5 new tool definitions + executors
- `tools.test.ts` — test new tools
- `agent.ts` — update system prompt to handle structured media requests
- `server.ts` — no change (tools are transparent to server)
- `public/app.ts` — add dropdown button, form panels, prompt generation
- `public/style.css` — form styles, dropdown styles
- `public/app.test.ts` — test form rendering and prompt generation

## Steps

### Step 1: Add new tool integrations

Each tool: definition (Anthropic `input_schema`), executor function, error handling.

- [ ] `web_search` — `POST /v1/coding_plan/search` with `{query}`. Returns formatted search results text. Shares chat quota (4500/5hrs).
- [ ] `analyze_image` — `POST /v1/coding_plan/vlm` with image URL or base64. Returns description text. Shares chat quota.
- [ ] `generate_lyrics` — lyrics generation endpoint with `{topic, mood, language}`. 100/day quota.
- [ ] `generate_music_cover` — cover from reference audio. `POST /v1/music_generation` with `audio_url` + `prompt`. 100/day quota.
- [ ] `list_voices` — `GET /v1/get_voice`. Returns available voice list. No quota cost.
- [ ] Add quota checks in `db.ts` for new features (lyrics_generation, music-cover)

### Step 2: Media tools dropdown UI

- [ ] Add "🎨 Create" button in header
- [ ] Clicking opens dropdown panel with tabs/cards for each media type:
  - **🎨 Image** — prompt text, aspect ratio dropdown (1:1, 16:9, 9:16, 4:3)
  - **🎵 Music** — description, instrumental toggle, lyrics text area (optional)
  - **🎤 Voice** — text to speak, voice selector (fetched from list_voices), speed (0.5x-2.0x)
  - **📝 Lyrics** — topic/theme, mood dropdown, language
  - **🖼 Analyze** — image URL input or upload, question
  - **🔍 Search** — search query
- [ ] Each form has fun emoji icons, kid-friendly labels, sensible defaults
- [ ] Submit button generates structured prompt: e.g. `"Generate an image: [user's prompt]. Aspect ratio: 16:9."` → injected as user message → agent executes tool

### Step 3: Update agent system prompt

- [ ] Add instructions: when user sends structured media requests (detected by patterns like "Generate an image:", "Search the web for:", etc.), use the specified parameters exactly
- [ ] Don't second-guess the parameters — the kid chose them

### Step 4: Test

- [ ] Test each new tool executor with mocked API responses
- [ ] Test form rendering and prompt generation
- [ ] Test quota checks for new features
- [ ] `just test` passes all tests

## Do NOT

- Implement video generation (not on our plan)
- Add file upload for images yet (that's HG-019)
- Overbuild the forms — keep them simple and fun
- Use frameworks or component libraries

## Must Update

- `AGENTS.md` — add new tools to architecture section
- `Tasks/CONTEXT.md` — update test coverage

## Check If Affected

- `db.ts` — may need quota tracking for lyrics_generation and music-cover
- `server.ts` — should NOT change (tools are transparent)

## Git Commit Convention

```
HG-018: add media tools and forms UI

- 5 new tools: web_search, analyze_image, generate_lyrics, generate_music_cover, list_voices
- Header dropdown with parameter forms for each media type
- Form submission generates structured prompts for agent
- Co-authored-by: task-agent
```

## Amendments

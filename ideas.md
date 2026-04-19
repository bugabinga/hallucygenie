# Ideas

## 1. 🎨 Bot Avatar Generator (Easy)

Auto-generate a unique avatar for the AI assistant based on the session's chat history. Use the image generation API to create a fun character that "evolves" as the kid talks more. The avatar reflects the vibe of the conversation—pixel art after gaming talk, cartoon after silly talk.

---

## 2026-04-19 — typing-rainbow

**What:** Character-by-character text reveal with per-character rainbow hue gradient, synchronized to SSE stream.

**Why it wins:** HallucyGenie streams chat responses via SSE. Typing effect with rainbow colors creates visual flair that maps naturally to the streaming paradigm. Unlike lolcat (which does per-line), this applies per-character hue shift — creates smooth gradient effect across words.

**Implementation:**

- Map each character's position in string to hue offset (0-360°)
- Apply ANSI 256-color codes per character
- Speed configurable (default 50ms per character)
- Only apply to headers/emphasis, not body text for readability

**Timeline:** 2-3 hours to prototype

**Go/No-Go:** If effect causes noticeable lag in streaming (>100ms overhead), abandon. If terminal doesn't support 256 colors, fall back to 8-color ANSI.

**Rejected:**

- lolcat-sync: just reimplementing lolcat, no advantage
- progress-arc: monospace geometry is always janky
- border-box: too static without animation

---

## 2026-04-19 — brainstorm (DIVERGE → CHALLENGE → DEFEND → CONVERGE)

### Phase 1 — DIVERGE (8 ideas generated)

1. Gaming Co-Creator Mode — proactive video ideas/thumbnails in agent loop
2. Image Gallery + Share — browse past images, share to community
3. Voice Personality Selector — pick TTS/chat personas
4. Session Memory — agent remembers projects across sessions
5. Quota Dashboard with Predictor — "when will I run out" estimator
6. Shared Session Links — read-only public view of conversation
7. Content Memory (Family-Safe Filter) — moderation layer for under-13
8. Offline Cached Responses — serve stale on API failure

### Phase 2 — CHALLENGE (adversarial sub-agent, all 8 KILL'd)

### Phase 3 — DEFEND (4 defended with corrections)

- #1: Constrain to explicit action button, not proactive agent behavior
- #2: Correct architecture to file system + SQLite metadata (drop BLOBs, drop share)
- #3: Rename "Chat Personality" — no TTS changes, honest labeling
- #4: Replace LLM memory with SQLite-structured user-declared project table

### Phase 4 — CONVERGE (final recommendations)

---

## RECOMMENDATION 1 of 3: Image History Browser ✅ Ship First

**What:** Browse all generated images across sessions. Images stored on file system (`data/images/{reqId}.png`), metadata (prompt, timestamp, session_id, type) in SQLite. Simple gallery UI with click-to-expand prompt. No share/export — just "where did my stuff go?"

**Why it wins:** Solves the #1 experienced pain: kid generates an image, refreshes page, image is gone forever. Every other idea requires changing user behavior. This removes a loss. File system + SQLite metadata is the correct architecture (not BLOBs).

**Timeline:** 4-6 hours. Add `saveImageToFs()` helper in tools.ts, write migration `015_image_history.sql`, add gallery DOM in app.ts, add CSS grid in style.css. No new dependencies.

**Go/No-Go:** If fs pathing or migration fails, abandon. If storage grows >500MB, add auto-cleanup of images older than 30 days.

**Rejected:**

- Gaming Co-Creator (full proactive): scope creep, fragments agent loop → deferred to button-constrained version
- Image Gallery with SQLite BLOBs: anti-pattern, acknowledged and corrected above
- Shared Session Links: auth + SSE multi-client + moderation = full new product
- Offline Cached Responses: stale-as-fresh is worse than clear failure

---

## RECOMMENDATION 2 of 3: Chat Personality Selector ✅ Ship Second

**What:** Settings dropdown: "Gaming Buddy", "Chill Dude", "Funny NPC". Each maps to a different system prompt prefix. No TTS model changes — TTS always uses `speech-2.8-hd`. Labeled honestly as "chat personality," not "voice."

**Why it wins:** Near-zero cost. One enum, 3 prompt strings, one dropdown. 11-year-old gets novelty and identity expression. Adversarial correctly flagged the "voice" deception — rename it and the problem disappears.

**Timeline:** 30 minutes to 1 hour. Add personality enum to settings, map to system prompt prefix, add dropdown in settings UI.

**Go/No-Go:** If MiniMax chat quality degrades with any personality prompt (perplexity check), drop the failing personality. Keep the ones that work.

**Rejected:**

- Voice Personality Selector (original name): TTS is fixed, name implied TTS change — renamed to Chat Personality
- Content Filter layer: redundant with MiniMax policy, adds latency and false positives

---

## RECOMMENDATION 3 of 3: Gaming Co-Creator Button ⏳ Defer

**What:** Explicit "Get Video Ideas" button in UI. Triggers a separate, bounded prompt (not inside the streaming agent loop) that returns 3 video title + thumbnail idea pairs. Results shown as a card with copy button. No proactive suggestions during normal chat.

**Why it wins:** Builds on existing image generation (thumbnail mockups) + chat (title generation). Leverages existing tools with constrained scope. Adversarial's own fix is "separate tool" — this achieves exactly that. Deferred until Image History ships (thumbnail mockups need gallery to look good).

**Timeline:** 2-3 hours once Image History is done.

**Go/No-Go:** If thumbnail generation consumes disproportionate quota relative to chat-based titles, add a toggle to disable image generation in co-creator mode.

**Rejected:**

- Gaming Co-Creator (full proactive): turns chat proxy into content strategist, fragments core experience
- Session Memory (LLM-based): hallucination risk disqualifying for under-13 product
- Quota Dashboard with Predictor: built on imprecise call-count data, produces false precision → existing 80%/100% warnings are sufficient

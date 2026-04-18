# Task: HG-017 — First-Run Onboarding

**Created:** 2026-04-18
**Size:** M

## Review Level: 1 (Plan Only)

**Assessment:** New UI-only feature. No security impact. Pure frontend + one preference flag.
**Score:** 2/8 — Blast radius: 1 (frontend only), Pattern novelty: 1 (new overlay pattern), Security: 0, Reversibility: 0

## Mission

Build a fun, kid-friendly onboarding experience that runs on first visit and can be reopened via a help button. Showcases all features: chat, image generation, music, voice, web search, vision analysis. Each slide has a try-it button that sends a pre-filled example message. Onboarding state stored in preferences table.

**Why:** First impression matters. Kid opens the app, sees "Hey! I'm HallucyGenie 🧞" with animated slides showing what's possible. Immediately engaged, not confused.

## Dependencies

- **Task:** HG-018 (onboarding showcases all media tools — they must exist first)

## Context to Read First

- `public/app.ts` — existing UI rendering
- `public/style.css` — dark theme, red/green/gold
- `db.ts` — `savePreference()`, `getPreferences()`

## File Scope

- `public/app.ts` — onboarding overlay, slides, try-it buttons
- `public/style.css` — onboarding styles, animations
- `server.ts` — no change (uses existing preference API)
- `public/app.test.ts` — test onboarding rendering and interaction

## Steps

### Step 1: Onboarding state management

- [ ] On session connect, check if `onboarding_done` preference exists
- [ ] If not, fetch it via existing `GET /api/preferences` (or add endpoint if needed)
- [ ] If `onboarding_done !== "true"`, show onboarding overlay
- [ ] On dismiss/skip, save `onboarding_done: "true"` via `POST /api/preferences`

### Step 2: Onboarding overlay UI

- [ ] Full-screen modal overlay with backdrop blur
- [ ] Card/slide format with navigation dots and "Next" / "Skip" buttons
- [ ] Slides (5-6 total):
  1. "Hey! I'm HallucyGenie 🧞" — welcome, fun genie animation
  2. "Ask me anything! 💬" — chat demo, try-it: "What's the rarest Minecraft block?"
  3. "I can make images! 🎨" — image gen demo, try-it: "Generate a cool gaming logo"
  4. "I can make music! 🎵" — music demo, try-it: "Make me an upbeat electronic jingle"
  5. "I can read to you! 🎤" — TTS demo, try-it: "Read this: Welcome to HallucyGenie!"
  6. "Let's go! 🚀" — summary, big "Start chatting!" button
- [ ] CSS `@keyframes` transitions between slides (fade or slide)
- [ ] Each try-it button pre-fills the chat input and optionally auto-sends

### Step 3: Help button for reopening

- [ ] Add `?` or "Help" button in header (small, unobtrusive)
- [ ] Clicking reopens onboarding overlay
- [ ] Reset `onboarding_done` preference if needed (or just show without resetting)

### Step 4: Test

- [ ] Test onboarding renders when `onboarding_done` is not set
- [ ] Test skip/dismiss saves preference
- [ ] Test try-it buttons generate correct messages
- [ ] Test help button reopens onboarding
- [ ] `just test` passes all tests

## Do NOT

- Show onboarding every visit — only first time (unless help button clicked)
- Make it a wall of text — keep each slide to 1-2 sentences
- Block chat while onboarding is showing — let kid dismiss anytime
- Use a carousel library — vanilla CSS animations are enough

## Must Update

- `Tasks/CONTEXT.md` — update test coverage

## Check If Affected

- `server.ts` — may need preference endpoints if not already exposed
- `db.ts` — should NOT change (preferences already exist)

## Git Commit Convention

```
HG-017: add first-run onboarding experience

- Animated slide-based onboarding showcasing all features
- Try-it buttons with pre-filled example messages
- Help button to reopen onboarding
- State persisted in preferences table
- Co-authored-by: task-agent
```

## Amendments

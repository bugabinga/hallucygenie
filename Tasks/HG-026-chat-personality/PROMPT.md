# HG-026: Chat Personality Selector

Add a settings dropdown: "Gaming Buddy", "Chill Dude", "Funny NPC". Each maps to a different system prompt prefix. Stored in preferences, applied on every chat.

## Why

Near-zero cost. One enum, three prompt strings, one dropdown. 11-year-old gets novelty and identity expression. Labeled honestly as "chat personality" — no TTS changes.

## Changes

### 1. Personality definitions in `agent.ts`

```typescript
export type ChatPersonality = "gaming" | "chill" | "funny";

const PERSONALITY_PROMPTS: Record<ChatPersonality, string> = {
  gaming:
    "You're an enthusiastic gaming buddy who loves talking about games, Minecraft builds, YouTube ideas, and streaming.",
  chill:
    "You're a super chill dude who's relaxed about everything. Keep it casual and easygoing.",
  funny:
    "You're a silly, joke-cracking companion who loves puns and making the kid laugh.",
};

export function buildSystemPrompt(
  preferences?: Record<string, string>,
): string {
  const personality = (preferences?.personality ?? "gaming") as ChatPersonality;
  const prefix = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.gaming;
  return `${prefix}\n\n${SYSTEM_PROMPT}`;
}
```

### 2. Add preference to save in `server.ts`

After `setPreference` or on settings change:

```typescript
// POST /api/preferences
// Body: { key: "personality", value: "funny" }
```

Already handled by existing `setPreference` call in server.ts.

### 3. Frontend dropdown

In `public/index.html`, add a settings button in the header. Or add to the create modal tabs.

Simple approach: add to header as a dropdown:

```html
<select id="personality-select">
  <option value="gaming">🎮 Gaming Buddy</option>
  <option value="chill">😎 Chill Dude</option>
  <option value="funny">😂 Funny NPC</option>
</select>
```

In `public/app.ts`:

```typescript
export function init(): void {
  // Load saved personality preference
  const select = $("#personality-select") as HTMLSelectElement;
  const saved = localStorage.getItem("personality") ?? "gaming";
  select.value = saved;
  select.addEventListener("change", async () => {
    localStorage.setItem("personality", select.value);
    await fetch("/api/preferences", {
      method: "POST",
      headers: createApiHeaders(getOrCreateSessionId()),
      body: JSON.stringify({ key: "personality", value: select.value }),
    });
  });
}
```

## Tests

Add to `agent.test.ts`:

```typescript
it("buildSystemPrompt applies gaming personality", () => {
  const result = buildSystemPrompt({ personality: "gaming" });
  assert.ok(result.includes("gaming buddy"));
});

it("buildSystemPrompt applies funny personality", () => {
  const result = buildSystemPrompt({ personality: "funny" });
  assert.ok(result.includes("silly"));
});

it("buildSystemPrompt defaults to gaming", () => {
  const result = buildSystemPrompt({});
  assert.ok(result.includes("gaming buddy"));
});
```

Run: `just test-unit`

## Constraints

- No TTS model changes
- Personality stored in preferences table (already exists)
- Labeled honestly — "chat personality", not "voice"
- Dropdown is simple, no animations

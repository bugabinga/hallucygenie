# MiniMax lyrics API research

**Ticket:** `HG-TICKET-046-minimax-lyrics-api-research.md`  
**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** docs research; no live quota spent

## Known endpoint

```txt
POST https://api.minimax.io/v1/lyrics_generation
Authorization: Bearer $MINIMAX_API_KEY
Content-Type: application/json
```

MiniMax docs list this as the lyrics helper for music generation. It belongs
next to `music-2.6`; it should not create an asset by itself.

## Expected request shape

Use a small prompt-first schema for HallucyGenie:

```json
{
  "prompt": "spooky Minecraft boss fight song",
  "style": "8-bit rock",
  "mood": "excited"
}
```

Exact optional fields still need live confirmation before `generate_lyrics` is
implemented.

## Expected response handling

Treat response as text-first. If MiniMax returns structured sections, convert to
plain markdown/text before showing it to the user. Do not persist raw provider
JSON in chat unless a debug spec explicitly asks for it.

## Product decision

Keep `lyrics_optimizer` internal for now. The kid-facing flow should be:

1. Generate lyrics.
2. Let user read/edit them.
3. Spend music quota only when generating the song.

`lyrics_optimizer: true` can remain a later shortcut for agent-only one-turn
flows, but UI v1 should favor preview/edit control.

## No live smoke

No live request was run in this ticket. Existing instructions require explicit
approval before spending quota. Add script tests first if a smoke path is added.

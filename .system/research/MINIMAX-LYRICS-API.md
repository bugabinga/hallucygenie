# MiniMax lyrics API research

**Ticket:** `HG-TICKET-046-minimax-lyrics-api-research.md`  
**Spec:** `.system/specs/HG-SPEC-012-minimax-music-creator-tools.md`  
**Status:** docs + live smoke verified on 2026-05-10

## Known endpoint

```txt
POST https://api.minimax.io/v1/lyrics_generation
Authorization: Bearer $MINIMAX_API_KEY
Content-Type: application/json
```

MiniMax docs list this as the lyrics helper for music generation. It belongs
next to `music-2.6`; it should not create an asset by itself.

## Verified request shape

MiniMax requires an explicit mode. HallucyGenie should default to
`write_full_song` for new lyrics, and use `edit` only when existing lyrics are
provided.

```json
{
  "mode": "write_full_song",
  "prompt": "spooky Minecraft boss fight song"
}
```

Optional fields:

```json
{
  "mode": "edit",
  "prompt": "make the chorus stronger",
  "lyrics": "[Chorus]\nWe win today",
  "title": "Victory Song"
}
```

## Verified response handling

MiniMax returns top-level lyrics fields, not `data.lyrics`:

```json
{
  "song_title": "...",
  "style_tags": "...",
  "lyrics": "[Verse]\n...",
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

Treat `lyrics` as text-first. Do not persist raw provider JSON in chat unless a
debug spec explicitly asks for it.

## Product decision

Keep `lyrics_optimizer` internal for now. The kid-facing flow should be:

1. Generate lyrics.
2. Let user read/edit them.
3. Spend music quota only when generating the song.

`lyrics_optimizer: true` can remain a later shortcut for agent-only one-turn
flows, but UI v1 should favor preview/edit control.

## Live smoke

A live request was run on 2026-05-10 with:

```json
{
  "mode": "write_full_song",
  "prompt": "short kid-friendly four-line song about a brave robot"
}
```

Result: HTTP success, `base_resp.status_code = 0`, top-level `lyrics` length 900,
first non-empty line `[Verse]`. No secret or full provider payload is stored here.

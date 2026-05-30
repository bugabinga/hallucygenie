#!/usr/bin/env bash
set -euo pipefail

start_ms=$(date +%s%3N)
failures=0

repo=${PWD}
docs=/data/data/com.termux/files/home/.pi/research/pages
llms="$docs/platform.minimax.io.llms.2026-05-30.txt"
anthropic_doc="$docs/platform.minimax.io.docs.api-reference.text-chat-anthropic.md.2026-05-30"
tts_doc="$docs/platform.minimax.io.docs.api-reference.speech-t2a-http.md.2026-05-30"
image_doc="$docs/platform.minimax.io.docs.api-reference.image-generation-t2i.md.2026-05-30"
music_doc="$docs/platform.minimax.io.docs.api-reference.music-generation.md.2026-05-30"
lyrics_doc="$docs/platform.minimax.io.docs.api-reference.lyrics-generation.md.2026-05-30"

check() {
  local name="$1"
  shift
  if "$@"; then
    printf 'OK %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    failures=$((failures + 1))
  fi
}

contains() { rg -q --fixed-strings "$1" "$2"; }
contains_either() {
  local a="$1" b="$2" file="$3"
  rg -q --fixed-strings "$a" "$file" || rg -q --fixed-strings "$b" "$file"
}
count_at_least() {
  local needle="$1" file="$2" min="$3"
  local n
  n=$(rg -o --fixed-strings "$needle" "$file" | wc -l | tr -d ' ')
  test "$n" -ge "$min"
}

check docs_llms_present test -s "$llms"
check docs_anthropic_present test -s "$anthropic_doc"
check docs_tts_present test -s "$tts_doc"
check docs_image_present test -s "$image_doc"
check docs_music_present test -s "$music_doc"
check docs_lyrics_present test -s "$lyrics_doc"

check chat_model_latest contains 'MiniMax-M2.7-highspeed' src/agent.ts
check chat_model_in_docs contains 'MiniMax-M2.7-highspeed' "$anthropic_doc"
check chat_prompt_cache_control contains 'cache_control: { type: "ephemeral" }' src/agent.ts
check chat_thinking_signature_preserved contains 'thinking_signature' src/agent.ts
check chat_auth_header_official contains '"X-Api-Key": apiKey' src/agent.ts

check image_model_latest contains 'model: "image-01"' src/tools.ts
check image_model_in_docs contains 'image-01' "$image_doc"
check image_response_format_explicit contains 'response_format: "url"' src/tools.ts
check image_prompt_schema_limit contains_either 'maxLength: 1500' 'maxLength: IMAGE_PROMPT_MAX' src/tools.ts
check image_prompt_runtime_limit contains 'IMAGE_PROMPT_MAX = 1500' src/tools.ts

check tts_model_latest contains 'model: "speech-2.8-hd"' src/tools.ts
check tts_model_in_docs contains 'speech-2.8-hd' "$tts_doc"
check tts_output_format_explicit contains 'output_format: "hex"' src/tools.ts
check tts_audio_format_explicit contains 'audio_setting: { format: "mp3" }' src/tools.ts
check tts_text_schema_limit contains_either 'maxLength: 10000' 'maxLength: TTS_TEXT_MAX' src/tools.ts
check tts_text_runtime_limit contains 'TTS_TEXT_MAX = 10000' src/tools.ts

check music_model_latest contains 'model: "music-2.6"' src/tools.ts
check music_model_in_docs contains 'music-2.6' "$music_doc"
check music_instrumental_field contains 'is_instrumental' src/tools.ts
check music_output_formats_explicit count_at_least 'output_format: "hex"' src/tools.ts 3
check music_audio_formats_explicit count_at_least 'audio_setting: { format: "mp3" }' src/tools.ts 3
check music_prompt_schema_limit contains_either 'maxLength: 2000' 'maxLength: MUSIC_PROMPT_MAX' src/tools.ts
check music_lyrics_schema_limit contains_either 'maxLength: 3500' 'maxLength: MUSIC_LYRICS_MAX' src/tools.ts
check lyrics_prompt_schema_limit contains_either 'maxLength: 2000' 'maxLength: LYRICS_PROMPT_MAX' src/tools.ts
check lyrics_existing_schema_limit contains_either 'maxLength: 3500' 'maxLength: LYRICS_EXISTING_MAX' src/tools.ts
check music_prompt_runtime_limit contains 'MUSIC_PROMPT_MAX = 2000' src/tools.ts
check music_lyrics_runtime_limit contains 'MUSIC_LYRICS_MAX = 3500' src/tools.ts
check lyrics_prompt_runtime_limit contains 'LYRICS_PROMPT_MAX = 2000' src/tools.ts
check lyrics_existing_runtime_limit contains 'LYRICS_EXISTING_MAX = 3500' src/tools.ts
check bounded_text_validator contains 'boundedText(' src/tools.ts

elapsed_ms=$(( $(date +%s%3N) - start_ms ))
printf 'METRIC contract_failures=%s\n' "$failures"
printf 'METRIC scanner_ms=%s\n' "$elapsed_ms"

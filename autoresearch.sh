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
not_contains() { ! rg -q --fixed-strings "$1" "$2"; }
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
node_test() {
  local log=.autoresearch-tmp/node-agent-tools.log
  mkdir -p .autoresearch-tmp
  if node --test test/unit/agent.test.ts test/unit/tools.test.ts >"$log" 2>&1; then
    return 0
  fi
  tail -40 "$log"
  return 1
}

check docs_llms_present test -s "$llms"
check docs_anthropic_present test -s "$anthropic_doc"
check docs_tts_present test -s "$tts_doc"
check docs_image_present test -s "$image_doc"
check docs_music_present test -s "$music_doc"
check docs_lyrics_present test -s "$lyrics_doc"
check skill_docs_date contains 'Current docs crawl: 2026-05-30' .pi/skills/minimax/SKILL.md
check skill_prompt_caching contains 'cache_control' .pi/skills/minimax/SKILL.md

check chat_model_latest contains 'MiniMax-M2.7-highspeed' src/agent.ts
check chat_model_in_docs contains 'MiniMax-M2.7-highspeed' "$anthropic_doc"
check chat_prompt_cache_control contains 'cache_control: { type: "ephemeral" }' src/agent.ts
check chat_thinking_signature_preserved contains 'thinking_signature' src/agent.ts
check chat_auth_header_official contains '"X-Api-Key": apiKey' src/agent.ts
check chat_single_system_cache_breakpoint not_contains 'system.push({ type: "text", text: msg.content, cache_control' src/agent.ts
check chat_single_system_cache_test contains 'caches only final system block' test/unit/agent.test.ts

check image_model_latest contains 'model: "image-01"' src/tools.ts
check image_model_in_docs contains 'image-01' "$image_doc"
check image_response_format_explicit contains 'response_format: "url"' src/tools.ts
check image_response_format_test contains 'assert.equal(body.response_format, "url")' test/unit/tools.test.ts
check image_prompt_schema_limit contains_either 'maxLength: 1500' 'maxLength: IMAGE_PROMPT_MAX' src/tools.ts
check image_prompt_runtime_limit contains 'IMAGE_PROMPT_MAX = 1500' src/tools.ts

check tts_model_latest contains 'model: "speech-2.8-hd"' src/tools.ts
check tts_model_in_docs contains 'speech-2.8-hd' "$tts_doc"
check tts_output_format_explicit contains 'output_format: "hex"' src/tools.ts
check tts_audio_format_explicit contains 'audio_setting: { format: "mp3" }' src/tools.ts
check tts_output_format_test contains 'assert.equal(body.output_format, "hex")' test/unit/tools.test.ts
check tts_audio_format_test contains 'assert.deepEqual(body.audio_setting, { format: "mp3" })' test/unit/tools.test.ts
check tts_text_schema_limit contains_either 'maxLength: 10000' 'maxLength: TTS_TEXT_MAX' src/tools.ts
check tts_text_runtime_limit contains 'TTS_TEXT_MAX = 10000' src/tools.ts

check music_model_latest contains 'model: "music-2.6"' src/tools.ts
check music_model_in_docs contains 'music-2.6' "$music_doc"
check music_instrumental_field contains 'is_instrumental' src/tools.ts
check music_output_formats_explicit count_at_least 'output_format: "hex"' src/tools.ts 3
check music_audio_formats_explicit count_at_least 'audio_setting: { format: "mp3" }' src/tools.ts 3
check music_output_format_test count_at_least 'assert.equal(body.output_format, "hex")' test/unit/tools.test.ts 2
check music_audio_format_test count_at_least 'assert.deepEqual(body.audio_setting, { format: "mp3" })' test/unit/tools.test.ts 2
check music_prompt_schema_limit contains_either 'maxLength: 2000' 'maxLength: MUSIC_PROMPT_MAX' src/tools.ts
check music_lyrics_schema_limit contains_either 'maxLength: 3500' 'maxLength: MUSIC_LYRICS_MAX' src/tools.ts
check lyrics_prompt_schema_limit contains_either 'maxLength: 2000' 'maxLength: LYRICS_PROMPT_MAX' src/tools.ts
check lyrics_existing_schema_limit contains_either 'maxLength: 3500' 'maxLength: LYRICS_EXISTING_MAX' src/tools.ts
check music_prompt_runtime_limit contains 'MUSIC_PROMPT_MAX = 2000' src/tools.ts
check music_lyrics_runtime_limit contains 'MUSIC_LYRICS_MAX = 3500' src/tools.ts
check lyrics_prompt_runtime_limit contains 'LYRICS_PROMPT_MAX = 2000' src/tools.ts
check lyrics_existing_runtime_limit contains 'LYRICS_EXISTING_MAX = 3500' src/tools.ts
check music_cover_prompt_min contains 'MUSIC_COVER_PROMPT_MIN = 10' src/tools.ts
check music_cover_prompt_max contains 'MUSIC_COVER_PROMPT_MAX = 300' src/tools.ts
check music_cover_lyrics_min contains 'MUSIC_COVER_LYRICS_MIN = 10' src/tools.ts
check music_cover_lyrics_max contains 'MUSIC_COVER_LYRICS_MAX = 1000' src/tools.ts
check music_cover_preprocess_exclusive contains 'audio_url and audio_base64 are mutually exclusive' src/tools.ts
check music_cover_preprocess_exclusive_test contains 'rejects preprocess with both audio sources before fetch' test/unit/tools.test.ts
check music_cover_preprocess_top_level contains 'data.data ?? data' src/tools.ts
check music_cover_preprocess_top_level_test contains 'parses top-level preprocess response' test/unit/tools.test.ts
check understand_image_gif_doc contains 'Supported formats**: JPEG, PNG, GIF, WebP' /data/data/com.termux/files/home/.pi/research/pages/platform.minimax.io.docs.token-plan.mcp-guide.md.2026-05-30
check analyze_image_gif_mime contains 'image/gif' src/tools.ts
check analyze_image_gif_data_url contains 'data:image\/(jpeg|png|webp|gif)' src/tools.ts
check analyze_image_gif_test contains 'accepts gif images for analysis' test/unit/tools.test.ts
check analyze_image_schema_mentions_gif contains 'JPG, PNG, GIF, or WebP' src/tools.ts
check analyze_image_error_mentions_gif contains 'JPG, PNG, GIF, or WebP' src/agent.ts
check web_search_nested_results_parser contains 'data.data?.results' src/tools.ts
check web_search_empty_organic_fallback contains 'data.organic?.length ? data.organic' src/tools.ts
check web_search_empty_organic_fallback_test contains 'falls back to nested results when organic is empty' test/unit/tools.test.ts
check web_search_url_result_test contains 'parses nested data results with url field' test/unit/tools.test.ts
check skill_async_tts_text_limit contains 'text input max **50,000 characters**' .pi/skills/minimax/SKILL.md
check skill_async_tts_file_limit contains '`text_file_id` input max **1,000,000 characters**' .pi/skills/minimax/SKILL.md
check skill_async_tts_audio_sample_rate contains 'Async `audio_setting.audio_sample_rate`' .pi/skills/minimax/SKILL.md
check skill_async_tts_english_normalization contains 'voice_setting.english_normalization' .pi/skills/minimax/SKILL.md
check skill_async_tts_extra_interjections contains 'Async extra interjection tags: `(whistles)`, `(crying)`, `(applause)`' .pi/skills/minimax/SKILL.md
check skill_lyrics_helper_tags contains '[Pre-Chorus]' .pi/skills/minimax/SKILL.md
check skill_lyrics_helper_drop_tag contains '[Drop]' .pi/skills/minimax/SKILL.md
check skill_lyrics_helper_instrumental_tag contains '[Instrumental]' .pi/skills/minimax/SKILL.md
check skill_get_voice_requires_voice_type contains 'Get voice requires `voice_type`' .pi/skills/minimax/SKILL.md
check skill_get_voice_all_type contains '`all|system|voice_cloning|voice_generation`' .pi/skills/minimax/SKILL.md
check skill_video_agent_diving_template contains '392747428568649728` Diving' .pi/skills/minimax/SKILL.md
check skill_video_agent_run_template contains '393769180141805569` Run for Life' .pi/skills/minimax/SKILL.md
check bounded_text_validator contains 'boundedText(' src/tools.ts
check bounded_text_test contains 'rejects over-limit MiniMax text before fetch' test/unit/tools.test.ts
check music_cover_bounds_test contains 'rejects invalid music cover text before fetch' test/unit/tools.test.ts
check node_agent_tools_unit node_test

elapsed_ms=$(( $(date +%s%3N) - start_ms ))
printf 'METRIC contract_failures=%s\n' "$failures"
printf 'METRIC scanner_ms=%s\n' "$elapsed_ms"

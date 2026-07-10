# HallucyGenie

[![CI](https://github.com/bugabinga/hallucygenie/actions/workflows/ci.yml/badge.svg)](https://github.com/bugabinga/hallucygenie/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Dark little genie,
> chat, image, voice, and song,
> for one gamer kid.
>
>> ~~ The Machine

HallucyGenie is a kid-friendly MiniMax web UI for chat, images, reference-image
pictures, voice, long narration, music, cover songs, lyrics, video, image
analysis, web search, and local generated assets.

## Run locally

```sh
cp .env.example .env
$EDITOR .env # set MINIMAX_API_KEY
mise run setup
mise run dev
```

Open <http://localhost:3000>.

## Run release image

```sh
podman pull ghcr.io/bugabinga/hallucygenie:v1.0.2
podman run --rm \
  --name hallucygenie \
  -p 127.0.0.1:3000:3000 \
  -e MINIMAX_API_KEY="$MINIMAX_API_KEY" \
  -v "$PWD/data:/app/data" \
  --health-cmd 'node --eval "fetch(\"http://127.0.0.1:3000/api/health\").then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  --health-interval 30s --health-timeout 3s --health-start-period 5s --health-retries 3 \
  ghcr.io/bugabinga/hallucygenie:v1.0.2
```

Then open <http://localhost:3000>.

## Env

• `MINIMAX_API_KEY`: required. Consumes real MiniMax quota.
• `PORT`: optional. Defaults to `3000`.
• `COVER_EXTRACTOR_URL`: optional sidecar for YouTube cover-song preprocessing.

## Data and backups

• SQLite DB, generated assets, and pending video/long-narration tasks live under `data/`.
• Back up `data/` before upgrading.
• Bind-mounted `data/` must be writable by container user `node` (UID 1000).
• Raw generated media stays in asset storage, not prompts or chat context.
• No built-in auth. Run on localhost or a trusted network only.

## Release

```sh
RELEASE_TAG=v1.0.2 mise run release --check ghcr.io/bugabinga/hallucygenie:v1.0.2
mise run release v1.0.2
```

`mise run release` opens the release image in Chrome, asks for manual approval, tags, and pushes. Tag push publishes GHCR tags via `.github/workflows/release.yml`.

## Commands

• `mise run setup` — install JS deps and Playwright browsers.
• `mise run check` — format/lint/typecheck/build-check/unit/integration.
• `mise run test` — default E2E; `--matrix`, `--mutation`, `--minimax` opt in.
• `mise run image` — build image; `--smoke` tests; `--push` publishes.
• `mise run release --check IMAGE` — release proof without tagging.
• `mise run release vX.Y.Z` — verify, open Chrome, ask manual approval, tag, push.

Made with love, hand-vibing AI, and bugabinga.

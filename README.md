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
just install
just dev
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
  --health-cmd 'bun --eval "fetch(\"http://127.0.0.1:3000/api/health\").then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
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
• Bind-mounted `data/` must be writable by container user `bun` (UID 1000).
• Raw generated media stays in asset storage, not prompts or chat context.
• No built-in auth. Run on localhost or a trusted network only.

## Release

```sh
RELEASE_TAG=v1.0.2 just release-check ghcr.io/bugabinga/hallucygenie:v1.0.2
just release v1.0.2
```

`just release` opens the release image in Chrome, asks for manual approval, tags, and pushes. Tag push publishes GHCR tags via `.github/workflows/release.yml`.

## Commands

• `just ready` — lint, typecheck, build-check, unit, integration, E2E.
• `just release-check` — `ready`, metadata validation, container build, smoke test.
• `just release vX.Y.Z` — verify, open Chrome, ask manual approval, tag, push.
• `just container` — local production image.
• `just minimax-test` — real MiniMax smoke test; consumes quota.

Made with love, hand-vibing AI, and bugabinga.

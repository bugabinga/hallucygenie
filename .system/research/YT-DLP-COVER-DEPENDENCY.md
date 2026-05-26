# YouTube cover dependency research

Spec: HG-SPEC-013.
Date: 2026-05-26.

## Decision shape

Private app. YouTube URLs accepted for cover source.
Kid UI must not expose permission/legal gates.
Two-step MiniMax flow desired:

1. Preprocess source audio with `/v1/music_cover_preprocess`.
2. Generate cover with `/v1/music_generation` using `cover_feature_id`, edited/extracted lyrics, and style prompt.

## yt-dlp facts

Official sources checked:

- `yt-dlp/yt-dlp` install wiki.
- `yt-dlp` PyPI page.
- `yt-dlp` README.

Findings:

- yt-dlp is the maintained successor/fork path for youtube-dl.
- Official install modes: release binaries, PyPI package, third-party package managers.
- Official release binaries support self-update with `yt-dlp -U`.
- Official update channels: stable, nightly, master.
- README says stable can be stale due site breakage; nightly is recommended for regular users.
- Python requirement: 3.10+.
- `ffmpeg` and `ffprobe` are strongly recommended for merging/post-processing.
- Full YouTube support may need `yt-dlp-ejs` plus a JS runtime; Bun is listed as supported runtime priority after deno/node/quickjs.
- Official project does not advertise an official Docker image in checked docs.

## Alternatives

### pytubefix

- Python library + CLI.
- Dependency-free and YouTube-specific.
- Smaller surface than yt-dlp.
- Less broad than yt-dlp; no evidence it is as robust across site breakage.

### youtubei.js / YouTube.js

- Maintained Node library for YouTube internal API.
- Good for metadata/player API access.
- Lower-level than yt-dlp for robust download/extraction pipeline.
- Would require us to own more extraction/format logic.

### ytdl-core and forks

- Node ecosystem has forks.
- Original `ytdl-core` history is not the safest maintenance bet.
- Fork selection creates more maintenance than yt-dlp.

### ffmpeg only

- Not enough for YouTube watch URLs.
- Useful after yt-dlp: convert/crop/normalize temp audio.
- Useful for direct media URLs if already resolvable.

## Recommended dependency strategy

Use yt-dlp as an external CLI plus ffmpeg.
Do not embed as a library.
Do not use distro apt package as primary path; often stale.
Do not auto-update silently at app runtime.

Install/update approach:

- Local dev/private app: `just cover-tools-update` downloads yt-dlp nightly release binary into `data/bin/yt-dlp` or `.cache/hallucygenie/bin/yt-dlp`, verifies checksum when available, marks executable.
- Container: install yt-dlp nightly/PyPI prerelease and ffmpeg at image build; rebuild image on demand or scheduled weekly.
- Runtime: app checks `yt-dlp --version` and `ffmpeg -version`; fail loud with a kid-friendly UI error plus admin command.

Why:

- yt-dlp breaks when YouTube changes; update cadence matters more than classic semver stability.
- Nightly is explicitly recommended upstream for regular users.
- External CLI isolates GPL/third-party/binary complexity from app code.
- A `just` update recipe is visible and low-maintenance for a private app.

## Cover flow implications

Direct public audio URL:

- Can be sent to MiniMax as `audio_url`.
- Must be provider-fetchable; some public URLs fail provider download.

YouTube URL:

- Cannot be sent directly as MiniMax `audio_url`; it is a web page, not a direct audio file.
- Use yt-dlp to produce temp audio under `data/tmp/cover/`.
- Use ffmpeg/ffprobe to cap duration, format, and size.
- Send to MiniMax preprocess as `audio_base64` unless a public temporary URL is available.
- Delete temp source files after success/failure.

Raw source audio must never enter chat history, prompts, logs, or agent context.

## Maintained container candidates

No official `yt-dlp/yt-dlp` container image found in checked upstream docs.

Community candidates:

### `ghcr.io/jauderho/yt-dlp`

- GHCR package active; observed latest tag `2026.03.17`, published 1 day before check.
- Multi-arch package page showed linux/arm64 plus another platform entry.
- Dockerfile downloads official yt-dlp release binary, verifies SHA2-256SUMS, includes ffmpeg, python3, deno, dumb-init, selected Python deps.
- Repo license: BSD-3-Clause.
- More usage/download signals than jim60105 at check time.

### `ghcr.io/jim60105/yt-dlp`

- GHCR package active; `latest` published 1 day before check.
- Repo focused only on yt-dlp container.
- Variants: alpine/default, ubi, distroless, pot.
- POT variant includes bgutil POT provider for YouTube bot checks.
- Default Dockerfile removes shell/basic commands after build, runs non-root, includes static ffmpeg/ffprobe.
- License: GPLv3 for Dockerfiles/workflows; using privately is simpler than redistributing derivative images.

## Container recommendation

Use sidecar pattern, not bundled binary.

Preferred path:

1. Define extractor HTTP contract owned by HallucyGenie.
2. Start with a tiny wrapper service image we own.
3. Wrapper image uses either `ghcr.io/jauderho/yt-dlp` or `ghcr.io/jim60105/yt-dlp:pot` as implementation detail, or installs yt-dlp during image build.
4. Pin image digest in compose/production.
5. Update manually via `just cover-extractor-update` or scheduled container rebuild.

Avoid coupling app to a third-party image CLI directly. A wrapper lets app stay stable if image args/tags change.

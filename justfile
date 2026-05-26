# HallucyGenie — one gate: `just ready`

set dotenv-load
set unstable

# format, build-check, typecheck, unit, integration, e2e
[group('check')]
ready: fmt-check typecheck build-check unit integration e2e

# format and rebuild tracked generated frontend
[group('check')]
fix:
    just -f ./justfile --fmt
    bunx prettier --write .
    just build

# check formatting without modifying files
[group('check')]
fmt-check:
    just -f ./justfile --fmt --check
    bunx prettier --check .

# type check (tsc --noEmit)
[group('check')]
typecheck:
    bunx tsc --noEmit

# bundle tracked frontend
[group('dev')]
build:
    bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext

# fail if tracked frontend bundle is stale
[group('check')]
build-check:
    tmp="$(mktemp)"; \
    trap 'rm -f "$tmp"' EXIT; \
    bunx esbuild public/app.ts --outfile="$tmp" --bundle --format=esm --target=esnext; \
    cmp -s "$tmp" public/app.js || { echo "public/app.js is stale; run: just fix"; exit 1; }

# all unit tests; add new tests under test/unit/
[group('test')]
unit:
    bun test test/unit

# all integration tests; add new tests under test/integration/
[group('test')]
integration:
    bun test test/integration

# browser E2E against mocked MiniMax
[group('test')]
e2e: build-check
    bun e2e/run-e2e.ts

# mutation tests
[group('test')]
mutation: build-check
    status=0; \
    bunx stryker run test/stryker.config.mjs & agent=$!; \
    bunx stryker run test/stryker-tools.mjs & tools=$!; \
    bunx stryker run test/stryker-db.mjs & db=$!; \
    wait "$agent" || status=$?; \
    wait "$tools" || status=$?; \
    wait "$db" || status=$?; \
    exit "$status"

# install dependencies
[group('setup')]
install:
    bun install

# download newest Google font files, convert to woff2, update manifest checksums
[group('setup')]
fonts-update commit="8fee968603b86ac85d4fbf0f3ffbde3fed1d84e1":
    bun scripts/update-fonts.ts {{ commit }}
    bunx prettier --write public/fonts/fonts.manifest.json public/style.css

# start dev server (port 3000)
[group('dev')]
dev: build
    bun src/server.ts

# stop old server, reset local DB/assets, then start dev server
[group('dev')]
fresh: kill reset dev

# stop HallucyGenie dev server on port 3000 (safe: only kills bun src/server.ts)
[group('dev')]
kill:
    @pids="$(lsof -ti tcp:3000 2>/dev/null || true)"; \
    if [ -z "$pids" ]; then echo "No process listening on port 3000"; exit 0; fi; \
    killed=0; \
    for pid in $pids; do \
      cmd="$(ps -o args= -p "$pid" 2>/dev/null || true)"; \
      case "$cmd" in \
        *"bun src/server.ts"*) echo "Killing HallucyGenie server PID $pid"; kill "$pid"; killed=1 ;; \
        *) echo "Refusing to kill PID $pid on port 3000: $cmd" ;; \
      esac; \
    done; \
    if [ "$killed" -eq 0 ]; then exit 1; fi

# open app in Chrome with remote debugging
[group('dev')]
chrome:
    mkdir -p ${HOME}/.cache/hallucygenie/chrome-profile
    google-chrome-stable \
      --remote-debugging-port=9222 \
      --remote-allow-origins=* \
      --user-data-dir=${HOME}/.cache/hallucygenie/chrome-profile \
      --no-first-run \
      --no-default-browser-check \
      --disable-search-engine-choice-screen \
      --disable-features=Translate,SigninIntercept,SyncPromoAfterSigninIntercept \
      http://localhost:3000 &>/dev/null &

# build production container image locally
[group('deploy')]
container image="hallucygenie:local":
    docker build -f deploy/Dockerfile -t "{{ image }}" .

# build and push production container image
[group('deploy')]
publish-container image:
    case "{{ image }}" in ghcr.io/bugabinga/hallucygenie:*) ;; *) echo "image must be ghcr.io/bugabinga/hallucygenie:<tag>"; exit 1 ;; esac
    docker buildx build -f deploy/Dockerfile -t "{{ image }}" --push .

# test MiniMax API endpoints + check quota (real API; consumes TTS/image/music quota)
[group('pi')]
minimax-test:
    bun scripts/minimax-test.ts

# rm generated files and caches
[group('util')]
clean:
    rm -rf dist coverage reports .stryker-tmp node_modules/.cache test-data* public/app.js

# reset local SQLite DB + generated assets
[group('util')]
reset:
    rm -rf data

# full local reset (keeps .env)
[group('util')]
nuke: clean reset
    rm -rf node_modules logs

# HallucyGenie — `just --list` to see all recipes

set dotenv-load
set unstable

SRC := "src/server.ts src/agent.ts src/tools.ts src/db.ts src/log.ts public/app.ts public/markdown.ts"
BACKEND_TESTS := "test/server.test.ts test/agent.test.ts test/tools.test.ts test/db.test.ts"
FRONTEND_TESTS := "test/app.test.ts test/static.test.ts test/e2e-mock.test.ts test/minimax-test-script.test.ts"
ACT_IMAGE := "localhost/hallucygenie-act:local"
ACT_FLAGS := "-W .github/workflows/ci.yml -P ubuntu-latest=" + ACT_IMAGE + " --container-architecture linux/amd64 --pull=false --action-offline-mode --artifact-server-path .artifacts --cache-server-path .act-cache"

# install dependencies
[group('setup')]
install:
    bun install

# download newest Google font files, convert to woff2, update manifest checksums
[group('setup')]
fonts-update commit="main":
    bun scripts/update-fonts.ts {{ commit }}

# bundle frontend
[group('dev')]
build:
    bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext

# start dev server (port 3000)
[group('dev')]
dev: build
    bun src/server.ts

# stop old server, reset local DB/assets, then start dev server
[group('dev')]
fresh-dev: kill reset-db dev

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
dev-chrome:
    mkdir -p .system/chrome-profile
    google-chrome-stable \
      --remote-debugging-port=9222 \
      --remote-allow-origins=* \
      --user-data-dir={{ justfile_directory() }}/.system/chrome-profile \
      --no-first-run \
      --no-default-browser-check \
      --disable-search-engine-choice-screen \
      --disable-features=Translate,SigninIntercept,SyncPromoAfterSigninIntercept \
      http://localhost:3000 &>/dev/null &

# format code (just + prettier)
[group('check')]
fmt:
    just -f ./justfile --fmt
    bunx prettier --write .

# check formatting without modifying files
[group('check')]
fmt-check:
    just -f ./justfile --fmt --check
    bunx prettier --check .

# type check (tsc --noEmit)
[group('check')]
lint:
    bunx tsc --noEmit

# fmt + lint pre-flight
[group('check')]
check: fmt lint

# CI check: no file mutation
[group('check')]
ci-check: fmt-check lint

# pre-commit hook: no file mutation
[group('check')]
hook-pre-commit: fmt-check lint

# pre-push hook
[group('test')]
hook-pre-push: test-unit

# backend unit tests
[group('test')]
test:
    bun test {{ BACKEND_TESTS }}

# all unit tests
[group('test')]
test-unit:
    status=0; \
    bun test {{ BACKEND_TESTS }} & backend=$!; \
    bun test {{ FRONTEND_TESTS }} & frontend=$!; \
    wait "$backend" || status=$?; \
    wait "$frontend" || status=$?; \
    exit "$status"

# integration (real server + in-memory DB)
[group('test')]
test-integration:
    bun test test/integration.test.ts

# mutation: agent only
[group('test')]
test-mutation-agent:
    bunx stryker run test/stryker.config.mjs

# mutation: tools only
[group('test')]
test-mutation-tools:
    bunx stryker run test/stryker-tools.mjs

# mutation: db only
[group('test')]
test-mutation-db:
    bunx stryker run test/stryker-db.mjs

# mutation: agent + tools + db, parallel
[group('test')]
test-mutation: build
    status=0; \
    just test-mutation-agent & agent=$!; \
    just test-mutation-tools & tools=$!; \
    just test-mutation-db & db=$!; \
    wait "$agent" || status=$?; \
    wait "$tools" || status=$?; \
    wait "$db" || status=$?; \
    exit "$status"

# coverage (backend + frontend, parallel)
[group('test')]
test-coverage:
    status=0; \
    bun test --coverage {{ BACKEND_TESTS }} & backend=$!; \
    bun test --coverage {{ FRONTEND_TESTS }} & frontend=$!; \
    wait "$backend" || status=$?; \
    wait "$frontend" || status=$?; \
    exit "$status"

# check + unit + integration
[group('test')]
test-all: check build
    status=0; \
    bun test {{ BACKEND_TESTS }} & backend=$!; \
    bun test {{ FRONTEND_TESTS }} & frontend=$!; \
    wait "$backend" || status=$?; \
    wait "$frontend" || status=$?; \
    if [ "$status" -ne 0 ]; then exit "$status"; fi; \
    bun test test/integration.test.ts

# CI: check + unit + integration without formatting writes
[group('test')]
ci-test-all: ci-check build
    status=0; \
    bun test {{ BACKEND_TESTS }} & backend=$!; \
    bun test {{ FRONTEND_TESTS }} & frontend=$!; \
    wait "$backend" || status=$?; \
    wait "$frontend" || status=$?; \
    if [ "$status" -ne 0 ]; then exit "$status"; fi; \
    bun test test/integration.test.ts

# build local act runner image with stable apt sources
[group('test')]
ci-act-image:
    docker build -f deploy/act/Dockerfile -t {{ ACT_IMAGE }} deploy/act

# run all CI jobs locally with cached act actions/images/artifacts
[group('test')]
ci-act: ci-act-image
    act {{ ACT_FLAGS }}

# run CI test job locally with cached act actions/images/artifacts
[group('test')]
ci-act-test: ci-act-image
    act {{ ACT_FLAGS }} -j test

# run CI mutation job locally with cached act actions/images/artifacts
[group('test')]
ci-act-mutation: ci-act-image
    act {{ ACT_FLAGS }} -j mutation

# build container locally, then run CI container job under act (workflow skips nested BuildKit)
[group('test')]
ci-act-container: ci-act-image container-build
    act {{ ACT_FLAGS }} -j container

# run update-check workflow locally with cached act actions/images/artifacts
[group('test')]
ci-act-updates: ci-act-image
    act workflow_dispatch {{ ACT_FLAGS }} -W .github/workflows/updates.yml

# run CI after merging into main/master locally
[group('test')]
hook-post-merge:
    branch="$(git branch --show-current)"; \
    if [ "$branch" != "master" ] && [ "$branch" != "main" ]; then exit 0; fi; \
    just ci-act

# build production container image locally
[group('deploy')]
container-build:
    docker build -f deploy/Dockerfile -t hallucygenie:local .

# check dependency updates
[group('check')]
update-check:
    bun outdated --latest

# playwright E2E (real server + mocked MiniMax via nock)
[group('test')]
test-e2e: build
    PLAYWRIGHT_ALLOW_ANDROID=1 bun e2e/run-e2e.ts

alias t := test-unit
alias ti := test-integration
alias ta := test-all
alias e2e := test-e2e
alias verify := test-all

HOME_DIR := env("HOME")

# test MiniMax API endpoints + check quota (real API; consumes TTS/image/music quota)
[group('pi')]
minimax-test:
    bun scripts/minimax-test.ts

# research MiniMax APIs: update skill + report code changes
[group('pi')]
minimax-research:
    pi --skill {{ HOME_DIR }}/.pi/agent/skills/minimax --skill {{ HOME_DIR }}/.pi/agent/skills/research --tools read,bash,edit,write,grep,find,ls -p "You are researching MiniMax API capabilities for HallucyGenie. Check the current skill at {{ HOME_DIR }}/.pi/agent/skills/minimax/SKILL.md and the project docs at AGENTS.md. Use the research skill to crawl MiniMax docs. Research any new models, endpoints, or changes. Update the skill file if you find improvements. Report any code changes needed in the project (src/tools.ts, src/db.ts, src/agent.ts, src/server.ts, etc.). If no changes needed, say so."

# rm generated files and caches
[group('util')]
clean:
    rm -rf dist coverage reports .stryker-tmp node_modules/.cache test-data* public/app.js

# reset local SQLite DB + generated assets
[group('util')]
reset-db:
    rm -rf data

# full local reset (keeps .env)
[group('util')]
nuke: clean
    rm -rf node_modules data logs

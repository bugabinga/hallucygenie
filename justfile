# HallucyGenie — one gate: `just ready`

set dotenv-load
set unstable

# lint, build-check, typecheck, unit, integration, e2e
[group('check')]
ready: lint typecheck build-check unit integration e2e

# format files
[group('check')]
fmt:
    just -f ./justfile --fmt
    bunx dprint fmt
    sqruff fix migrations/*.sql test/fixtures/db/v1.0.0/schema.sql

# format and apply safe lint autofixes
[group('check')]
fix: fmt
    bunx biome lint --write .

# check formatting, lint, and deploy metadata
[group('check')]
lint:
    just -f ./justfile --fmt --check
    bunx dprint check
    bunx biome lint .
    sqruff lint migrations/*.sql test/fixtures/db/v1.0.0/schema.sql
    tmp="$(mktemp -d)"; \
    trap 'rm -rf "$tmp"' EXIT; \
    mkdir -p "$tmp/config/containers/systemd" "$tmp/out" "$tmp/early" "$tmp/late"; \
    cp deploy/hallucygenie.container "$tmp/config/containers/systemd/hallucygenie.container"; \
    XDG_CONFIG_HOME="$tmp/config" /usr/lib/systemd/user-generators/podman-user-generator "$tmp/out" "$tmp/early" "$tmp/late" >/dev/null; \
    systemd-analyze --user verify "$tmp/out/hallucygenie.service"

# type check (tsc --noEmit)
[group('check')]
typecheck:
    bunx tsc --noEmit

# bundle ignored frontend
[group('dev')]
build:
    bunx esbuild public/app.ts --outfile=public/app.js --bundle --format=esm --target=esnext

# verify frontend bundle builds without writing generated output
[group('check')]
build-check:
    tmp="$(mktemp)"; \
    trap 'rm -f "$tmp"' EXIT; \
    bunx esbuild public/app.ts --outfile="$tmp" --bundle --format=esm --target=esnext

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
e2e: build
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
    just fmt

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
    set -e; \
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    version="${RELEASE_TAG:-$package_tag}"; \
    podman build -f deploy/Containerfile --build-arg VERSION="$version" -t "{{ image }}" .

# smoke-test production container image locally
[group('deploy')]
container-smoke image="hallucygenie:local":
    set -e; \
    name="hallucygenie-smoke-$RANDOM"; \
    volume="$name-data"; \
    podman volume create "$volume" >/dev/null; \
    cleanup() { podman rm -f "$name" >/dev/null 2>&1 || true; podman volume rm "$volume" >/dev/null 2>&1 || true; }; \
    trap cleanup EXIT; \
    podman run -d --name "$name" -p 127.0.0.1:3099:3000 -e MINIMAX_API_KEY=release-smoke -v "$volume:/app/data" \
      --health-cmd "bun --eval \"const port=process.env.PORT||'3000';fetch('http://127.0.0.1:'+port+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
      --health-interval 30s --health-timeout 3s --health-start-period 5s --health-retries 3 \
      "{{ image }}" >/dev/null; \
    ok=0; \
    for _ in $(seq 1 30); do if curl -fsS http://127.0.0.1:3099/api/health >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done; \
    test "$ok" = "1"; \
    podman healthcheck run "$name" >/dev/null; \
    podman inspect "$name" | bun -e 'const container = JSON.parse(await new Response(Bun.stdin.stream()).text())[0]; if (container.State.Health.Status !== "healthy") throw new Error("container not healthy");'; \
    curl -fsS http://127.0.0.1:3099/ >/dev/null; \
    curl -fsS http://127.0.0.1:3099/fonts/pixelify-sans/PixelifySans.woff2 >/dev/null

# full release gate: checks, metadata validation, container build, container smoke
[group('deploy')]
release-check image="hallucygenie:local": ready
    set -e; \
    image="{{ image }}"; \
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    release_tag="${RELEASE_TAG:-$package_tag}"; \
    image_tag="${image##*:}"; \
    case "$image" in ghcr.io/bugabinga/hallucygenie:*) if [ "$image_tag" != "$release_tag" ]; then echo "image tag $image_tag != RELEASE_TAG $release_tag"; exit 1; fi ;; esac; \
    RELEASE_TAG="$release_tag" bun scripts/release-check.ts; \
    RELEASE_TAG="$release_tag" just container "$image"; \
    podman inspect "$image" | RELEASE_TAG="$release_tag" bun -e 'const image = JSON.parse(await new Response(Bun.stdin.stream()).text())[0]; const got = image.Config.Labels["org.opencontainers.image.version"]; if (got !== process.env.RELEASE_TAG) throw new Error(`image version label ${got} != ${process.env.RELEASE_TAG}`);'; \
    just container-smoke "$image"

# cut release tag after local proof and interactive browser confirmation
[group('deploy')]
release tag:
    set -e; \
    tag="{{ tag }}"; \
    case "$tag" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "tag must be vX.Y.Z"; exit 1 ;; esac; \
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    if [ "$tag" != "$package_tag" ]; then echo "tag $tag != package $package_tag"; exit 1; fi; \
    image="ghcr.io/bugabinga/hallucygenie:$tag"; \
    RELEASE_TAG="$tag" just release-check "$image"; \
    if [ -n "$(git status --porcelain=v1 --untracked-files=all)" ]; then git status --short; echo "dirty worktree"; exit 1; fi; \
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then echo "tag $tag already exists"; exit 1; fi; \
    if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then echo "remote tag $tag already exists"; exit 1; fi; \
    if [ -z "${MINIMAX_API_KEY:-}" ]; then echo "MINIMAX_API_KEY required for manual release browser"; exit 1; fi; \
    command -v google-chrome-stable >/dev/null || { echo "google-chrome-stable missing"; exit 1; }; \
    name="hallucygenie-release-${tag#v}-$RANDOM"; \
    volume="$name-data"; \
    profile="$(mktemp -d)"; \
    cleanup() { podman rm -f "$name" >/dev/null 2>&1 || true; podman volume rm "$volume" >/dev/null 2>&1 || true; rm -rf "$profile"; }; \
    trap cleanup EXIT; \
    podman volume create "$volume" >/dev/null; \
    podman run -d --name "$name" -p 127.0.0.1:3100:3000 -e MINIMAX_API_KEY -v "$volume:/app/data" \
      --health-cmd "bun --eval \"const port=process.env.PORT||'3000';fetch('http://127.0.0.1:'+port+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"" \
      --health-interval 30s --health-timeout 3s --health-start-period 5s --health-retries 3 \
      "$image" >/dev/null; \
    ok=0; \
    for _ in $(seq 1 30); do if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then ok=1; break; fi; sleep 1; done; \
    test "$ok" = "1"; \
    echo "Manual test: http://127.0.0.1:3100"; \
    echo "Close Chrome window or press Ctrl+C here when done."; \
    google-chrome-stable --user-data-dir="$profile" --no-first-run --no-default-browser-check --disable-search-engine-choice-screen --app=http://127.0.0.1:3100 >/dev/null 2>&1 & \
    browser="$!"; \
    trap 'echo; kill "$browser" >/dev/null 2>&1 || true' INT; \
    wait "$browser" || true; \
    trap - INT; \
    printf "Manual test OK? [y/N] "; \
    read answer; \
    case "$answer" in y|Y|yes|YES) ;; *) echo "release aborted"; exit 1 ;; esac; \
    git tag "$tag"; \
    git push origin "$tag"

# build and push production container image
[group('deploy')]
publish-container image:
    set -e; \
    image="{{ image }}"; \
    case "$image" in ghcr.io/bugabinga/hallucygenie:v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "image must be ghcr.io/bugabinga/hallucygenie:vX.Y.Z"; exit 1 ;; esac; \
    release_tag="${image##*:}"; \
    RELEASE_TAG="$release_tag" bun scripts/release-check.ts; \
    podman build -f deploy/Containerfile --build-arg VERSION="$release_tag" -t "$image" --push .

# test MiniMax API endpoints + check quota (real API; consumes TTS/image/music quota)
[group('pi')]
minimax-test:
    bun scripts/minimax-test.ts

# rm generated files, logs, and caches
[group('util')]
clean:
    rm -rf dist coverage reports .stryker-tmp node_modules/.cache test-data* tmp logs public/app.js
    find test -type d -name 'test-data*' -prune -exec rm -rf {} +

# reset local SQLite DB + generated assets
[group('util')]
reset:
    rm -rf data *.db *.db-shm *.db-wal

# full local reset (keeps .env)
[group('util')]
nuke: clean reset
    rm -rf node_modules

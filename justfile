# HallucyGenie — one gate: `just ready`

set dotenv-load
set unstable

# format, build-check, typecheck, unit, integration, e2e
[group('check')]
ready: fmt-check typecheck build-check unit integration e2e

# format and rebuild ignored generated frontend
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
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    version="${RELEASE_TAG:-$package_tag}"; \
    docker build -f deploy/Dockerfile --build-arg VERSION="$version" -t "{{ image }}" .

# smoke-test production container image locally
[group('deploy')]
container-smoke image="hallucygenie:local":
    name="hallucygenie-smoke-$RANDOM"; \
    volume="$name-data"; \
    docker volume create "$volume" >/dev/null; \
    cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true; }; \
    trap cleanup EXIT; \
    docker run -d --name "$name" -p 127.0.0.1:3099:3000 -e MINIMAX_API_KEY=release-smoke -v "$volume:/app/data" "{{ image }}" >/dev/null; \
    ok=0; \
    for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3099/api/health >/dev/null && ok=1 && break; sleep 1; done; \
    test "$ok" = "1"; \
    curl -fsS http://127.0.0.1:3099/ >/dev/null; \
    curl -fsSI http://127.0.0.1:3099/fonts/pixelify-sans/PixelifySans.woff2 >/dev/null

# full release gate: checks, metadata validation, container build, container smoke
[group('deploy')]
release-check image="hallucygenie:local": ready
    image="{{ image }}"; \
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    release_tag="${RELEASE_TAG:-$package_tag}"; \
    image_tag="${image##*:}"; \
    case "$image" in ghcr.io/bugabinga/hallucygenie:*) if [ "$image_tag" != "$release_tag" ]; then echo "image tag $image_tag != RELEASE_TAG $release_tag"; exit 1; fi ;; esac; \
    RELEASE_TAG="$release_tag" bun scripts/release-check.ts; \
    RELEASE_TAG="$release_tag" just container "$image"; \
    docker inspect "$image" | RELEASE_TAG="$release_tag" bun -e 'const image = JSON.parse(await new Response(Bun.stdin.stream()).text())[0]; const got = image.Config.Labels["org.opencontainers.image.version"]; if (got !== process.env.RELEASE_TAG) throw new Error(`image version label ${got} != ${process.env.RELEASE_TAG}`);'; \
    just container-smoke "$image"

# cut release tag after local proof and manual Chrome confirmation
[group('deploy')]
release tag:
    tag="{{ tag }}"; \
    case "$tag" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "tag must be vX.Y.Z"; exit 1 ;; esac; \
    package_tag="v$(bun -e 'console.log(JSON.parse(await Bun.file("package.json").text()).version)')"; \
    if [ "$tag" != "$package_tag" ]; then echo "tag $tag != package $package_tag"; exit 1; fi; \
    image="ghcr.io/bugabinga/hallucygenie:$tag"; \
    RELEASE_TAG="$tag" just release-check "$image"; \
    if [ -n "$(git status --short)" ]; then git status --short; echo "dirty worktree"; exit 1; fi; \
    if [ "${MANUAL_CHROME_OK:-}" != "$tag" ]; then echo "manually test $image in Chrome, then run: MANUAL_CHROME_OK=$tag just release $tag"; exit 1; fi; \
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then echo "tag $tag already exists"; exit 1; fi; \
    git tag "$tag"; \
    git push origin "$tag"

# build and push production container image
[group('deploy')]
publish-container image:
    image="{{ image }}"; \
    case "$image" in ghcr.io/bugabinga/hallucygenie:v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "image must be ghcr.io/bugabinga/hallucygenie:vX.Y.Z"; exit 1 ;; esac; \
    release_tag="${image##*:}"; \
    RELEASE_TAG="$release_tag" bun scripts/release-check.ts; \
    docker buildx build -f deploy/Dockerfile --build-arg VERSION="$release_tag" -t "$image" --push .

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

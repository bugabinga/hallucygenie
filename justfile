# HallucyGenie — `just --list` to see all recipes

set dotenv-load := true
set unstable := true

# npm install
[group('setup')]
install:
    npm install

# start dev server (port 3000)
[group('dev')]
dev:
    node --experimental-strip-types --no-warnings server.ts

# format code (just + prettier)
[group('check')]
fmt:
    just -f ./justfile --fmt
    npx prettier --write .

# type check (tsc --noEmit)
[group('check')]
lint:
    npx tsc --noEmit

# fmt + lint pre-flight
[group('check')]
check: fmt lint

# quick unit (backend only)
[group('test')]
test: fmt lint
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts

# unit + frontend in parallel
[group('test')]
test-unit: fmt lint
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts &
    node --experimental-strip-types --no-warnings --test --test-name-pattern "." public/app.test.ts &
    wait

# integration (real server + in-memory DB)
[group('test')]
test-integration: fmt lint
    node --experimental-strip-types --no-warnings --test integration.test.ts

# mutation (tools + db, parallel)
[group('test')]
test-mutation: fmt lint
    npx stryker run stryker.config.mjs &
    npx stryker run stryker-tools.mjs &
    npx stryker run stryker-db.mjs &
    wait

# coverage (backend + frontend, parallel)
[group('test')]
test-coverage: fmt lint
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test server.test.ts agent.test.ts tools.test.ts db.test.ts &
    node --experimental-strip-types --no-warnings --experimental-test-coverage --test --test-name-pattern "." public/app.test.ts &
    wait

# check + unit + integration
[group('test')]
test-all: check
    node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts &
    node --experimental-strip-types --no-warnings --test --test-name-pattern "." public/app.test.ts &
    wait
    node --experimental-strip-types --no-warnings --test integration.test.ts

# playwright E2E
[group('test')]
test-e2e:
    npx esbuild public/app.ts --outfile=public/app.js --format=esm --target=esnext
    PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/static-server.ts public & sleep 1
    BASE_URL=http://localhost:3001 PLAYWRIGHT_ALLOW_ANDROID=1 node --experimental-strip-types --no-warnings e2e/run-e2e.ts; \
    kill %1 2>/dev/null; true

alias t := test-unit
alias ti := test-integration
alias ta := test-all
alias e2e := test-e2e

# update pi globally
[group('pi')]
pi-update:
    npm update -g @mariozechner/pi-coding-agent
    pi update

# find slop and fix it
[group('pi')]
desloppy:
    pi --skill /data/data/com.termux/files/home/.pi/agent/skills/jq --tools read,bash,edit,write,grep,find,ls -p "find ugliest slop in code. fix it good. no mercy."

# tiger style enforcement
[group('pi')]
tiger:
    pi --skill /data/data/com.termux/files/home/.pi/skills/tiger -p "scan code. enforce tiger style. no mercy."

# roast — adversarial critique. Usage: just roast "your prompt"
[group('pi')]
roast prompt:
    pi --skill /data/data/com.termux/files/home/.pi/agent/skills/adversarial --tools read,bash,edit,write,grep,find,ls -p "{{ prompt }}"

# brainstorm: generate ideas for HallucyGenie project
[group('pi')]
brainstorm:
    pi --skill /data/data/com.termux/files/home/.pi/agent/skills/brainstorm \
      --tools read,bash,write,ls,grep,find \
      -p "Brainstorm ideas for HallucyGenie. Read AGENTS.md for context. Read ideas.md to avoid duplicates. Generate ideas for features, architecture, UX improvements. Run brainstorm skill phases (diverge, challenge adversarial sub-agent, defend, converge). Append final recommendation to ideas.md."

# test MiniMax API endpoints + check quota; update skill + AGENTS.md if new info found

MINIMAX_KEY := env("MINIMAX_API_KEY")

# test MiniMax API endpoints + check quota
[group('pi')]
minimax-test:
    @echo "Testing MiniMax API endpoints..."; \
    echo "TTS:"; curl -s -X POST "https://api.minimax.io/v1/t2a_v2" -H "Content-Type: application/json" -H "Authorization: Bearer {{ MINIMAX_KEY }}" -d '{"model":"speech-2.8-hd","text":"test","voice_setting":{"voice_id":"English_expressive_narrator"}}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('base_resp',{}).get('status_code'), r.get('base_resp',{}).get('status_msg'))" 2>/dev/null; \
    echo "Image:"; curl -s -X POST "https://api.minimax.io/v1/image_generation" -H "Content-Type: application/json" -H "Authorization: Bearer {{ MINIMAX_KEY }}" -d '{"model":"image-01","prompt":"test"}' | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('base_resp',{}).get('status_code'), r.get('base_resp',{}).get('status_msg'))" 2>/dev/null; \
    echo "Quota:"; curl -s "https://api.minimax.io/v1/token_plan/remains" -H "Authorization: Bearer {{ MINIMAX_KEY }}" -H "User-Agent: hallucygenie/1.0" | python3 -c "import sys,json; r=json.load(sys.stdin); [print(m['model_name'], m['current_interval_total_count']) for m in r.get('model_remains',[])]" 2>/dev/null

# research MiniMax APIs: update skill + report code changes
[group('pi')]
minimax-research:
    pi --skill /data/data/com.termux/files/home/.pi/agent/skills/minimax --skill /data/data/com.termux/files/home/.pi/agent/skills/research --tools read,bash,edit,write,grep,find,ls -p "You are researching MiniMax API capabilities for HallucyGenie. Check the current skill at /data/data/com.termux/files/home/.pi/agent/skills/minimax/SKILL.md and the project docs at AGENTS.md. Use the research skill to crawl MiniMax docs. Research any new models, endpoints, or changes. Update the skill file if you find improvements. Report any code changes needed in the project (tools.ts, db.ts, agent.ts, server.ts, etc.). If no changes needed, say so."

# rm caches
[group('util')]
clean:
    rm -rf node_modules/.cache reports

# list recipes
[group('util')]
list:
    just --list

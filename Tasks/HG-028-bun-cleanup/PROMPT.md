# HG-028: Bun Cleanup — Migrate to Node.js Only

**Created:** 2026-04-19
**Size:** S

## Review Level: 1 (Code Only)

## Mission

Remove all Bun references from project files. This project uses Node.js v25 with `--experimental-strip-types` flag. No Bun.

## Why

The project was originally scaffolded with Bun, but now runs on Node.js only. Bun references must be removed to avoid confusion and ensure consistent tooling.

## Files to Update

### 1. `package.json` — Replace bun with node

```json
{
  "scripts": {
    "dev": "node --experimental-strip-types --no-warnings server.ts",
    "test": "node --experimental-strip-types --no-warnings --test server.test.ts agent.test.ts tools.test.ts db.test.ts",
    "test:coverage": "node --experimental-strip-types --no-warnings --experimental-test-coverage --test server.test.ts agent.test.ts tools.test.ts db.test.ts"
  }
}
```

### 2. `AGENTS.md` — Remove bun mentions

Remove lines containing:

- "bun test or bun run"
- "broken on this machine"
- Any bun installation instructions

Keep all other content.

### 3. `tsconfig.json` — Remove bun-types

Remove `"bun-types"` from the `types` array in `compilerOptions`.

Also change `"moduleResolution": "bundler"` to `"moduleResolution": "bundler"` is fine for Node.js ESM, but ensure `"types"` doesn't include bun.

### 4. Check for `bunfig.toml`

If it exists, delete it. Bun-specific config not needed.

### 5. Historical Note in Task Prompts

Do NOT modify historical task PROMPT.md files (HG-002 through HG-010). These document what was done and are not active tasks. Updating them adds no value and risks introducing inconsistencies.

Instead, add a single note to `Tasks/HG-002-project-scaffold/STATUS.md`:

```
> Note: Project now uses Node.js, not Bun. Bun references in PROMPT.md are historical.
```

## Verification

```bash
grep -r "bun" --include="*.ts" --include="*.json" --include="*.yaml" . 2>/dev/null | grep -v node_modules | grep -v ".stryker-tmp" | grep -v ".pi/"
```

Should return nothing related to Bun tooling.

Then verify tests still pass:

```bash
just test
```

## Do NOT

- Install or reference Bun
- Change runtime behavior
- Modify source code logic
- Update historical task PROMPT.md files
- Change `justfile` commands (already node-based)

# HG-022: Simplify handleNodeRequest

**Status:** pending  
**Breaking:** none  
**Risk:** minimal — 7 lines → 15 lines with error handlers

## Waves

| Wave | Tasks |
|------|-------|
| 1 | Replace manual streaming loop with `Readable.fromWeb()` + error + close handlers |
| 2 | Verify `server.test.ts` passes |

## Fixes from Adversarial Review

- [x] `readable.on('error', ...)` — propagate stream errors to handler (pipe swallows pipeline errors)
- [x] `res.on('close', ...)` — destroy readable on client disconnect
- [x] Explicit `readable.on('end', ...)` not needed — `pipe()` calls `res.end()` automatically on clean close

# HG-022: Simplify handleNodeRequest

Replace manual Web Stream byte-by-byte streaming with `Readable.fromWeb().pipe()`.

## Why

Current `handleNodeRequest` (`server.ts` lines 611–648) has two verbose patterns:

1. **Request body**: `for await` + `Buffer.concat()` — correct, keep as-is
2. **Response streaming**: manual `getReader()`/`while` loop — verbose, no backpressure

```typescript
// OLD (lines 638–645):
if (webRes.body) {
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
}

// NEW:
if (webRes.body) {
  const readable = Readable.fromWeb(webRes.body);

  // Propagate stream errors to the error handler below
  readable.on("error", (err) => {
    reqLog.error("response stream error", { error: String(err) });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Upstream error" }));
    }
  });

  // Handle client disconnect — clean up resources
  res.on("close", () => readable.destroy());

  // pipe() calls res.end() automatically when readable closes cleanly
  readable.pipe(res);
} else {
  res.end();
}
```

Node.js `Readable.fromWeb()` converts a Web `ReadableStream<Uint8Array>` to a Node `Readable`. The `.pipe()` method handles backpressure, chunking, and `res.end()` automatically.

Verified: `res.end()` fires, `res.on('finish')` works correctly.

## Change

In `server.ts`, replace the manual streaming block in `handleNodeRequest` with:

```typescript
if (webRes.body) {
  Readable.fromWeb(webRes.body).pipe(res);
} else {
  res.end();
}
```

Keep everything else in `handleNodeRequest` unchanged (Request building, header forwarding, logging).

**Why error handlers:** `pipe()` does NOT propagate errors to the outer try/catch — they emit on the readable. Without `readable.on('error', ...)`, stream failures are silent. The `res.on('close', ...)` handler covers client disconnect mid-stream.

## Tests

Existing `server.test.ts` covers `handleNodeRequest`. Verify they still pass. No new tests — behavior is identical.

Run: `just test-unit`

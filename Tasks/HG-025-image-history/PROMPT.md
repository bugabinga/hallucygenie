# HG-025: Image History Browser

Browse all generated images across sessions. Images stored on filesystem, metadata in SQLite.

## Why

Kid generates an image, refreshes page, image is gone. Every other idea requires behavior change — this removes a loss. File system + SQLite metadata is the correct architecture (not BLOBs).

## Architecture

- **Images**: `data/images/{reqId}.png` on filesystem
- **Metadata**: `assets` table already exists (from HG-019 asset gallery)
- **UI**: Assets panel already exists — wire it up to show image history

## Changes

### 1. Save image to filesystem

In `tools.ts`, after `generateImage` succeeds, save to `data/images/`:

```typescript
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

async function generateImage(prompt: string, ...): Promise<ImageResult> {
    const result = await minimax(...);
    // Save to filesystem
    const imagesDir = join("data", "images");
    mkdirSync(imagesDir, { recursive: true });
    const filename = `${result.id}.png`;
    writeFileSync(join(imagesDir, filename), result.data);
    return result;
}
```

### 2. Asset API already exists

`GET /assets` and `GET /asset/:id` already exist from HG-019. Verify they work:

```bash
curl http://localhost:3000/assets -H "X-Session-Id: test"
curl http://localhost:3000/asset/abc123
```

### 3. Frontend: assets panel already built

`public/app.ts` `loadAssets()` already fetches `/assets` and renders a grid. Verify it shows images.

### 4. Migration

If `assets` table doesn't have image metadata, add migration `006_add_image_history.sql`:

```sql
ALTER TABLE assets ADD COLUMN filename TEXT;
ALTER TABLE assets ADD COLUMN prompt TEXT;
```

## Verification

1. Generate an image via UI
2. Refresh page
3. Open assets panel
4. Image appears in grid

## Tests

Add to `server.test.ts`:

```typescript
describe("GET /assets", () => {
    it("returns assets with type, id, timestamp", async () => {
        const resp = await fetch("/assets", { headers });
        const data = await resp.json();
        assert.ok(Array.isArray(data.assets));
    });
});

describe("GET /asset/:id", () => {
    it("returns image/png for image assets", async () => {
        const resp = await fetch("/asset/test-id", { headers });
        // Returns 404 if not found, 200 with image if found
        assert.ok([200, 404].includes(resp.status));
    });
});
```

Run: `just test-unit`

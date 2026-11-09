import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it } from "node:test";
import {
    assetUrlForSession,
    createApiHeaders,
    fetchHistory,
    loadAssets,
    loadHistory,
    renderToolResult,
    sendSteer
} from "../../public/app.ts";
import {
    createSession,
    getActiveSessionId,
    getMessages,
    saveAsset,
    saveMessage,
    setActiveSessionId
} from "../../src/db.ts";
import { getDb, handleRequest, initDatabase, resetStateForTesting } from "../../src/server.ts";

const originalFetch = globalThis.fetch;
const originalCwd = process.cwd();
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let directory: string | undefined;
let win: Window | undefined;
afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    win?.close();
    win = undefined;
    getDb()?.close();
    resetStateForTesting();
    process.chdir(originalCwd);
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
});

it("production browser helpers keep selected session A when server active session is B", {
    timeout: 5000
}, async () => {
    directory = await mkdtemp(join(tmpdir(), "genie-browser-session-"));
    process.chdir(directory);
    resetStateForTesting();
    initDatabase(":memory:");
    const db = getDb();
    assert.ok(db);
    const a = createSession(db, "session-a", "Project A");
    const b = createSession(db, "session-b", "Project B");
    saveMessage(db, a.id, "user", "Only project A conversation.");
    saveMessage(db, b.id, "user", "PRIVATE PROJECT B CONVERSATION");
    const assetA = "asset_11111111-1111-1111-1111-111111111111";
    const assetB = "asset_22222222-2222-2222-2222-222222222222";
    for (
        const [session, id, prompt] of [[a.id, assetA, "Only project A artwork"], [
            b.id,
            assetB,
            "PRIVATE PROJECT B ARTWORK"
        ]]
    ) {
        await mkdir(join(directory, "data/assets", session), { recursive: true });
        await writeFile(
            join(directory, "data/assets", session, "image.png"),
            new Uint8Array([1, 2, 3])
        );
        saveAsset(db, {
            id,
            session_id: session,
            type: "image",
            filename: "image.png",
            mime_type: "image/png",
            prompt,
            tool_name: "generate_image",
            size_bytes: 3
        });
    }
    setActiveSessionId(db, b.id);
    win = new Window({ url: "http://localhost/" });
    win.document.body.innerHTML =
        "<select id=\"session-select\"><option value=\"session-a\" selected>A</option><option value=\"session-b\">B</option></select><div id=\"message-list\"></div><div id=\"assets-grid\"></div><div id=\"assets-empty\"></div><div id=\"lightbox\" hidden><img id=\"lightbox-img\"><button class=\"lightbox-close\">Close</button></div>";
    Object.defineProperty(globalThis, "document", { configurable: true, value: win.document });
    const calls: Array<{ path: string; session: string | null; }> = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(new URL(String(input), "http://localhost"), init);
        calls.push({
            path: new URL(request.url).pathname,
            session: request.headers.get("X-Session-Id")
        });
        return handleRequest(request);
    };

    assert.equal(getActiveSessionId(db), b.id);
    assert.deepEqual(createApiHeaders(), {
        "Content-Type": "application/json",
        "X-Session-Id": a.id
    });
    const mediaUrl = assetUrlForSession(`/asset/${assetA}`);
    assert.equal(new URL(mediaUrl, "http://localhost").searchParams.get("session_id"), a.id);
    assert.equal(
        assetUrlForSession("https://example.org/public.png"),
        "https://example.org/public.png"
    );
    assert.equal(
        new URL(assetUrlForSession(mediaUrl), "http://localhost").searchParams.getAll("session_id")
            .length,
        1
    );

    const history = await fetchHistory();
    assert.deepEqual(history.map(message => message.content), ["Only project A conversation."]);
    await loadHistory();
    assert.ok(
        win.document.querySelector("#message-list")?.textContent.includes(
            "Only project A conversation."
        )
    );
    assert.equal(win.document.body.textContent.includes("PRIVATE PROJECT B"), false);

    const rendered = new Promise<void>((resolve, reject) => {
        const observer = new win!.MutationObserver(() => {
            if (win!.document.querySelector("#assets-grid .asset-card")) {
                observer.disconnect();
                resolve();
            } else if (
                win!.document.querySelector("#assets-empty")?.textContent.includes("Failed")
            ) {
                observer.disconnect();
                reject(new Error("Production asset loader failed"));
            }
        });
        observer.observe(win!.document.body, { childList: true, subtree: true });
    });
    loadAssets();
    await rendered;
    const grid = win.document.querySelector("#assets-grid")!;
    assert.ok(grid.textContent.includes("Only project A artwork"));
    assert.equal(grid.textContent.includes("PRIVATE PROJECT B"), false);
    const preview = grid.querySelector("img")!;
    assert.equal(new URL(preview.src).searchParams.get("session_id"), a.id);
    const download = grid.querySelector<HTMLAnchorElement>(".asset-download")!;
    assert.equal(new URL(download.href).searchParams.get("session_id"), a.id);
    const bytes = await handleRequest(new Request(new URL(preview.src)));
    assert.equal(bytes.status, 200);
    assert.equal(bytes.headers.get("Cache-Control"), "private, no-store");
    const toolCard = renderToolResult("generate_image", {
        type: "image",
        content: `/asset/${assetA}`
    });
    win.document.body.appendChild(toolCard);
    toolCard.querySelector("img")!.click();
    const lightbox = win.document.querySelector<HTMLImageElement>("#lightbox-img")!;
    assert.equal(
        new URL(lightbox.src).searchParams.get("session_id"),
        a.id,
        "lightbox keeps the displayed project"
    );
    assert.equal((await handleRequest(new Request(lightbox.src))).status, 200);
    const denied = await handleRequest(
        new Request(`http://localhost/asset/${assetB}?session_id=${a.id}`)
    );
    assert.equal(denied.status, 404);

    await sendSteer("Keep project A mermaids.");
    assert.ok(
        getMessages(db, a.id).some(message => message.content === "Keep project A mermaids.")
    );
    assert.equal(getMessages(db, b.id).length, 1);
    assert.equal(getActiveSessionId(db), b.id);
    assert.ok(calls.some(call => call.path === "/api/history"));
    assert.ok(calls.some(call => call.path === "/assets"));
    assert.ok(calls.some(call => call.path === "/api/steer"));
    assert.ok(calls.every(call => call.session === a.id));
});

#!/usr/bin/env node
// HallucyGenie E2E Test Runner
// Runs against the REAL server with MiniMax API mocked via nock.
// Architecture:
//   Browser → Real Server → Mocked MiniMax (nock)
//                ↓
//           Real SQLite (temp)

import { chromium, type Browser, type Page } from "playwright-core";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { startServer, initDatabase, shutdown, resetStateForTesting } from "../src/server.ts";
import {
    setupMinimaxMocks,
    cleanupMinimaxMocks,
    resetMinimaxMockCalls,
    getMinimaxMockCalls,
} from "./minimax-mock.ts";

const CHROMIUM_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
].filter((path): path is string => Boolean(path));

const CHROMIUM_PATH = CHROMIUM_CANDIDATES.find((path) => existsSync(path));
const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TINY_PNG = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3,
    253, 167, 95, 88, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

// ── Test framework ──────────────────────────────────────────────────

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function assertEqual(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected "${expected}", got "${actual}"`);
    }
}

async function expectVisible(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "visible", timeout: 5000 });
}

async function expectImageLoaded(page: Page, selector: string): Promise<void> {
    await page.waitForFunction(
        (target) => {
            const img = document.querySelector<HTMLImageElement>(target);
            return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        },
        selector,
        { timeout: 5000 },
    );
}

async function expectHidden(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "hidden", timeout: 5000 });
}

async function expectDisabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    const disabled = await locator.isDisabled();
    if (!disabled) throw new Error("Expected element to be disabled");
}

async function expectEnabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    const enabled = await locator.isEnabled();
    if (!enabled) throw new Error("Expected element to be enabled");
}

async function waitForAppReady(page: Page): Promise<void> {
    await page.waitForSelector("#send-button");
    await page.waitForFunction(() => document.documentElement.dataset.hgReady === "1");
}

/**
 * Reliable "app is ready" signal:
 * 1. Navigate to page
 * 2. Wait for init() to finish
 *
 * Optionally dismiss onboarding overlay for tests that need to interact
 * with elements behind it.
 */
async function waitForApp(page: Page, options?: { dismissOnboarding?: boolean }): Promise<void> {
    await page.goto(BASE_URL);
    await waitForAppReady(page);

    // Dismiss onboarding overlay if requested (it blocks clicks on elements behind it)
    if (options?.dismissOnboarding) {
        const onboarding = page.locator("#onboarding");
        const isVisible = await onboarding.isVisible().catch(() => false);
        if (isVisible) {
            // Set localStorage to prevent onboarding, then dismiss
            await page.evaluate(() => {
                localStorage.setItem("hg_onboarding_done", "1");
                const ob = document.getElementById("onboarding");
                if (ob) ob.hidden = true;
            });
            await page.waitForTimeout(50);
        }
    }
}

// ── Main test runner ─────────────────────────────────────────────────

// Temp directory module-level so cleanup() can access it
let _tmpDir: string | undefined;

async function runE2ETests(): Promise<void> {
    console.log("🧪 HallucyGenie E2E Tests");
    console.log(`   Browser: ${CHROMIUM_PATH ?? "Playwright default"}`);
    console.log(`   URL: ${BASE_URL}`);
    console.log();

    // ── Setup: temp directory + database ──────────────────────────────
    _tmpDir = mkdtempSync(join(tmpdir(), "hg-e2e-"));
    const dbPath = join(_tmpDir, "test.db");

    // Set API key so server.ts doesn't bail on /api/chat requests
    process.env.MINIMAX_API_KEY = "test-key-for-e2e";
    process.env.DATA_DIR = _tmpDir;

    // Set up nock mocks BEFORE starting server (server makes calls during init)
    setupMinimaxMocks();

    // Initialize database and start real server
    initDatabase(dbPath);
    const server = startServer(TEST_PORT);

    // Wait for server to be listening
    await new Promise<void>((resolve, reject) => {
        server.on("listening", () => resolve());
        server.on("error", (err) => reject(err));
        // Also handle the case where it's already listening
        if (server.listening) resolve();
    });

    console.log(`   Server: http://localhost:${TEST_PORT}`);
    console.log(`   DB: ${dbPath}`);
    console.log();

    // ── Launch browser ────────────────────────────────────────────────

    let browser: Browser;
    try {
        browser = await chromium.launch({
            executablePath: CHROMIUM_PATH,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("❌ Failed to launch Chromium:", msg);
        await cleanup();
        process.exit(1);
    }

    const results: TestResult[] = [];

    // ── Existing Tests (fixed) ────────────────────────────────────────

    // Test 1: Page loads with correct title and elements
    await runTest(
        "page loads with correct title and elements",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const title = await page.title();
            assertEqual(title, "HallucyGenie", "Page title");

            const headerText = await page.textContent(".header-title");
            assertEqual(headerText, "HallucyGenie", "Header text");

            await expectVisible(page, "#chat-input");
            await expectVisible(page, "#send-button");
            await expectVisible(page, ".message--welcome");

            await page.close();
        },
        results,
    );

    // Test 2: Vendored fonts load from self and apply to real selectors
    await runTest(
        "vendored fonts load from self and apply",
        async () => {
            const page = await browser!.newPage();
            const requests: string[] = [];
            const consoleMessages: string[] = [];
            page.on("request", (request) => requests.push(request.url()));
            page.on("console", (message) => consoleMessages.push(message.text()));

            await waitForApp(page);
            await page.evaluate(async () => {
                await document.fonts.ready;
            });

            const checks = await page.evaluate(() => ({
                pixelify: document.fonts.check('16px "HG Pixelify Sans"'),
                roboto: document.fonts.check('16px "HG Roboto Flex"'),
                playwrite: document.fonts.check('16px "HG Playwrite DE SAS"'),
                header: getComputedStyle(document.querySelector(".header-title")!).fontFamily,
                assistant: getComputedStyle(
                    document.querySelector(".message--assistant .message-content")!,
                ).fontFamily,
                input: getComputedStyle(document.querySelector("#chat-input")!).fontFamily,
            }));

            if (!checks.pixelify) throw new Error("HG Pixelify Sans not loaded");
            if (!checks.roboto) throw new Error("HG Roboto Flex not loaded");
            if (!checks.playwrite) throw new Error("HG Playwrite DE SAS not loaded");
            if (!checks.header.includes("HG Pixelify Sans")) throw new Error(checks.header);
            if (!checks.assistant.includes("HG Roboto Flex")) throw new Error(checks.assistant);
            if (!checks.input.includes("HG Playwrite DE SAS")) throw new Error(checks.input);

            const googleFontRequest = requests.find(
                (url) => url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com"),
            );
            if (googleFontRequest) throw new Error(`External font request: ${googleFontRequest}`);

            const fontRequests = requests.filter((url) => url.includes("/fonts/"));
            if (fontRequests.length < 3)
                throw new Error(`Expected 3 font requests, got ${fontRequests.length}`);

            const cspMessage = consoleMessages.find((message) =>
                /content security policy|csp/i.test(message),
            );
            if (cspMessage) throw new Error(`CSP violation: ${cspMessage}`);

            await page.close();
        },
        results,
    );

    // Test 3: Send button disabled when input is empty
    await runTest(
        "send button disabled when input is empty",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const sendBtn = page.locator("#send-button");
            await expectDisabled(sendBtn);

            await page.fill("#chat-input", "Hello");
            await expectEnabled(sendBtn);

            await page.fill("#chat-input", "");
            await expectDisabled(sendBtn);

            await page.close();
        },
        results,
    );

    // Test 3: Enter key sends message (needs real server + mocked MiniMax)
    await runTest(
        "Enter key sends message",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.fill("#chat-input", "Test message");
            await page.press("#chat-input", "Enter");

            // User message should appear immediately (frontend renders before API call)
            const userMsg = page.locator(".message--user .message-content").last();
            await userMsg.waitFor({ timeout: 5000 });
            const text = (await userMsg.textContent())?.trim();
            assertEqual(text, "Test message", "User message text");

            await page.close();
        },
        results,
    );

    // Test 4: Browser does not store session UUID
    await runTest(
        "session UUID is not stored in localStorage",
        async () => {
            const page = await browser!.newPage();
            await page.goto(BASE_URL);
            await waitForAppReady(page);

            const keys = await page.evaluate(() => Object.keys(localStorage));
            if (keys.includes("hallucygenie_session_id"))
                throw new Error("Unexpected session ID key");

            await page.close();
        },
        results,
    );

    // Test 5: Error toast appears and auto-dismisses
    await runTest(
        "error toast appears and auto-dismisses",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const toast = document.getElementById("error-toast")!;
                const msg = document.getElementById("error-toast-message")!;
                msg.textContent = "Test error";
                toast.hidden = false;
            });

            const toast = page.locator("#error-toast");
            await toast.waitFor({ state: "visible" });
            const text = await page.textContent("#error-toast-message");
            assertEqual(text, "Test error", "Error toast text");

            await page.close();
        },
        results,
    );

    // Test 6: Lightbox opens and closes
    await runTest(
        "lightbox opens and closes",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const lightbox = document.getElementById("lightbox")!;
                const img = document.getElementById("lightbox-img") as HTMLImageElement;
                img.src =
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
                lightbox.hidden = false;
            });

            await expectVisible(page, "#lightbox");
            await expectVisible(page, "#lightbox-img");

            await page.click(".lightbox-backdrop");
            await expectHidden(page, "#lightbox");

            await page.close();
        },
        results,
    );

    // Test 7: Mobile viewport
    await runTest(
        "mobile viewport (375x812)",
        async () => {
            const page = await browser!.newPage({ viewport: { width: 375, height: 812 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");
            await expectVisible(page, "#message-list");

            await page.close();
        },
        results,
    );

    // Test 8: Desktop viewport
    await runTest(
        "desktop viewport (1280x800)",
        async () => {
            const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");

            await page.close();
        },
        results,
    );

    await runTest(
        "thinking indicator does not shift long scrollback layout",
        async () => {
            for (const viewport of [
                { width: 1280, height: 800 },
                { width: 375, height: 812 },
            ]) {
                const page = await browser!.newPage({ viewport });
                await waitForApp(page, { dismissOnboarding: true });
                await page.evaluate(() => {
                    const originalFetch = fetch.bind(globalThis);
                    globalThis.fetch = async (input, init) => {
                        const url = new URL(
                            input instanceof Request ? input.url : String(input),
                            location.href,
                        );
                        if (url.pathname !== "/api/chat") return originalFetch(input, init);
                        const encoder = new TextEncoder();
                        return new Response(
                            new ReadableStream({
                                start(controller) {
                                    setTimeout(
                                        () =>
                                            controller.enqueue(
                                                encoder.encode(
                                                    'data: {"delta":"Layout stable"}\n\n',
                                                ),
                                            ),
                                        200,
                                    );
                                    setTimeout(() => {
                                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                                        controller.close();
                                    }, 2000);
                                },
                            }),
                            { status: 200, headers: { "Content-Type": "text/event-stream" } },
                        );
                    };
                    const list = document.querySelector("#message-list")!;
                    list.innerHTML = Array.from(
                        { length: 36 },
                        (_, i) => `
                            <div class="message message--assistant">
                                <div class="message-avatar" aria-hidden="true">🧞</div>
                                <div class="message-bubble"><div class="message-content">Long history row ${i + 1}</div></div>
                            </div>`,
                    ).join("");
                    list.scrollTop = list.scrollHeight;
                });

                const measure = async () =>
                    page.evaluate(() => {
                        const rect = (selector: string) => {
                            const r = document.querySelector(selector)!.getBoundingClientRect();
                            return {
                                top: Math.round(r.top),
                                bottom: Math.round(r.bottom),
                                height: Math.round(r.height),
                            };
                        };
                        const list = document.querySelector("#message-list") as HTMLElement;
                        const typing = document.querySelector("#typing-indicator") as HTMLElement;
                        return {
                            list: rect("#message-list"),
                            input: rect("#input-area"),
                            typing: rect("#typing-indicator"),
                            lastMessage: rect(".message--assistant:last-child"),
                            scrollHeight: list.scrollHeight,
                            typingHidden: typing.hasAttribute("hidden"),
                            typingAriaHidden: typing.getAttribute("aria-hidden"),
                            typingVisible: typing.classList.contains("is-visible"),
                        };
                    });

                const before = await measure();
                await page.fill("#chat-input", "Check layout stability");
                await page.press("#chat-input", "Enter");
                await page.waitForSelector("#typing-indicator.is-visible", { timeout: 5000 });
                const duringThinking = await measure();
                await page.waitForFunction(
                    () => {
                        const list = document.querySelector("#message-list") as HTMLElement;
                        return (
                            document
                                .querySelector(".message--assistant:last-child .message-content")
                                ?.textContent?.includes("Layout stable") &&
                            document
                                .querySelector("#typing-indicator")
                                ?.classList.contains("is-visible") &&
                            list.scrollHeight - list.clientHeight - list.scrollTop <= 1
                        );
                    },
                    null,
                    { timeout: 5000 },
                );
                await page.waitForTimeout(200);
                const beforeDone = await measure();
                await page.waitForFunction(
                    () =>
                        !document
                            .querySelector("#typing-indicator")
                            ?.classList.contains("is-visible"),
                    null,
                    { timeout: 5000 },
                );
                await page.waitForTimeout(200);
                const afterDone = await measure();

                if (Math.abs(before.list.bottom - before.input.top) > 1) {
                    throw new Error(
                        `Message list does not reach input area: ${before.list.bottom} != ${before.input.top}`,
                    );
                }
                for (const key of ["top", "bottom", "height"] as const) {
                    assertEqual(
                        duringThinking.list[key],
                        before.list[key],
                        `message list ${key} during thinking`,
                    );
                    assertEqual(
                        beforeDone.list[key],
                        before.list[key],
                        `message list ${key} before done`,
                    );
                    assertEqual(
                        afterDone.list[key],
                        before.list[key],
                        `message list ${key} after done`,
                    );
                    assertEqual(
                        afterDone.input[key],
                        before.input[key],
                        `input area ${key} after done`,
                    );
                    assertEqual(
                        afterDone.lastMessage[key],
                        beforeDone.lastMessage[key],
                        `last assistant message ${key} after indicator hides`,
                    );
                }
                assertEqual(
                    afterDone.scrollHeight,
                    beforeDone.scrollHeight,
                    "Scroll height after indicator hides",
                );
                assertEqual(
                    duringThinking.typingHidden,
                    false,
                    "Typing indicator hidden attr during",
                );
                assertEqual(
                    duringThinking.typingAriaHidden,
                    "false",
                    "Typing indicator aria during",
                );
                assertEqual(duringThinking.typingVisible, true, "Typing indicator class during");
                assertEqual(afterDone.typingHidden, false, "Typing indicator hidden attr after");
                assertEqual(afterDone.typingAriaHidden, "true", "Typing indicator aria after");
                assertEqual(afterDone.typingVisible, false, "Typing indicator class after");
                if (duringThinking.typing.height > 1 || afterDone.typing.height > 1) {
                    throw new Error("Typing indicator has visual height");
                }
                assertEqual(
                    (
                        await page
                            .locator(".message--assistant .message-content")
                            .last()
                            .textContent()
                    )?.trim(),
                    "Layout stable",
                    "Assistant response after layout check",
                );
                await page.close();
            }
        },
        results,
    );

    // Test 9: Auto-resize textarea
    await runTest(
        "textarea auto-resizes with content",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page);

            const initialHeight = await page.evaluate(() => {
                return (document.getElementById("chat-input") as HTMLTextAreaElement).offsetHeight;
            });

            await page.fill("#chat-input", "Line 1\nLine 2\nLine 3\nLine 4");
            const newHeight = await page.evaluate(() => {
                return (document.getElementById("chat-input") as HTMLTextAreaElement).offsetHeight;
            });

            if (newHeight < initialHeight) {
                throw new Error(`Textarea should not shrink: ${initialHeight} → ${newHeight}`);
            }

            await page.close();
        },
        results,
    );

    // Test 10: Steering message renders with distinct style
    await runTest(
        "steer message renders with distinct style",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            // Inject a steer message directly
            await page.evaluate(() => {
                const msg = document.createElement("div");
                msg.className = "message message--steer message--user";
                msg.innerHTML = `
                    <div class="message-avatar">💡</div>
                    <div class="message-bubble">
                        <div class="message-content">Steer test</div>
                    </div>
                `;
                document.getElementById("message-list")!.appendChild(msg);
            });

            const steerMsg = page.locator(".message--steer");
            await steerMsg.waitFor({ timeout: 5000 });
            const count = await steerMsg.count();
            if (count === 0) throw new Error("Steer message not found");

            const content = await page.textContent(".message--steer .message-content");
            assertEqual(content, "Steer test", "Steer message content");

            await page.close();
        },
        results,
    );

    // ── New Tests ─────────────────────────────────────────────────────

    // Test 11: Onboarding shows on first visit
    await runTest(
        "onboarding shows on first visit",
        async () => {
            const page = await browser!.newPage();
            // Fresh page context — no localStorage, so onboarding should show
            await page.goto(BASE_URL);

            const onboarding = page.locator("#onboarding");
            await onboarding.waitFor({ state: "visible", timeout: 10000 });

            await page.close();
        },
        results,
    );

    // Test 12: Onboarding completes and hides
    await runTest(
        "onboarding completes and hides",
        async () => {
            const page = await browser!.newPage();
            await page.goto(BASE_URL);

            const onboarding = page.locator("#onboarding");
            await onboarding.waitFor({ state: "visible", timeout: 10000 });

            // Click through all onboarding slides sequentially
            // Each slide has a button that either advances or dismisses
            const allButtons = [
                ".onboarding-slide.active .onboarding-next",
                "#onboarding-try-chat",
                "#onboarding-try-create",
                "#onboarding-done",
            ];

            for (const selector of allButtons) {
                const btn = page.locator(selector);
                const visible = await btn.isVisible().catch(() => false);
                if (visible) {
                    await btn.click();
                    await page.waitForTimeout(100);
                }
            }

            await onboarding.waitFor({ state: "hidden", timeout: 5000 });

            await page.close();
        },
        results,
    );

    // Test 13: Create modal opens and shows tabs
    await runTest(
        "create modal opens and shows tabs",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "visible" });

            await expectVisible(page, ".create-tab[data-tab='image']");
            await expectVisible(page, ".create-tab[data-tab='music']");
            await expectVisible(page, ".create-tab[data-tab='voice']");
            await expectVisible(page, ".create-tab[data-tab='analyze']");
            await expectVisible(page, ".create-tab[data-tab='search']");

            await page.close();
        },
        results,
    );

    await runTest(
        "create image keeps related helper text near its control",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            const boxes = await page.evaluate(() => {
                const label = document
                    .querySelector("label[for='img-prompt-optimizer']")
                    ?.getBoundingClientRect();
                const help = document
                    .querySelector("#create-image-form .create-option-group .field-help")
                    ?.getBoundingClientRect();
                const action = document
                    .querySelector("#create-image-form .create-submit")
                    ?.getBoundingClientRect();
                if (!label || !help || !action)
                    throw new Error("Missing Create image spacing controls");
                return {
                    labelBottom: label.bottom,
                    helpTop: help.top,
                    helpBottom: help.bottom,
                    actionTop: action.top,
                };
            });
            const relatedGap = boxes.helpTop - boxes.labelBottom;
            const actionGap = boxes.actionTop - boxes.helpBottom;
            if (relatedGap > 8) {
                throw new Error(
                    `Create image help too far from checkbox: ${JSON.stringify(boxes)}`,
                );
            }
            if (actionGap <= relatedGap * 2) {
                throw new Error(
                    `Create image action too close to helper text: ${JSON.stringify(boxes)}`,
                );
            }

            await page.close();
        },
        results,
    );

    // Test 14: Create modal switches tabs
    await runTest(
        "create modal switches tabs",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            // Switch to music tab
            await page.click(".create-tab[data-tab='music']");
            await expectVisible(page, "#create-music-form");

            // Switch back to image tab
            await page.click(".create-tab[data-tab='image']");
            await expectVisible(page, "#create-image-form");

            await page.close();
        },
        results,
    );

    await runTest(
        "create image renders chat lightbox and asset previews",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.fill("#img-prompt", "a neon fox gamer logo");
            await page.selectOption("#img-count", "2");
            await page.click("#create-image-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            await expectVisible(page, ".tool-result-image-grid");
            await page.waitForFunction(
                () => document.querySelectorAll(".tool-result-image").length === 2,
            );
            await expectImageLoaded(
                page,
                ".tool-result-image-grid .tool-result-image:nth-child(1)",
            );

            await page.click(".tool-result-image-grid .tool-result-image:nth-child(1)");
            await expectVisible(page, "#lightbox");
            await expectImageLoaded(page, "#lightbox-img");
            await page.click(".lightbox-close");
            await expectHidden(page, "#lightbox");

            await expectVisible(page, ".tool-input-details");
            await page.click(".tool-tweak-button");
            await expectVisible(page, "#create-modal");
            assertEqual(await page.inputValue("#img-prompt"), "a neon fox gamer logo");
            assertEqual(await page.inputValue("#img-count"), "2");

            await page.click(".create-tab[data-tab='assets']");
            await page
                .locator(".asset-card[data-type='image']")
                .first()
                .waitFor({ state: "visible" });
            await page.waitForFunction(
                () => document.querySelectorAll(".asset-card[data-type='image']").length >= 2,
            );
            await expectImageLoaded(page, ".asset-card[data-type='image'] .asset-thumb");
            await page
                .locator(".asset-card[data-type='image'] .asset-preview-button")
                .first()
                .click();
            await expectVisible(page, "#lightbox");
            await expectImageLoaded(page, "#lightbox-img");
            const topLayer = await page.evaluate(() => {
                const box = document.querySelector("#lightbox-img")!.getBoundingClientRect();
                const top = document.elementFromPoint(
                    box.left + box.width / 2,
                    box.top + box.height / 2,
                );
                return top?.id || top?.closest("#lightbox, #create-modal")?.id || top?.tagName;
            });
            assertEqual(topLayer, "lightbox-img", "Asset lightbox is above Create modal");
            await page.click(".lightbox-close");
            await expectHidden(page, "#lightbox");
            await expectVisible(page, "#create-modal");

            await page.close();
        },
        results,
    );

    await runTest(
        "create analyze uploads local image safely",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='analyze']");
            await expectVisible(page, "#create-analyze-form");

            const uploadResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/analyze-image") && res.request().method() === "POST",
            );
            await page.setInputFiles("#analyze-file", {
                name: "pixel.png",
                mimeType: "image/png",
                buffer: TINY_PNG,
            });
            assertEqual((await uploadResponse).status(), 200, "Analyze upload response");
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent ===
                    "Selected pixel.png",
            );

            const previewSrc =
                (await page.locator("#analyze-file-preview img").getAttribute("src")) ?? "";
            if (!previewSrc.startsWith("/asset/asset_")) {
                throw new Error(`Analyze preview did not use stored asset: ${previewSrc}`);
            }
            if (/data:image|base64/i.test(previewSrc))
                throw new Error("Preview leaked raw image data");

            await page.fill("#analyze-prompt", "What color is this pixel?");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST",
            );
            await page.click("#create-analyze-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            if (requestBody.tool_name !== "analyze_image") {
                throw new Error(
                    `Analyze used wrong endpoint payload: ${JSON.stringify(requestBody)}`,
                );
            }
            if (!String(requestBody.input?.image_url ?? "").startsWith("/asset/asset_")) {
                throw new Error(`Analyze payload missed asset URL: ${JSON.stringify(requestBody)}`);
            }
            const userText =
                (await page.locator(".message--user .message-content").last().textContent()) ?? "";
            if (!userText.includes("Analyze image: What color is this pixel?")) {
                throw new Error(`Analyze user message missed kid-safe label: ${userText}`);
            }
            if (/Use analyze_image|Tool params|data:image|base64/i.test(userText))
                throw new Error(`Analyze message leaked internals: ${userText}`);

            await page.close();
        },
        results,
    );

    await runTest(
        "create analyze handles file edges",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='analyze']");
            await expectVisible(page, "#create-analyze-form");

            await page.evaluate(() => {
                const file = new File(["GIF89a"], "sparkle.gif", { type: "image/gif" });
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                document.querySelector("#analyze-dropzone")!.dispatchEvent(
                    new DragEvent("drop", {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer,
                    }),
                );
            });
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent ===
                    "Use a PNG, JPG, or WebP image.",
            );
            await expectHidden(page, "#analyze-file-preview img");

            await page.setInputFiles("#analyze-file", {
                name: "pixel.png",
                mimeType: "image/png",
                buffer: TINY_PNG,
            });
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent ===
                    "Selected pixel.png",
            );
            await expectVisible(page, "#analyze-file-preview img");

            await page.fill("#analyze-url", "https://example.com/fallback.png");
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent ===
                    "Using image URL fallback.",
            );
            await expectHidden(page, "#analyze-file-preview img");

            await page.close();
        },
        results,
    );

    await runTest(
        "create music uses structured multiline lyrics",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            await expectVisible(page, "#create-music-form");
            await page.fill("#music-prompt", "boss fight intro");
            const lyrics = "Verse one, comma stays\nChorus line, also stays";
            await page.fill("#music-lyrics", lyrics);
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST",
            );
            await page.click("#create-music-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "generate_music", "Music create tool");
            assertEqual(requestBody.input.prompt, "boss fight intro", "Music prompt");
            assertEqual(requestBody.input.lyrics, lyrics, "Music lyrics preserved");
            const userText =
                (await page.locator(".message--user .message-content").last().textContent()) ?? "";
            if (/Use generate_music|Tool params:/i.test(userText)) {
                throw new Error(`Music message leaked internals: ${userText}`);
            }
            await expectVisible(page, ".tool-card:has(.tool-result-audio)");
            const widths = await page.evaluate(() => {
                const row = document.querySelector(".message--assistant:has(.tool-result-audio)")!;
                const bubble = row.querySelector(".message-bubble")!;
                const card = row.querySelector(".tool-card")!;
                return {
                    row: row.getBoundingClientRect().width,
                    bubble: bubble.getBoundingClientRect().width,
                    card: card.getBoundingClientRect().width,
                };
            });
            if (widths.bubble / widths.row < 0.7) {
                throw new Error(`Music tool bubble too narrow: ${JSON.stringify(widths)}`);
            }
            if (widths.card / widths.bubble < 0.85) {
                throw new Error(`Music tool card too narrow: ${JSON.stringify(widths)}`);
            }

            await page.close();
        },
        results,
    );

    await runTest(
        "write lyrics draft survives reload",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            await page.fill("#music-prompt", "victory song");
            const createToolResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/create-tool") && res.request().method() === "POST",
            );
            await page.click("#write-lyrics-btn");
            assertEqual((await createToolResponse).status(), 200, "Lyrics create tool response");
            await page.waitForFunction(() =>
                (
                    document.querySelector("#music-lyrics") as HTMLTextAreaElement | null
                )?.value.includes("Verse one, game on"),
            );
            await page.reload();
            await waitForAppReady(page);
            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            const lyrics = await page.locator("#music-lyrics").inputValue();
            if (
                !lyrics.includes("Verse one, game on") ||
                !lyrics.includes("Chorus, win the fight")
            ) {
                throw new Error(`Generated lyrics draft did not survive reload: ${lyrics}`);
            }

            await page.close();
        },
        results,
    );

    // Test 15: Create modal closes
    await runTest(
        "create modal closes",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            await page.click("#create-close");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "hidden" });

            await page.close();
        },
        results,
    );

    // Test 16: Quota badge shows in header
    await runTest(
        "quota badge shows in header",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            // Wait for quota badge to be populated (async fetch from /api/quota)
            const badge = page.locator("#quota-badge");
            await badge.waitFor({ state: "visible", timeout: 5000 });

            await expectVisible(page, ".quota-item[data-type='image']");
            await expectVisible(page, ".quota-item[data-type='speech']");
            await expectVisible(page, ".quota-item[data-type='music']");

            await page.close();
        },
        results,
    );

    await runTest(
        "profile avatar generate button stays near avatar",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;

            const grouped = await page.locator(".profile-avatar-editor #profile-generate").count();
            assertEqual(grouped, 1, "Generate avatar button is in avatar editor");

            const boxes = await page.evaluate(() => {
                const avatar = document
                    .querySelector("#profile-avatar-preview")
                    ?.getBoundingClientRect();
                const generate = document
                    .querySelector("#profile-generate")
                    ?.getBoundingClientRect();
                const save = document
                    .querySelector(".profile-actions button[type='submit']")
                    ?.getBoundingClientRect();
                if (!avatar || !generate || !save) throw new Error("Missing profile controls");
                return {
                    avatarCenterY: avatar.top + avatar.height / 2,
                    generateCenterY: generate.top + generate.height / 2,
                    saveTop: save.top,
                };
            });
            if (Math.abs(boxes.avatarCenterY - boxes.generateCenterY) > 80) {
                throw new Error(`Generate avatar too far from avatar: ${JSON.stringify(boxes)}`);
            }
            if (boxes.saveTop <= boxes.generateCenterY) {
                throw new Error(
                    `Save action should stay below avatar group: ${JSON.stringify(boxes)}`,
                );
            }

            await page.close();
        },
        results,
    );

    // Test 17: Profile saves via DB and survives localStorage clearing
    await runTest(
        "profile saves via DB and survives localStorage clearing",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;
            await page.fill("#profile-username", "GamerKid");
            await page.fill("#profile-interests", "Minecraft");
            await page.click("#profile-form button[type='submit']");
            await expectHidden(page, "#profile-modal");

            await page.evaluate(() => localStorage.clear());
            await page.reload();
            await waitForAppReady(page);
            await page.evaluate(() => {
                localStorage.setItem("hg_onboarding_done", "1");
                const onboarding = document.getElementById("onboarding");
                if (onboarding) onboarding.hidden = true;
            });
            const reloadedProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await reloadedProfileLoad;
            const username = await page.locator("#profile-username").inputValue();
            const interests = await page.locator("#profile-interests").inputValue();
            const avatarAsset = await page.locator("#profile-avatar-asset").inputValue();
            assertEqual(username, "GamerKid", "Profile username persisted");
            assertEqual(interests, "Minecraft", "Profile interests persisted");
            assertEqual(avatarAsset, "", "Default profile avatar persisted as no asset");
            await expectVisible(page, "#profile-avatar-fallback");

            await page.click("#profile-reset");
            await expectHidden(page, "#profile-modal");
            await page.close();
        },
        results,
    );

    await runTest(
        "profile rejects raw avatar data URL through API",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });

            const result = await page.evaluate(async () => {
                const resp = await fetch("/api/profile", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: "Bad Avatar",
                        interests: "Minecraft",
                        avatar: "data:image/png;base64,AAAA",
                    }),
                });
                return { status: resp.status, body: (await resp.json()) as { error?: string } };
            });

            assertEqual(result.status, 400, "Raw avatar data URL rejected");
            if (!/avatar/i.test(result.body.error ?? "")) {
                throw new Error(`Expected avatar validation error, got ${result.body.error}`);
            }

            await page.close();
        },
        results,
    );

    await runTest(
        "profile avatar generation shows loading state",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });
            await page.route("**/api/profile/avatar/generate", async (route) => {
                await page.waitForTimeout(300);
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "delayed test failure" }),
                });
            });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;

            const generateResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/profile/avatar/generate") &&
                    res.request().method() === "POST",
            );
            await page.click("#profile-generate");
            await expectDisabled(page.locator("#profile-generate"));
            await expectVisible(page, "#profile-avatar-preview.is-pending .profile-avatar-spinner");
            assertEqual(
                await page.locator("#profile-avatar-preview").getAttribute("aria-busy"),
                "true",
                "Avatar preview marked busy",
            );
            assertEqual(
                await page.locator("#profile-avatar-status").textContent(),
                "Generating avatar.",
                "Avatar status text while pending",
            );

            await generateResponse;
            await expectEnabled(page.locator("#profile-generate"));
            await expectHidden(page, "#profile-avatar-preview.is-pending");
            assertEqual(
                await page.locator("#profile-avatar-preview").getAttribute("aria-busy"),
                "false",
                "Avatar preview no longer busy",
            );
            await page.unroute("**/api/profile/avatar/generate");
            await page.close();
        },
        results,
    );

    await runTest(
        "profile generates avatar asset, persists, and uses it in chat",
        async () => {
            const page = await browser!.newPage();
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            const chatResponse = page.waitForResponse(
                (res) => res.url().includes("/api/chat") && res.request().method() === "POST",
            );
            await page.fill("#chat-input", "Existing avatar should repaint");
            await page.press("#chat-input", "Enter");
            await chatResponse;
            const existingAvatar = page.locator(".message--user .message-avatar").first();
            await existingAvatar.waitFor({ state: "attached", timeout: 5000 });
            if (await existingAvatar.locator(".profile-avatar-img").count()) {
                throw new Error("Expected existing user bubble to start with fallback avatar");
            }

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;

            await page.fill("#profile-username", "GamerKid");
            await page.fill("#profile-interests", "Minecraft build battles");
            await page.fill("#profile-hates", "scary gore");
            await page.fill("#profile-favorites", "blue fire and pixel art");
            await expectEnabled(page.locator("#profile-generate"));

            const generateResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/profile/avatar/generate") &&
                    res.request().method() === "POST",
            );
            await page.click("#profile-generate");
            const resp = await generateResponse;
            assertEqual(resp.status(), 200, "Avatar generation response");
            await expectEnabled(page.locator("#profile-generate"));

            await expectVisible(page, "#profile-avatar-img");
            const assetId = await page.locator("#profile-avatar-asset").inputValue();
            if (!/^asset_[0-9a-f-]+$/i.test(assetId))
                throw new Error(`Invalid asset id: ${assetId}`);
            const previewSrc =
                (await page.locator("#profile-avatar-img").getAttribute("src")) ?? "";
            if (!previewSrc.includes(`/asset/${assetId}`)) {
                throw new Error(`Preview did not use generated asset: ${previewSrc}`);
            }
            assertEqual(
                await page.locator("#profile-btn").getAttribute("data-avatar"),
                "🖼️",
                "Profile button shows image avatar",
            );
            const repaintedAvatar = page.locator(".message--user .profile-avatar-img").first();
            await repaintedAvatar.waitFor({ state: "attached", timeout: 5000 });
            const repaintedAvatarSrc = (await repaintedAvatar.getAttribute("src")) ?? "";
            if (!repaintedAvatarSrc.includes(`/asset/${assetId}`)) {
                throw new Error(
                    `Existing user bubble did not repaint avatar: ${repaintedAvatarSrc}`,
                );
            }

            const profile = await page.evaluate(async () => {
                return (await (await fetch("/api/profile")).json()) as {
                    username: string;
                    avatar: { type: string; value: string };
                };
            });
            assertEqual(profile.username, "GamerKid", "Generated avatar kept profile username");
            assertEqual(profile.avatar.type, "asset", "Generated avatar profile type");
            assertEqual(profile.avatar.value, assetId, "Generated avatar profile asset id");

            const assets = await page.evaluate(async () => {
                return (await (await fetch("/assets")).json()) as {
                    assets: Array<{ id: string; type: string; tool_name: string; url: string }>;
                };
            });
            const asset = assets.assets.find((item) => item.id === assetId);
            if (!asset) throw new Error(`Generated avatar asset missing from /assets: ${assetId}`);
            assertEqual(asset.type, "image", "Generated avatar asset type");
            assertEqual(asset.tool_name, "generate_image", "Generated avatar tool name");
            assertEqual(asset.url, `/asset/${assetId}`, "Generated avatar asset URL");

            const imageCalls = getMinimaxMockCalls().filter((call) =>
                call.url.includes("/v1/image_generation"),
            );
            assertEqual(imageCalls.length, 1, "MiniMax image generation call count");
            const payload = JSON.parse(imageCalls[0].body) as {
                prompt: string;
                aspect_ratio: string;
            };
            assertEqual(payload.aspect_ratio, "1:1", "Avatar aspect ratio");
            if (!payload.prompt.includes("GamerKid") || !payload.prompt.includes("Minecraft")) {
                throw new Error(`Avatar prompt missed profile context: ${payload.prompt}`);
            }
            if (/data:image|base64/i.test(payload.prompt)) {
                throw new Error("Avatar prompt leaked raw asset data");
            }

            await page.click("#profile-close");
            await expectHidden(page, "#profile-modal");
            await page.evaluate(() => localStorage.clear());
            await page.reload();
            await waitForAppReady(page);
            await page.evaluate(() => {
                localStorage.setItem("hg_onboarding_done", "1");
                const onboarding = document.getElementById("onboarding");
                if (onboarding) onboarding.hidden = true;
            });

            const reloadedProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET",
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await reloadedProfileLoad;
            assertEqual(
                await page.locator("#profile-avatar-asset").inputValue(),
                assetId,
                "Generated avatar asset persisted after reload",
            );
            await expectVisible(page, "#profile-avatar-img");
            await page.click("#profile-close");
            await expectHidden(page, "#profile-modal");

            await page.fill("#chat-input", "Show my avatar test");
            await page.press("#chat-input", "Enter");
            const userAvatar = page.locator(".message--user .profile-avatar-img").first();
            await userAvatar.waitFor({ state: "attached", timeout: 5000 });
            const userAvatarSrc = (await userAvatar.getAttribute("src")) ?? "";
            if (!userAvatarSrc.includes(`/asset/${assetId}`)) {
                throw new Error(`User bubble did not use generated avatar: ${userAvatarSrc}`);
            }

            await page.close();
        },
        results,
    );

    // ── Report ────────────────────────────────────────────────────────

    console.log();
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    for (const result of results) {
        const icon = result.passed ? "✔" : "✖";
        const duration = result.duration.toFixed(0);
        console.log(`  ${icon} ${result.name} (${duration}ms)`);
        if (result.error) {
            console.log(`    ${result.error}`);
        }
    }

    console.log();
    console.log(`ℹ tests ${results.length}`);
    console.log(`ℹ pass ${passed}`);
    console.log(`ℹ fail ${failed}`);
    console.log(`ℹ duration_ms ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(0)}`);

    // ── Cleanup ───────────────────────────────────────────────────────

    await browser.close();
    await cleanup();

    process.exit(failed > 0 ? 1 : 0);
}

// ── Helpers: run + cleanup ───────────────────────────────────────────

async function cleanup(): Promise<void> {
    cleanupMinimaxMocks();
    try {
        await shutdown();
    } catch {
        // Ignore shutdown errors
    }
    resetStateForTesting();
    delete process.env.MINIMAX_API_KEY;
    delete process.env.DATA_DIR;

    // Clean up temp directory
    if (_tmpDir) {
        try {
            rmSync(_tmpDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}

async function runTest(
    name: string,
    fn: () => Promise<void>,
    results: TestResult[],
): Promise<void> {
    const start = performance.now();
    try {
        await fn();
        results.push({ name, passed: true, duration: performance.now() - start });
        console.log(`  ✔ ${name}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
            name,
            passed: false,
            error: msg,
            duration: performance.now() - start,
        });
        console.log(`  ✖ ${name}`);
        console.log(`    ${msg}`);
    }
}

// ── Run ──────────────────────────────────────────────────────────────

runE2ETests().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});

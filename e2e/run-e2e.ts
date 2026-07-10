#!/usr/bin/env node
// HallucyGenie E2E Test Runner
// Runs against the REAL server with MiniMax API mocked via nock.
// Architecture:
//   Browser → Real Server → Mocked MiniMax (nock)
//                ↓
//           Real SQLite (temp)

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, devices, firefox, type Page } from "playwright";

import { initDatabase, resetStateForTesting, shutdown, startServer } from "../src/server.ts";
import {
    cleanupMinimaxMocks,
    getMinimaxMockCalls,
    resetMinimaxMockCalls,
    setupMinimaxMocks
} from "./minimax-mock.ts";

const CHROMIUM_CANDIDATES = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
].filter((path): path is string => Boolean(path));

const CHROMIUM_PATH = CHROMIUM_CANDIDATES.find((path) => existsSync(path));
const E2E_BROWSER = parseBrowser(process.env.HG_E2E_BROWSER ?? "chromium");
const E2E_DEVICE = parseDevice(process.env.HG_E2E_DEVICE ?? "desktop");
const TEST_PORT = Number(process.env.HG_E2E_PORT ?? "3001");
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TINY_PNG = Buffer.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    0,
    0,
    0,
    13,
    73,
    72,
    68,
    82,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    8,
    6,
    0,
    0,
    0,
    31,
    21,
    196,
    137,
    0,
    0,
    0,
    13,
    73,
    68,
    65,
    84,
    120,
    156,
    99,
    248,
    15,
    4,
    0,
    9,
    251,
    3,
    253,
    167,
    95,
    88,
    29,
    0,
    0,
    0,
    0,
    73,
    69,
    78,
    68,
    174,
    66,
    96,
    130
]);

// ── Test framework ──────────────────────────────────────────────────

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

type E2EBrowser = "chromium" | "firefox";
type E2EDevice = "desktop" | "mobile";

function parseBrowser(value: string): E2EBrowser {
    if (value === "chromium" || value === "firefox") return value;
    throw new Error(`HG_E2E_BROWSER must be chromium or firefox, got ${value}`);
}

function parseDevice(value: string): E2EDevice {
    if (value === "desktop" || value === "mobile") return value;
    throw new Error(`HG_E2E_DEVICE must be desktop or mobile, got ${value}`);
}

async function newPage(
    browser: Browser,
    options?: Parameters<Browser["newPage"]>[0]
): Promise<Page> {
    const deviceOptions = E2E_DEVICE === "mobile" ? devices["Pixel 5"] : {};
    return await browser.newPage({ ...deviceOptions, ...options });
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected "${expected}", got "${actual}"`);
    }
}

async function expectVisible(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "visible", timeout: 5000 });
}

async function expectHidden(page: Page, selector: string): Promise<void> {
    const el = page.locator(selector);
    await el.waitFor({ state: "hidden", timeout: 5000 });
}

async function expectDisabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    await waitForEnabledState(locator, false);
}

async function expectEnabled(locator: ReturnType<Page["locator"]>): Promise<void> {
    await waitForEnabledState(locator, true);
}

async function waitForEnabledState(
    locator: ReturnType<Page["locator"]>,
    expected: boolean
): Promise<void> {
    for (let i = 0; i < 50; i++) {
        if ((await locator.isEnabled().catch(() => false)) === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Expected element to be ${expected ? "enabled" : "disabled"}`);
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
async function waitForApp(page: Page, options?: { dismissOnboarding?: boolean; }): Promise<void> {
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
    console.log(`   Browser: ${E2E_BROWSER}`);
    console.log(`   Device: ${E2E_DEVICE}`);
    if (E2E_BROWSER === "chromium") {
        console.log(`   Executable: ${CHROMIUM_PATH ?? "Playwright default"}`);
    }
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
        const browserType = E2E_BROWSER === "firefox" ? firefox : chromium;
        browser = await browserType.launch({
            ...(E2E_BROWSER === "chromium" && CHROMIUM_PATH
                ? { executablePath: CHROMIUM_PATH }
                : {}),
            headless: true,
            args: E2E_BROWSER === "chromium"
                ? [
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage"
                ]
                : []
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to launch ${E2E_BROWSER}:`, msg);
        await cleanup();
        process.exit(1);
    }

    const results: TestResult[] = [];

    // ── Existing Tests (fixed) ────────────────────────────────────────

    // Test 1: Page loads with correct title and elements
    await runTest(
        "page loads with correct title and elements",
        async () => {
            const page = await newPage(browser);
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
        results
    );

    await runTest(
        "core shell landmark IDs exist",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page);
            for (
                const selector of [
                    "#app",
                    "#connection-status",
                    "#onboarding-slides",
                    "#chat-form",
                    "#steer-hint",
                    "#steer-close",
                    "#error-toast-icon",
                    "#whats-new-title",
                    "#profile-title",
                    "#create-title",
                    "#create-tab-image",
                    "#create-tab-music",
                    "#create-tab-video",
                    "#create-tab-cover",
                    "#create-tab-voice",
                    "#create-tab-analyze",
                    "#create-tab-search",
                    "#create-tab-assets",
                    "#music-cover-title",
                    "#analyze-file-help",
                    "#assets-grid"
                ] as const
            ) {
                assertEqual(await page.locator(selector).count(), 1, `${selector} exists`);
            }
            await page.close();
        },
        results
    );

    // Test 2: Vendored fonts load from self and apply to real selectors
    await runTest(
        "vendored fonts load from self and apply",
        async () => {
            const page = await newPage(browser);
            const requests: string[] = [];
            const consoleMessages: string[] = [];
            page.on("request", (request) => requests.push(request.url()));
            page.on("console", (message) => consoleMessages.push(message.text()));

            await waitForApp(page);
            await page.evaluate(async () => {
                await document.fonts.ready;
            });

            const checks = await page.evaluate(() => ({
                pixelify: document.fonts.check("16px \"HG Pixelify Sans\""),
                roboto: document.fonts.check("16px \"HG Roboto Flex\""),
                playwrite: document.fonts.check("16px \"HG Playwrite DE SAS\""),
                header: getComputedStyle(document.querySelector(".header-title") as HTMLElement)
                    .fontFamily,
                assistant: getComputedStyle(
                    document.querySelector(".message--assistant .message-content") as HTMLElement
                ).fontFamily,
                input: getComputedStyle(document.querySelector("#chat-input") as HTMLElement)
                    .fontFamily
            }));

            if (!checks.pixelify) throw new Error("HG Pixelify Sans not loaded");
            if (!checks.roboto) throw new Error("HG Roboto Flex not loaded");
            if (!checks.playwrite) throw new Error("HG Playwrite DE SAS not loaded");
            if (!checks.header.includes("HG Pixelify Sans")) throw new Error(checks.header);
            if (!checks.assistant.includes("HG Roboto Flex")) throw new Error(checks.assistant);
            if (!checks.input.includes("HG Playwrite DE SAS")) throw new Error(checks.input);

            const googleFontRequest = requests.find(
                (url) => url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")
            );
            if (googleFontRequest) throw new Error(`External font request: ${googleFontRequest}`);

            const fontRequests = requests.filter((url) => url.includes("/fonts/"));
            if (fontRequests.length < 3) {
                throw new Error(`Expected 3 font requests, got ${fontRequests.length}`);
            }

            const cspMessage = consoleMessages.find((message) =>
                /content security policy|csp/i.test(message)
            );
            if (cspMessage) throw new Error(`CSP violation: ${cspMessage}`);

            await page.close();
        },
        results
    );

    // Test 3: Send button disabled when input is empty
    await runTest(
        "send button disabled when input is empty",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page);

            const sendBtn = page.locator("#send-button");
            await expectDisabled(sendBtn);

            await page.fill("#chat-input", "Hello");
            await expectEnabled(sendBtn);

            await page.fill("#chat-input", "");
            await expectDisabled(sendBtn);

            await page.close();
        },
        results
    );

    // Test 3: Enter key sends message (needs real server + mocked MiniMax)
    await runTest(
        "Enter key sends message",
        async () => {
            const page = await newPage(browser);
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
        results
    );

    // Test 4: Browser does not store session UUID
    await runTest(
        "session UUID is not stored in localStorage",
        async () => {
            const page = await newPage(browser);
            await page.goto(BASE_URL);
            await waitForAppReady(page);

            const keys = await page.evaluate(() => Object.keys(localStorage));
            if (keys.includes("hallucygenie_session_id")) {
                throw new Error("Unexpected session ID key");
            }

            await page.close();
        },
        results
    );

    // Test 5: Error toast appears and auto-dismisses
    await runTest(
        "error toast appears and auto-dismisses",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const toast = document.getElementById("error-toast") as HTMLElement;
                const msg = document.getElementById("error-toast-message") as HTMLElement;
                msg.textContent = "Test error";
                toast.hidden = false;
            });

            const toast = page.locator("#error-toast");
            await toast.waitFor({ state: "visible" });
            const text = await page.textContent("#error-toast-message");
            assertEqual(text, "Test error", "Error toast text");

            await page.close();
        },
        results
    );

    // Test 6: Lightbox opens and closes
    await runTest(
        "lightbox opens and closes",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const lightbox = document.getElementById("lightbox") as HTMLElement;
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
        results
    );

    await runTest(
        "Escape closes lightbox and open modals",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.evaluate(() => {
                const lightbox = document.getElementById("lightbox") as HTMLElement;
                const img = document.getElementById("lightbox-img") as HTMLImageElement;
                img.src =
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
                lightbox.hidden = false;
            });
            await expectVisible(page, "#lightbox");
            await page.keyboard.press("Escape");
            await expectHidden(page, "#lightbox");

            await page.click("#whats-new-btn");
            await expectVisible(page, "#whats-new-modal");
            await page.keyboard.press("Escape");
            await expectHidden(page, "#whats-new-modal");
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "whats-new-btn",
                "Escape restores What's New focus"
            );

            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await page.keyboard.press("Escape");
            await expectHidden(page, "#profile-modal");
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "profile-btn",
                "Escape restores profile focus"
            );

            await page.click("#create-btn");
            await expectVisible(page, "#create-modal");
            await page.keyboard.press("Escape");
            await expectHidden(page, "#create-modal");
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "create-btn",
                "Escape restores Create focus"
            );

            await page.close();
        },
        results
    );

    // Test 7: Mobile viewport
    await runTest(
        "mobile viewport (375x812)",
        async () => {
            const page = await newPage(browser, { viewport: { width: 375, height: 812 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");
            await expectVisible(page, "#message-list");

            await page.close();
        },
        results
    );

    // Test 8: Desktop viewport
    await runTest(
        "desktop viewport (1280x800)",
        async () => {
            const page = await newPage(browser, { viewport: { width: 1280, height: 800 } });
            await waitForApp(page);

            await expectVisible(page, "#header");
            await expectVisible(page, "#input-area");

            await page.close();
        },
        results
    );

    await runTest(
        "thinking indicator does not shift long scrollback layout",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            await page.evaluate(() => {
                const originalFetch = fetch.bind(globalThis);
                globalThis.fetch = async (input, init) => {
                    const url = new URL(
                        input instanceof Request ? input.url : String(input),
                        location.href
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
                                                "data: {\"delta\":\"Layout stable\"}\n\n"
                                            )
                                        ),
                                    150
                                );
                                setTimeout(() => {
                                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                                    controller.close();
                                }, 1000);
                            }
                        }),
                        { status: 200, headers: { "Content-Type": "text/event-stream" } }
                    );
                };
                const list = document.querySelector("#message-list") as HTMLElement;
                list.innerHTML = Array.from(
                    { length: 36 },
                    (_, i) => `
                            <div class="message message--assistant">
                                <div class="message-avatar" aria-hidden="true">🧞</div>
                                <div class="message-bubble"><div class="message-content">Long history row ${
                        i + 1
                    }</div></div>
                            </div>`
                ).join("");
                list.scrollTop = list.scrollHeight;
            });

            const measure = async () =>
                page.evaluate(() => {
                    const rect = (selector: string) => {
                        const r = document.querySelector(selector)?.getBoundingClientRect();
                        return {
                            top: Math.round(r.top),
                            bottom: Math.round(r.bottom),
                            height: Math.round(r.height)
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
                        typingVisible: typing.classList.contains("is-visible")
                    };
                });

            const before = await measure();
            await page.fill("#chat-input", "Check layout stability");
            await page.press("#chat-input", "Enter");
            await page.waitForSelector("#typing-indicator.is-visible", { timeout: 5000 });
            await expectVisible(page, "#steer-hint");
            await page.click("#steer-close");
            await expectHidden(page, "#steer-hint");
            const duringThinking = await measure();
            await page.waitForFunction(
                () => {
                    const list = document.querySelector("#message-list") as HTMLElement;
                    return (
                        document
                            .querySelector(".message--assistant:last-child .message-content")
                            ?.textContent?.includes("Layout stable")
                        && document
                            .querySelector("#typing-indicator")
                            ?.classList.contains("is-visible")
                        && list.scrollHeight - list.clientHeight - list.scrollTop <= 1
                    );
                },
                null,
                { timeout: 5000 }
            );
            await page.waitForTimeout(100);
            const beforeDone = await measure();
            await page.waitForFunction(
                () =>
                    !document
                        .querySelector("#typing-indicator")
                        ?.classList.contains("is-visible"),
                null,
                { timeout: 5000 }
            );
            await page.waitForTimeout(100);
            const afterDone = await measure();

            if (Math.abs(before.list.bottom - before.input.top) > 1) {
                throw new Error(
                    `Message list does not reach input area: ${before.list.bottom} != ${before.input.top}`
                );
            }
            for (const key of ["top", "bottom", "height"] as const) {
                assertEqual(
                    duringThinking.list[key],
                    before.list[key],
                    `message list ${key} during thinking`
                );
                assertEqual(
                    beforeDone.list[key],
                    before.list[key],
                    `message list ${key} before done`
                );
                assertEqual(
                    afterDone.list[key],
                    before.list[key],
                    `message list ${key} after done`
                );
                assertEqual(
                    afterDone.input[key],
                    before.input[key],
                    `input area ${key} after done`
                );
                assertEqual(
                    afterDone.lastMessage[key],
                    beforeDone.lastMessage[key],
                    `last assistant message ${key} after indicator hides`
                );
            }
            assertEqual(
                afterDone.scrollHeight,
                beforeDone.scrollHeight,
                "Scroll height after indicator hides"
            );
            assertEqual(
                duringThinking.typingHidden,
                false,
                "Typing indicator hidden attr during"
            );
            assertEqual(
                duringThinking.typingAriaHidden,
                "false",
                "Typing indicator aria during"
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
                "Assistant response after layout check"
            );
            await page.close();
        },
        results
    );

    // Test 9: Auto-resize textarea
    await runTest(
        "textarea auto-resizes with content",
        async () => {
            const page = await newPage(browser);
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
        results
    );

    // Test 10: Steering message renders with distinct style
    await runTest(
        "steer message renders with distinct style",
        async () => {
            const page = await newPage(browser);
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
                document.getElementById("message-list")?.appendChild(msg);
            });

            const steerMsg = page.locator(".message--steer");
            await steerMsg.waitFor({ timeout: 5000 });
            const count = await steerMsg.count();
            if (count === 0) throw new Error("Steer message not found");

            const content = await page.textContent(".message--steer .message-content");
            assertEqual(content, "Steer test", "Steer message content");

            await page.close();
        },
        results
    );

    // ── New Tests ─────────────────────────────────────────────────────

    // Test 11: Onboarding completes and hides
    await runTest(
        "onboarding reaches every slide and completes",
        async () => {
            const page = await newPage(browser);
            await page.goto(BASE_URL);
            await waitForAppReady(page);

            const onboarding = page.locator("#onboarding");
            await onboarding.waitFor({ state: "visible", timeout: 10000 });
            await expectVisible(page, ".onboarding-slide[data-slide='0'].active");

            await page.click(".onboarding-slide[data-slide='0'] .onboarding-next");
            await expectVisible(
                page,
                ".onboarding-slide[data-slide='1'].active #onboarding-try-chat"
            );
            await page.click(".onboarding-slide[data-slide='1'] .onboarding-next");
            await expectVisible(
                page,
                ".onboarding-slide[data-slide='2'].active #onboarding-try-create"
            );
            await page.click(".onboarding-slide[data-slide='2'] .onboarding-next");
            await expectVisible(page, ".onboarding-slide[data-slide='3'].active #onboarding-done");
            await page.click("#onboarding-done");

            await onboarding.waitFor({ state: "hidden", timeout: 5000 });
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "chat-input",
                "Done focuses chat"
            );

            await page.close();
        },
        results
    );

    await runTest(
        "onboarding CTAs start chat and create flows",
        async () => {
            const chatPage = await newPage(browser);
            await chatPage.goto(BASE_URL);
            await waitForAppReady(chatPage);
            await chatPage.waitForSelector("#onboarding", { state: "visible", timeout: 10000 });
            await chatPage.click(".onboarding-slide[data-slide='0'] .onboarding-next");
            await chatPage.click("#onboarding-try-chat");
            await expectHidden(chatPage, "#onboarding");
            assertEqual(
                await chatPage.locator("#chat-input").inputValue(),
                "What are the top 3 gaming tips for a beginner?",
                "Try chat prefilled prompt"
            );
            assertEqual(
                await chatPage.evaluate(() => document.activeElement?.id),
                "chat-input",
                "Try chat focuses input"
            );
            await chatPage.close();

            const createPage = await newPage(browser);
            await createPage.goto(BASE_URL);
            await waitForAppReady(createPage);
            await createPage.waitForSelector("#onboarding", { state: "visible", timeout: 10000 });
            await createPage.click(".onboarding-slide[data-slide='0'] .onboarding-next");
            await createPage.click(".onboarding-slide[data-slide='1'] .onboarding-next");
            await createPage.click("#onboarding-try-create");
            await expectHidden(createPage, "#onboarding");
            await expectVisible(createPage, "#create-modal");
            assertEqual(
                await createPage.evaluate(() => document.activeElement?.id),
                "create-close",
                "Try create focuses modal close"
            );
            await createPage.close();
        },
        results
    );

    // Test 13: Create modal opens and shows tabs
    await runTest(
        "create modal opens and shows tabs",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "visible" });

            await expectVisible(page, ".create-tab[data-tab='image']");
            await expectVisible(page, ".create-tab[data-tab='music']");
            await expectVisible(page, ".create-tab[data-tab='cover']");
            await expectVisible(page, ".create-tab[data-tab='video']");
            await expectVisible(page, ".create-tab[data-tab='voice']");
            await expectVisible(page, ".create-tab[data-tab='analyze']");
            await expectVisible(page, ".create-tab[data-tab='search']");
            await expectVisible(page, ".create-tab[data-tab='assets']");

            await page.close();
        },
        results
    );

    await runTest(
        "create image keeps related helper text near its control",
        async () => {
            const page = await newPage(browser);
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
                if (!label || !help || !action) {
                    throw new Error("Missing Create image spacing controls");
                }
                return {
                    labelBottom: label.bottom,
                    helpTop: help.top,
                    helpBottom: help.bottom,
                    actionTop: action.top
                };
            });
            const relatedGap = boxes.helpTop - boxes.labelBottom;
            const actionGap = boxes.actionTop - boxes.helpBottom;
            if (relatedGap > 8) {
                throw new Error(
                    `Create image help too far from checkbox: ${JSON.stringify(boxes)}`
                );
            }
            if (actionGap <= relatedGap * 2) {
                throw new Error(
                    `Create image action too close to helper text: ${JSON.stringify(boxes)}`
                );
            }

            await page.close();
        },
        results
    );

    await runTest(
        "assets tab starts with empty state",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='assets']");
            await expectVisible(page, "#assets-panel");
            await expectVisible(page, "#assets-empty");

            await page.close();
        },
        results
    );

    await runTest(
        "create image surprise code can roll clear and submit seed",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='image']");
            await expectDisabled(page.locator("#img-seed-clear"));

            await page.click("#img-seed-random");
            const firstSeed = await page.inputValue("#img-seed");
            if (!/^\d+$/.test(firstSeed)) throw new Error(`Invalid rolled seed: ${firstSeed}`);
            await expectEnabled(page.locator("#img-seed-clear"));
            await page.selectOption("#img-ratio", "1:1");
            await page.selectOption("#img-size", "small");
            assertEqual(await page.inputValue("#img-width"), "1024", "Small square image width");
            assertEqual(await page.inputValue("#img-height"), "1024", "Small square image height");
            assertEqual(await page.inputValue("#img-size"), "small", "Image size selection");
            assertEqual(await page.inputValue("#img-ratio"), "1:1", "Image ratio selection");
            assertEqual(
                (await page.locator("#img-seed-status").textContent())?.trim(),
                `Surprise code: ${firstSeed}`,
                "Rolled surprise code status"
            );

            await page.selectOption("#img-count", "2");
            assertEqual(
                (await page.locator("#img-seed-status").textContent())?.trim(),
                "Surprise code is off for multiple pictures so each one is different.",
                "Multiple image surprise code status"
            );

            await page.click("#img-seed-clear");
            assertEqual(await page.inputValue("#img-seed"), "", "Cleared surprise code");
            await expectDisabled(page.locator("#img-seed-clear"));

            await page.selectOption("#img-count", "");
            await page.click("#img-seed-random");
            const submittedSeed = await page.inputValue("#img-seed");
            await page.fill("#img-prompt", "seeded pixel castle");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#img-submit");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "generate_image", "Seeded image create tool");
            assertEqual(requestBody.input.prompt, "seeded pixel castle", "Seeded image prompt");
            assertEqual(requestBody.input.seed, Number(submittedSeed), "Submitted image seed");
            if ("n" in requestBody.input) throw new Error("Single seeded image should omit n");

            await expectVisible(page, ".tool-card:has(.tool-result-image)");
            const imageCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/image_generation")
            );
            if (!imageCall) throw new Error("MiniMax image generation was not called");
            assertEqual(
                JSON.parse(imageCall.body).seed,
                Number(submittedSeed),
                "MiniMax image seed"
            );

            await page.close();
        },
        results
    );

    await runTest(
        "create image reference upload and prompt optimizer reach provider",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='image']");
            const uploadResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/reference-image")
                    && res.request().method() === "POST"
            );
            await page.setInputFiles("#img-reference-file", {
                name: "reference.png",
                mimeType: "image/png",
                buffer: TINY_PNG
            });
            assertEqual((await uploadResponse).status(), 200, "Reference upload response");
            await page.waitForFunction(
                () =>
                    document.querySelector("#img-reference-status")?.textContent
                        === "Reference ready. Genie will keep the same character/photo."
            );
            await expectVisible(page, "#img-reference-preview img");
            await expectEnabled(page.locator("#img-reference-clear"));
            await page.click("#img-reference-clear");
            assertEqual(
                await page.inputValue("#img-reference-asset"),
                "",
                "Cleared reference asset"
            );
            await expectDisabled(page.locator("#img-reference-clear"));

            const secondUploadResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/reference-image")
                    && res.request().method() === "POST"
            );
            await page.setInputFiles("#img-reference-file", {
                name: "reference.png",
                mimeType: "image/png",
                buffer: TINY_PNG
            });
            assertEqual(
                (await secondUploadResponse).status(),
                200,
                "Second reference upload response"
            );
            await expectVisible(page, "#img-reference-preview img");
            const referenceAssetId = await page.inputValue("#img-reference-asset");
            if (!referenceAssetId.startsWith("asset_")) {
                throw new Error(`Reference asset id missing: ${referenceAssetId}`);
            }

            await page.fill("#img-prompt", "same hero in a neon arcade");
            await page.selectOption("#img-ratio", "16:9");
            await page.selectOption("#img-size", "small");
            assertEqual(await page.inputValue("#img-width"), "1024", "Reference image width");
            assertEqual(await page.inputValue("#img-height"), "576", "Reference image height");
            await page.check("#img-prompt-optimizer");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#create-image-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "generate_image", "Reference image create tool");
            assertEqual(requestBody.input.prompt_optimizer, true, "Create prompt optimizer");
            assertEqual(requestBody.input.width, 1024, "Create image width");
            assertEqual(requestBody.input.height, 576, "Create image height");
            assertEqual(
                requestBody.input.reference_asset_id,
                referenceAssetId,
                "Create reference asset id"
            );
            await page.locator(".tool-card:has(.tool-result-image)").last().waitFor({
                state: "visible"
            });

            const imageCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/image_generation")
            );
            if (!imageCall) throw new Error("MiniMax image generation was not called");
            const payload = JSON.parse(imageCall.body);
            assertEqual(payload.prompt_optimizer, true, "MiniMax prompt optimizer");
            assertEqual(payload.width, 1024, "MiniMax image width");
            assertEqual(payload.height, 576, "MiniMax image height");
            if (
                !Array.isArray(payload.subject_reference) || payload.subject_reference.length !== 1
            ) {
                throw new Error("MiniMax subject reference missing");
            }
            assertEqual(payload.subject_reference[0].type, "character", "Subject reference type");
            if (
                !String(payload.subject_reference[0].image_file ?? "").startsWith(
                    "data:image/png;base64,"
                )
            ) {
                throw new Error("Subject reference did not use stored PNG asset data URL");
            }

            await page.close();
        },
        results
    );

    await runTest(
        "create image renders chat lightbox and asset previews",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='image']");
            await page.fill("#img-prompt", "a neon fox gamer logo");
            await page.click("#create-image-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const imageGrid = page.locator(".tool-result-image-grid").last();
            await imageGrid.waitFor({ state: "visible" });
            await imageGrid.locator(".tool-result-image").first().waitFor({ state: "visible" });

            await imageGrid.locator(".tool-result-image").first().click();
            await expectVisible(page, "#lightbox");
            if (
                !String(await page.locator("#lightbox-img").getAttribute("src")).includes("/asset/")
            ) {
                throw new Error("Chat image lightbox did not use stored asset URL");
            }
            await page.click(".lightbox-close");
            await expectHidden(page, "#lightbox");

            await page.click("#create-btn");
            await expectVisible(page, "#create-modal");
            await page.click(".create-tab[data-tab='assets']");
            await page
                .locator(".asset-card[data-type='image']")
                .first()
                .waitFor({ state: "visible" });
            const thumbSrc = await page
                .locator(".asset-card[data-type='image'] .asset-thumb")
                .first()
                .getAttribute("src");
            if (!String(thumbSrc).startsWith("/asset/asset_")) {
                throw new Error(`Asset thumbnail did not use stored asset URL: ${thumbSrc}`);
            }
            const assetCard = page.locator(".asset-card[data-type='image']").first();
            const referenceAssetId = (await assetCard.getAttribute("data-id")) ?? "";
            if (!referenceAssetId.startsWith("asset_")) {
                throw new Error(`Image asset missing stable id: ${referenceAssetId}`);
            }
            await assetCard.locator(".asset-use-reference").click();
            await expectVisible(page, "#create-image-form");
            assertEqual(
                await page.inputValue("#img-reference-asset"),
                referenceAssetId,
                "Asset library reference id"
            );
            await expectVisible(page, "#img-reference-preview img");
            assertEqual(
                (await page.locator("#img-reference-status").textContent())?.trim(),
                "Reference ready. Genie will keep the same character/photo.",
                "Asset library reference status"
            );

            await page.close();
        },
        results
    );

    await runTest(
        "create analyze uploads local image safely",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='analyze']");
            await expectVisible(page, "#create-analyze-form");

            const uploadResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/analyze-image") && res.request().method() === "POST"
            );
            const analyzeChooser = page.waitForEvent("filechooser");
            await page.click("#analyze-dropzone");
            await (await analyzeChooser).setFiles({
                name: "pixel.png",
                mimeType: "image/png",
                buffer: TINY_PNG
            });
            assertEqual((await uploadResponse).status(), 200, "Analyze upload response");
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent
                        === "Selected pixel.png"
            );

            const previewSrc = (await page.locator("#analyze-file-preview img").getAttribute("src"))
                ?? "";
            if (!previewSrc.startsWith("/asset/asset_")) {
                throw new Error(`Analyze preview did not use stored asset: ${previewSrc}`);
            }
            if (/data:image|base64/i.test(previewSrc)) {
                throw new Error("Preview leaked raw image data");
            }

            await page.fill("#analyze-prompt", "What color is this pixel?");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#create-analyze-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            if (requestBody.tool_name !== "analyze_image") {
                throw new Error(
                    `Analyze used wrong endpoint payload: ${JSON.stringify(requestBody)}`
                );
            }
            if (!String(requestBody.input?.image_url ?? "").startsWith("/asset/asset_")) {
                throw new Error(
                    `Analyze payload missed asset URL: ${JSON.stringify(requestBody)}`
                );
            }
            const userText =
                (await page.locator(".message--user .message-content").last().textContent()) ?? "";
            if (!userText.includes("Analyze image: What color is this pixel?")) {
                throw new Error(`Analyze user message missed kid-safe label: ${userText}`);
            }
            if (/Use analyze_image|Tool params|data:image|base64/i.test(userText)) {
                throw new Error(`Analyze message leaked internals: ${userText}`);
            }

            await page.close();
        },
        results
    );

    await runTest(
        "create analyze handles file edges",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='analyze']");
            await expectVisible(page, "#create-analyze-form");

            await page.evaluate(() => {
                const file = new File(["BM"], "bad.bmp", { type: "image/bmp" });
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                document.querySelector("#analyze-dropzone")?.dispatchEvent(
                    new DragEvent("drop", {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer
                    })
                );
            });
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent
                        === "Use a PNG, JPG, GIF, or WebP image."
            );
            await expectHidden(page, "#analyze-file-preview img");

            await page.setInputFiles("#analyze-file", {
                name: "pixel.png",
                mimeType: "image/png",
                buffer: TINY_PNG
            });
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent
                        === "Selected pixel.png"
            );
            await expectVisible(page, "#analyze-file-preview img");

            await page.fill("#analyze-url", "https://example.com/fallback.png");
            await page.waitForFunction(
                () =>
                    document.querySelector("#analyze-file-status")?.textContent
                        === "Using image URL fallback."
            );
            await expectHidden(page, "#analyze-file-preview img");

            await page.close();
        },
        results
    );

    await runTest(
        "create video sends duration and renders asset",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='video']");
            await page.fill("#video-prompt", "pixel kart victory lap");
            await page.selectOption("#video-duration", "10");
            await page.selectOption("#video-resolution", "1080p");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#create-video-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "generate_video", "Video create tool");
            assertEqual(requestBody.input.prompt, "pixel kart victory lap", "Video prompt");
            assertEqual(requestBody.input.duration, 10, "Video duration");
            assertEqual(requestBody.input.resolution, "1080p", "Video resolution");
            await expectVisible(page, ".tool-card:has(.tool-result-video)");
            const src = (await page.locator(".tool-result-video").getAttribute("src")) ?? "";
            if (!src.startsWith("/asset/asset_")) throw new Error(`Video src not stored: ${src}`);

            const videoCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/video_generation")
            );
            if (!videoCall) throw new Error("MiniMax video generation was not called");
            const payload = JSON.parse(videoCall.body);
            assertEqual(payload.duration, 10, "MiniMax video duration");
            assertEqual(payload.resolution, "1080P", "MiniMax video resolution");

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='video']");
            const recent = page.locator(".create-recent[data-kind='video']");
            await recent.locator(".recent-button", { hasText: "pixel kart victory lap" }).waitFor({
                state: "visible"
            });
            await page.fill("#video-prompt", "");
            await page.selectOption("#video-duration", "6");
            await page.selectOption("#video-resolution", "768p");
            await recent.locator(".recent-button", { hasText: "pixel kart victory lap" }).click();
            assertEqual(
                await page.inputValue("#video-prompt"),
                "pixel kart victory lap",
                "Recent video prompt"
            );
            assertEqual(await page.inputValue("#video-duration"), "10", "Recent video duration");
            assertEqual(
                await page.inputValue("#video-resolution"),
                "1080p",
                "Recent video resolution"
            );
            await recent.locator(".recent-remove").first().click();
            await recent.locator(".recent-button", { hasText: "pixel kart victory lap" }).waitFor({
                state: "hidden"
            });

            await page.close();
        },
        results
    );

    await runTest(
        "create search renders result without internals",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='search']");
            await page.fill("#search-query", "minecraft build ideas");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#create-search-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "web_search", "Search create tool");
            assertEqual(requestBody.input.query, "minecraft build ideas", "Search query");
            await expectVisible(page, ".tool-card:has-text('Test Result')");
            const userText =
                (await page.locator(".message--user .message-content").last().textContent()) ?? "";
            if (/Use web_search|Tool params:/i.test(userText)) {
                throw new Error(`Search message leaked internals: ${userText}`);
            }
            const searchCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/coding_plan/search")
            );
            if (!searchCall) throw new Error("MiniMax web search was not called");

            await page.close();
        },
        results
    );

    await runTest(
        "create music uses structured multiline lyrics",
        async () => {
            const page = await newPage(browser, { viewport: { width: 1280, height: 800 } });
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            await expectVisible(page, "#create-music-form");
            await page.fill("#music-prompt", "boss fight intro");
            const lyrics = "Verse one, comma stays\nChorus line, also stays";
            await page.fill("#music-lyrics", lyrics);
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
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
                const row = document.querySelector(
                    ".message--assistant:has(.tool-result-audio)"
                ) as HTMLElement;
                const bubble = row.querySelector(".message-bubble") as HTMLElement;
                const card = row.querySelector(".tool-card") as HTMLElement;
                return {
                    row: row.getBoundingClientRect().width,
                    bubble: bubble.getBoundingClientRect().width,
                    card: card.getBoundingClientRect().width
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
        results
    );

    await runTest(
        "cover direct URL preprocess fills cover feature id",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='cover']");
            await expectVisible(page, "#create-cover-form");
            await page.selectOption("#cover-source-kind", "direct");
            await page.fill("#cover-audio-url", "https://example.com/source-song.mp3");
            const preprocessRequest = page.waitForRequest(
                (req) =>
                    req.url().includes("/api/music-cover/preprocess") && req.method() === "POST"
            );
            await page.click("#cover-preprocess");
            await preprocessRequest;
            await page.waitForFunction(
                () =>
                    (document.querySelector("#cover-feature-id") as HTMLInputElement)?.value
                        === "cover-e2e-1"
            );
            assertEqual(
                await page.inputValue("#cover-feature-id"),
                "cover-e2e-1",
                "Cover feature id field"
            );
            const minimaxCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/music_cover_preprocess")
            );
            if (!minimaxCall) throw new Error("MiniMax cover preprocess was not called");
            const payload = JSON.parse(minimaxCall.body);
            assertEqual(
                payload.audio_url,
                "https://example.com/source-song.mp3",
                "Cover audio URL"
            );
            if (payload.audio_base64) {
                throw new Error(
                    `Direct cover preprocess should not upload audio bytes: ${minimaxCall.body}`
                );
            }

            await page.close();
        },
        results
    );

    await runTest(
        "cover song uses separate tab and local file source",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='cover']");
            await expectVisible(page, "#create-cover-form");
            await expectHidden(page, "#create-music-form #cover-source-kind");
            await page.selectOption("#cover-source-kind", "direct");
            await page.setInputFiles("#cover-audio-file", {
                name: "song.mp3",
                mimeType: "audio/mpeg",
                buffer: Buffer.from("fake-audio")
            });
            assertEqual(
                await page.locator("#cover-source-kind").inputValue(),
                "upload",
                "Cover source switches to upload"
            );
            resetMinimaxMockCalls();
            const preprocessRequest = page.waitForRequest(
                (req) =>
                    req.url().includes("/api/music-cover/preprocess") && req.method() === "POST"
            );
            await page.click("#cover-preprocess");
            await preprocessRequest;
            await page.waitForFunction(
                () =>
                    (document.querySelector("#cover-status")?.textContent ?? "").includes(
                        "Ready"
                    )
                    && (
                        document.querySelector("#cover-lyrics") as HTMLTextAreaElement | null
                    )?.value.includes("Verse, cover ready")
            );
            const minimaxCall = getMinimaxMockCalls().find((call) =>
                call.url.includes("/v1/music_cover_preprocess")
            );
            if (!minimaxCall) throw new Error("MiniMax cover preprocess was not called");
            const payload = JSON.parse(minimaxCall.body);
            if (!payload.audio_base64 || payload.audio_url) {
                throw new Error(
                    `Cover preprocess did not use uploaded audio: ${minimaxCall.body}`
                );
            }

            await page.fill("#cover-style", "glitchy chiptune boss remix");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#cover-generate");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "generate_music_cover", "Cover create tool");
            assertEqual(
                requestBody.input.prompt,
                "glitchy chiptune boss remix",
                "Cover prompt"
            );
            assertEqual(requestBody.input.cover_feature_id, "cover-e2e-1", "Cover feature id");
            if (!String(requestBody.input.lyrics ?? "").includes("Verse, cover ready")) {
                throw new Error(`Cover lyrics missing: ${JSON.stringify(requestBody)}`);
            }
            const userText =
                (await page.locator(".message--user .message-content").last().textContent()) ?? "";
            if (/Use generate_music_cover|Tool params:/i.test(userText)) {
                throw new Error(`Cover message leaked internals: ${userText}`);
            }
            await page.locator(".tool-card:has(.tool-result-audio)").last().waitFor({
                state: "visible"
            });

            await page.close();
        },
        results
    );

    await runTest(
        "voice composer inserts pause and interjection tags then submits speech",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='voice']");
            await page.fill("#voice-text", "hello world");
            await page.locator("#voice-text").evaluate((el) => {
                const input = el as HTMLTextAreaElement;
                input.selectionStart = 5;
                input.selectionEnd = 5;
            });
            await page.selectOption("#voice-pause-duration", "2");
            await page.click("#voice-insert-pause");
            assertEqual(
                (await page.locator("#voice-composer-status").textContent())?.trim(),
                "Inserted 2 sec pause.",
                "Voice pause status"
            );
            await page.selectOption("#voice-interjection", "laughs");
            await page.click("#voice-insert-interjection");
            const value = await page.locator("#voice-text").inputValue();
            if (!value.includes("<#2#>") || !value.includes("(laughs)")) {
                throw new Error(`Voice composer did not insert tags: ${value}`);
            }
            if (value.includes("<laugh")) {
                throw new Error(`Voice composer inserted old interjection syntax: ${value}`);
            }

            resetMinimaxMockCalls();
            await page.selectOption("#voice-speed", "1.2");
            await page.selectOption("#voice-id", "German_FriendlyMan");
            await page.fill("#voice-volume", "1.2");
            await page.fill("#voice-pitch", "2");
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.click("#create-voice-form button[type='submit']");
            await expectHidden(page, "#create-modal");
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "text_to_speech", "Voice create tool");
            assertEqual(requestBody.input.text, value, "Voice text");
            assertEqual(requestBody.input.speed, 1.2, "Voice speed");
            assertEqual(requestBody.input.voice_id, "German_FriendlyMan", "Voice id");
            assertEqual(requestBody.input.volume, 1.2, "Voice volume");
            assertEqual(requestBody.input.pitch, 2, "Voice pitch");
            await page.locator(".tool-card:has(.tool-result-audio)").last().waitFor({
                state: "visible"
            });
            const ttsCall = getMinimaxMockCalls().find((call) => call.url.includes("/v1/t2a_v2"));
            if (!ttsCall) throw new Error("MiniMax TTS was not called");
            const payload = JSON.parse(ttsCall.body);
            assertEqual(payload.text, value, "MiniMax TTS text");
            assertEqual(payload.voice_setting.voice_id, "German_FriendlyMan", "MiniMax voice id");
            assertEqual(payload.voice_setting.speed, 1.2, "MiniMax voice speed");
            assertEqual(payload.voice_setting.vol, 1.2, "MiniMax voice volume");
            assertEqual(payload.voice_setting.pitch, 2, "MiniMax voice pitch");

            await page.close();
        },
        results
    );

    await runTest(
        "chat image paste uploads asset and analyzes without raw data",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const uploadRequest = page.waitForRequest(
                (req) => req.url().includes("/api/analyze-image") && req.method() === "POST"
            );
            const createToolRequest = page.waitForRequest(
                (req) => req.url().includes("/api/create-tool") && req.method() === "POST"
            );
            await page.evaluate((bytes) => {
                const file = new File([new Uint8Array(bytes)], "paste.png", {
                    type: "image/png"
                });
                const event = new Event("paste", { bubbles: true, cancelable: true });
                Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
                document.querySelector("#chat-input")?.dispatchEvent(event);
            }, Array.from(TINY_PNG));
            await uploadRequest;
            const requestBody = JSON.parse((await createToolRequest).postData() ?? "{}");
            assertEqual(requestBody.tool_name, "analyze_image", "Pasted image tool");
            if (!String(requestBody.input?.image_url ?? "").startsWith("/asset/asset_")) {
                throw new Error(
                    `Pasted image did not use saved asset: ${JSON.stringify(requestBody)}`
                );
            }
            if (JSON.stringify(requestBody).includes("data:image")) {
                throw new Error(`Pasted image leaked raw bytes: ${JSON.stringify(requestBody)}`);
            }
            await expectVisible(page, ".message--user:has-text('Analyze pasted image')");

            await page.close();
        },
        results
    );

    await runTest(
        "chat and unsent create drafts survive reload",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const chatDraftSaved = page.waitForResponse(
                (res) => res.url().includes("/api/draft/chat") && res.request().method() === "PUT"
            );
            await page.fill("#chat-input", "remember this chat draft");
            await chatDraftSaved;

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='video']");
            await page.fill("#video-prompt", "draft neon dragon loop");
            await page.selectOption("#video-duration", "10");
            const createDraftSaved = page.waitForResponse(
                (res) => res.url().includes("/api/draft/create") && res.request().method() === "PUT"
            );
            await page.selectOption("#video-resolution", "1080p");
            await createDraftSaved;

            await page.reload();
            await waitForAppReady(page);
            await page.waitForFunction(
                () =>
                    (document.querySelector("#chat-input") as HTMLTextAreaElement | null)?.value
                        === "remember this chat draft"
            );
            await page.click("#create-btn");
            await expectVisible(page, "#create-video-form");
            assertEqual(
                await page.locator("#video-prompt").inputValue(),
                "draft neon dragon loop",
                "Video draft prompt"
            );
            assertEqual(
                await page.locator("#video-duration").inputValue(),
                "10",
                "Video draft duration"
            );
            assertEqual(
                await page.locator("#video-resolution").inputValue(),
                "1080p",
                "Video draft resolution"
            );

            await page.close();
        },
        results
    );

    await runTest(
        "write lyrics draft survives reload",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            await page.fill("#music-prompt", "victory song");
            const createToolResponse = page.waitForResponse(
                (res) => res.url().includes("/api/create-tool") && res.request().method() === "POST"
            );
            await page.click("#write-lyrics-btn");
            assertEqual((await createToolResponse).status(), 200, "Lyrics create tool response");
            await page.waitForFunction(() =>
                (
                    document.querySelector("#music-lyrics") as HTMLTextAreaElement | null
                )?.value.includes("Verse one, game on")
            );
            await page.reload();
            await waitForAppReady(page);
            await page.click("#create-btn");
            await page.click(".create-tab[data-tab='music']");
            const lyrics = await page.locator("#music-lyrics").inputValue();
            if (
                !lyrics.includes("Verse one, game on")
                || !lyrics.includes("Chorus, win the fight")
            ) {
                throw new Error(`Generated lyrics draft did not survive reload: ${lyrics}`);
            }

            await page.close();
        },
        results
    );

    // Test 15: Create modal closes
    await runTest(
        "create modal closes",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#create-btn");
            await page.waitForSelector("#create-modal", { state: "visible" });

            await page.click("#create-close");
            const modal = page.locator("#create-modal");
            await modal.waitFor({ state: "hidden" });

            await page.close();
        },
        results
    );

    await runTest(
        "whats new modal opens closes and restores focus",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            await page.click("#whats-new-btn");
            await expectVisible(page, "#whats-new-modal");
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "whats-new-close",
                "Whats new focus"
            );
            await page.click("#whats-new-close");
            await expectHidden(page, "#whats-new-modal");
            assertEqual(
                await page.evaluate(() => document.activeElement?.id),
                "whats-new-btn",
                "Whats new restored focus"
            );
            await page.click("#whats-new-btn");
            await page.mouse.click(10, 10);
            await expectHidden(page, "#whats-new-modal");

            await page.close();
        },
        results
    );

    // Test 16: Quota badge shows in header
    await runTest(
        "quota badge shows in header",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            // Wait for quota badge to be populated (async fetch from /api/quota)
            const badge = page.locator("#quota-badge");
            await badge.waitFor({ state: "visible", timeout: 5000 });

            await expectVisible(page, ".quota-item[data-type='general']");
            await expectVisible(page, ".quota-item[data-type='video']");

            await page.close();
        },
        results
    );

    await runTest(
        "profile avatar generate button stays near avatar",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
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
                    saveTop: save.top
                };
            });
            if (Math.abs(boxes.avatarCenterY - boxes.generateCenterY) > 80) {
                throw new Error(`Generate avatar too far from avatar: ${JSON.stringify(boxes)}`);
            }
            if (boxes.saveTop <= boxes.generateCenterY) {
                throw new Error(
                    `Save action should stay below avatar group: ${JSON.stringify(boxes)}`
                );
            }

            await page.close();
        },
        results
    );

    await runTest(
        "sessions isolate chat history when switching",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const startCount = await page.locator("#session-select option").count();
            const sessionACreated = page.waitForResponse(
                (res) => res.url().includes("/api/sessions") && res.request().method() === "POST"
            );
            await page.click("#session-new");
            await sessionACreated;
            await page.waitForFunction(
                (count) => document.querySelectorAll("#session-select option").length > count,
                startCount
            );
            const sessionA = await page.locator("#session-select").inputValue();
            const messageA = `session A ${Date.now()}`;
            const chatA = page.waitForResponse(
                (res) => res.url().includes("/api/chat") && res.request().method() === "POST"
            );
            await page.fill("#chat-input", messageA);
            await page.press("#chat-input", "Enter");
            await chatA;
            await expectVisible(page, `.message--user:has-text('${messageA}')`);

            const sessionBCreated = page.waitForResponse(
                (res) => res.url().includes("/api/sessions") && res.request().method() === "POST"
            );
            await page.click("#session-new");
            await sessionBCreated;
            await page.waitForFunction(
                (previous) =>
                    (document.querySelector("#session-select") as HTMLSelectElement | null)?.value
                        !== previous,
                sessionA
            );
            const messageB = `session B ${Date.now()}`;
            await page.waitForFunction((text) => !document.body.innerText.includes(text), messageA);
            const chatB = page.waitForResponse(
                (res) => res.url().includes("/api/chat") && res.request().method() === "POST"
            );
            await page.fill("#chat-input", messageB);
            await page.press("#chat-input", "Enter");
            await chatB;
            await expectVisible(page, `.message--user:has-text('${messageB}')`);

            await page.selectOption("#session-select", sessionA);
            await page.waitForFunction((text) => document.body.innerText.includes(text), messageA);
            await page.waitForFunction((text) => !document.body.innerText.includes(text), messageB);

            await page.close();
        },
        results
    );

    // Test 17: Profile saves via DB and survives localStorage clearing
    await runTest(
        "profile saves via DB and survives localStorage clearing",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
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
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
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
        results
    );

    await runTest(
        "profile rejects raw avatar data URL through API",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const result = await page.evaluate(async () => {
                const resp = await fetch("/api/profile", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: "Bad Avatar",
                        interests: "Minecraft",
                        avatar: "data:image/png;base64,AAAA"
                    })
                });
                return { status: resp.status, body: (await resp.json()) as { error?: string; } };
            });

            assertEqual(result.status, 400, "Raw avatar data URL rejected");
            if (!/avatar/i.test(result.body.error ?? "")) {
                throw new Error(`Expected avatar validation error, got ${result.body.error}`);
            }

            await page.close();
        },
        results
    );

    await runTest(
        "profile avatar upload stores asset and updates preview",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;
            await page.fill("#profile-username", "UploadKid");
            await page.fill("#profile-interests", "pixel avatars");

            const uploadResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/profile/avatar") && res.request().method() === "POST"
            );
            const avatarChooser = page.waitForEvent("filechooser");
            await page.click("#profile-avatar-preview");
            await (await avatarChooser).setFiles({
                name: "avatar.png",
                mimeType: "image/png",
                buffer: TINY_PNG
            });
            assertEqual(
                await page.locator("#profile-avatar-upload").count(),
                1,
                "Profile avatar chooser input"
            );
            assertEqual((await uploadResponse).status(), 200, "Profile avatar upload response");
            await expectVisible(page, "#profile-avatar-img");
            const assetId = await page.inputValue("#profile-avatar-asset");
            if (!/^asset_[0-9a-f-]+$/i.test(assetId)) {
                throw new Error(`Invalid uploaded avatar asset id: ${assetId}`);
            }
            const previewSrc = (await page.locator("#profile-avatar-img").getAttribute("src"))
                ?? "";
            if (!previewSrc.includes(`/asset/${assetId}`)) {
                throw new Error(`Avatar upload preview did not use stored asset: ${previewSrc}`);
            }
            assertEqual(
                await page.locator("#profile-avatar-status").textContent(),
                "Avatar ready.",
                "Avatar upload ready status"
            );
            assertEqual(
                await page.locator("#profile-avatar-preview").getAttribute("aria-busy"),
                "false",
                "Avatar upload not busy"
            );

            const resetResponse = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "DELETE"
            );
            await page.click("#profile-reset");
            assertEqual((await resetResponse).status(), 200, "Profile reset after avatar upload");
            await expectHidden(page, "#profile-modal");
            await page.close();
        },
        results
    );

    await runTest(
        "profile avatar generation shows loading state",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            await page.route("**/api/profile/avatar/generate", async (route) => {
                await page.waitForTimeout(300);
                await route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({ error: "delayed test failure" })
                });
            });

            const initialProfileLoad = page.waitForResponse(
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await initialProfileLoad;

            const generateResponse = page.waitForResponse(
                (res) =>
                    res.url().includes("/api/profile/avatar/generate")
                    && res.request().method() === "POST"
            );
            await page.click("#profile-generate");
            await expectDisabled(page.locator("#profile-generate"));
            await expectVisible(
                page,
                "#profile-avatar-preview.is-pending .profile-avatar-spinner"
            );
            assertEqual(
                await page.locator("#profile-avatar-preview").getAttribute("aria-busy"),
                "true",
                "Avatar preview marked busy"
            );
            assertEqual(
                await page.locator("#profile-avatar-status").textContent(),
                "Generating avatar.",
                "Avatar status text while pending"
            );

            await generateResponse;
            await expectEnabled(page.locator("#profile-generate"));
            await expectHidden(page, "#profile-avatar-preview.is-pending");
            assertEqual(
                await page.locator("#profile-avatar-preview").getAttribute("aria-busy"),
                "false",
                "Avatar preview no longer busy"
            );
            await page.unroute("**/api/profile/avatar/generate");
            await page.close();
        },
        results
    );

    await runTest(
        "profile generates avatar asset, persists, and uses it in chat",
        async () => {
            const page = await newPage(browser);
            await waitForApp(page, { dismissOnboarding: true });
            resetMinimaxMockCalls();

            const chatResponse = page.waitForResponse(
                (res) => res.url().includes("/api/chat") && res.request().method() === "POST"
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
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
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
                    res.url().includes("/api/profile/avatar/generate")
                    && res.request().method() === "POST"
            );
            await page.click("#profile-generate");
            const resp = await generateResponse;
            assertEqual(resp.status(), 200, "Avatar generation response");
            await expectEnabled(page.locator("#profile-generate"));

            await expectVisible(page, "#profile-avatar-img");
            const assetId = await page.locator("#profile-avatar-asset").inputValue();
            if (!/^asset_[0-9a-f-]+$/i.test(assetId)) {
                throw new Error(`Invalid asset id: ${assetId}`);
            }
            const previewSrc = (await page.locator("#profile-avatar-img").getAttribute("src"))
                ?? "";
            if (!previewSrc.includes(`/asset/${assetId}`)) {
                throw new Error(`Preview did not use generated asset: ${previewSrc}`);
            }
            assertEqual(
                await page.locator("#profile-btn").getAttribute("data-avatar"),
                "🖼️",
                "Profile button shows image avatar"
            );
            const repaintedAvatar = page.locator(".message--user .profile-avatar-img").first();
            await repaintedAvatar.waitFor({ state: "attached", timeout: 5000 });
            const repaintedAvatarSrc = (await repaintedAvatar.getAttribute("src")) ?? "";
            if (!repaintedAvatarSrc.includes(`/asset/${assetId}`)) {
                throw new Error(
                    `Existing user bubble did not repaint avatar: ${repaintedAvatarSrc}`
                );
            }

            const profile = await page.evaluate(async () => {
                return (await (await fetch("/api/profile")).json()) as {
                    username: string;
                    avatar: { type: string; value: string; };
                };
            });
            assertEqual(profile.username, "GamerKid", "Generated avatar kept profile username");
            assertEqual(profile.avatar.type, "asset", "Generated avatar profile type");
            assertEqual(profile.avatar.value, assetId, "Generated avatar profile asset id");

            const assets = await page.evaluate(async () => {
                return (await (await fetch("/assets")).json()) as {
                    assets: Array<{ id: string; type: string; tool_name: string; url: string; }>;
                };
            });
            const asset = assets.assets.find((item) => item.id === assetId);
            if (!asset) throw new Error(`Generated avatar asset missing from /assets: ${assetId}`);
            assertEqual(asset.type, "image", "Generated avatar asset type");
            assertEqual(asset.tool_name, "generate_image", "Generated avatar tool name");
            assertEqual(asset.url, `/asset/${assetId}`, "Generated avatar asset URL");

            const imageCalls = getMinimaxMockCalls().filter((call) =>
                call.url.includes("/v1/image_generation")
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
                (res) => res.url().includes("/api/profile") && res.request().method() === "GET"
            );
            await page.click("#profile-btn");
            await expectVisible(page, "#profile-modal");
            await reloadedProfileLoad;
            assertEqual(
                await page.locator("#profile-avatar-asset").inputValue(),
                assetId,
                "Generated avatar asset persisted after reload"
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
        results
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
    const slowest = results
        .toSorted((a, b) => b.duration - a.duration)
        .slice(0, 5)
        .map((r) => `${r.name}:${r.duration.toFixed(0)}ms`);
    console.log(`ℹ tests ${results.length}`);
    console.log(`ℹ pass ${passed}`);
    console.log(`ℹ fail ${failed}`);
    console.log(`ℹ duration_ms ${results.reduce((sum, r) => sum + r.duration, 0).toFixed(0)}`);
    console.log(`ℹ slowest_tests ${slowest.join(", ")}`);

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
    results: TestResult[]
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
            duration: performance.now() - start
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

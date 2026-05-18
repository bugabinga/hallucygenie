// HallucyGenie — static project health tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { Window } from "happy-dom";

const indexHtml = readFileSync("public/index.html", "utf-8");
const styleCss = readFileSync("public/style.css", "utf-8");
const appTs = readFileSync("public/app.ts", "utf-8");
const appJs = readFileSync("public/app.js", "utf-8");
const justfile = readFileSync("justfile", "utf-8");
const serverTs = readFileSync("src/server.ts", "utf-8");
const agentTest = readFileSync("test/agent.test.ts", "utf-8");
const dbTest = readFileSync("test/db.test.ts", "utf-8");
const e2eChatSpec = readFileSync("e2e/chat.spec.ts", "utf-8");
const e2eRunner = readFileSync("e2e/run-e2e.ts", "utf-8");
const playwrightConfig = readFileSync("test/playwright.config.ts", "utf-8");
const serverTest = readFileSync("test/server.test.ts", "utf-8");
const gitignore = readFileSync(".gitignore", "utf-8");
const dockerignore = readFileSync(".dockerignore", "utf-8");
const lefthookYml = readFileSync("lefthook.yml", "utf-8");
const ciYml = readFileSync(".github/workflows/ci.yml", "utf-8");
const updatesYml = readFileSync(".github/workflows/updates.yml", "utf-8");
const strykerAgent = readFileSync("test/stryker.config.mjs", "utf-8");
const strykerTools = readFileSync("test/stryker-tools.mjs", "utf-8");
const strykerDb = readFileSync("test/stryker-db.mjs", "utf-8");
const deployDockerfile = readFileSync("deploy/Dockerfile", "utf-8");
const agentsMd = readFileSync("AGENTS.md", "utf-8");
const issuePrompt = readFileSync(".pi/prompts/issue.md", "utf-8");
const minimaxResearchPrompt = readFileSync(".pi/prompts/minimax-research.md", "utf-8");
const readmeMd = readFileSync("README.md", "utf-8");
const licenseMd = readFileSync("LICENSE", "utf-8");
const rulesMd = readFileSync(".system/RULES.md", "utf-8");
const musicCreatorSpec = readFileSync(
    ".system/specs/HG-SPEC-012-minimax-music-creator-tools.md",
    "utf-8",
);
const musicCoverSpec = readFileSync(
    ".system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md",
    "utf-8",
);

type FontManifest = {
    version: number;
    source: { repo: string; commit: string; downloaded_by: string };
    fonts: Array<{
        id: string;
        family: string;
        css_family: string;
        role: string;
        source_path: string;
        file: string;
        format: string;
        axes: Record<string, [number, number]>;
        sha256: string;
        license: string;
    }>;
};

function parseIndex(): Document {
    const win = new Window();
    win.document.body.innerHTML = indexHtml;
    const head = indexHtml.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
    win.document.head.innerHTML = head.replace(/^<head>|<\/head>$/g, "");
    return win.document as unknown as Document;
}

function sha256(path: string): string {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadFontManifest(): FontManifest {
    return JSON.parse(readFileSync("public/fonts/fonts.manifest.json", "utf-8")) as FontManifest;
}

describe("index.html health", () => {
    it("defines favicon", () => {
        const doc = parseIndex();
        const icon = doc.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        assert.ok(icon?.href);
    });

    it("welcome message has no indentation whitespace", () => {
        const doc = parseIndex();
        const content = doc.querySelector(".message--welcome .message-content")?.textContent;
        assert.equal(
            content,
            "Hey! 👋 I'm HallucyGenie. Ask me anything — I can chat, make images 🔥, do voices 🎙️, and create music 🎵",
        );
    });

    it("quota badge text has no newline indentation", () => {
        const doc = parseIndex();
        const text = doc.querySelector("#quota-badge")?.textContent ?? "";
        assert.equal(text.includes("\n"), false);
        assert.match(text, /🎨\s+—🎙️\s+—🎵\s+—/);
    });

    it("visible labels and controls have no direct newline indentation", () => {
        const doc = parseIndex();
        const offenders = Array.from(
            doc.querySelectorAll("button, p, span, label, h1, h2, h3"),
        ).flatMap((el) =>
            Array.from(el.childNodes)
                .filter(
                    (node) =>
                        node.nodeType === 3 &&
                        (node.textContent ?? "").trim().length > 0 &&
                        ((node.textContent ?? "").startsWith("\n") ||
                            (node.textContent ?? "").endsWith("\n")),
                )
                .map(() => `${el.tagName.toLowerCase()}#${el.id}.${el.className}`),
        );
        assert.deepEqual(offenders, []);
    });

    it("viewport permits browser zoom", () => {
        const doc = parseIndex();
        const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
        assert.match(viewport, /width=device-width/);
        assert.match(viewport, /initial-scale=1\.0/);
        assert.doesNotMatch(viewport, /maximum-scale/);
        assert.doesNotMatch(viewport, /user-scalable=no/);
    });

    it("has one onboarding dots group with four dots", () => {
        const doc = parseIndex();
        assert.equal(doc.querySelectorAll("#onboarding .onboarding-dots").length, 1);
        assert.equal(doc.querySelectorAll("#onboarding .onboarding-dots .dot").length, 4);
    });

    it("has accessible labels for form controls", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector('label[for="chat-input"]'));
        assert.ok(doc.querySelector('label[for="music-prompt"]'));
        assert.ok(doc.querySelector('label[for="music-lyrics"]'));
        assert.equal(doc.querySelector("#music-instrumental"), null);
    });

    it("keeps Create UI on the kid-safe MiniMax parameter subset", () => {
        const doc = parseIndex();
        for (const id of [
            "#img-count",
            "#img-seed",
            "#img-width",
            "#img-height",
            "#img-prompt-optimizer",
            "#voice-id",
            "#voice-speed",
            "#voice-volume",
            "#voice-pitch",
        ]) {
            assert.ok(doc.querySelector(id), id);
        }
        for (const forbiddenId of [
            "#img-response-format",
            "#img-subject-reference",
            "#voice-emotion",
            "#voice-language-boost",
            "#voice-output-format",
            "#voice-subtitle-enable",
            "#music-instrumental",
            "#music-lyrics-optimizer",
            "#music-output-format",
            "#music-audio-base64",
            "#music-audio-url",
            "#music-cover-feature-id",
        ]) {
            assert.equal(doc.querySelector(forbiddenId), null, forbiddenId);
        }
        assert.match(appTs, /params\.push\(`n=\$\{imgCountInput\.value\.trim\(\)\}`\)/);
        assert.match(appTs, /params\.push\(`seed=\$\{imgSeedInput\.value\.trim\(\)\}`\)/);
        assert.match(appTs, /params\.push\(`width=\$\{imgWidthInput\.value\.trim\(\)\}`\)/);
        assert.match(appTs, /params\.push\(`height=\$\{imgHeightInput\.value\.trim\(\)\}`\)/);
        assert.doesNotMatch(appTs, /response_format|audio_base64|lyrics_optimizer/);
    });

    it("has a 'Write lyrics for me' button in the music form", () => {
        const doc = parseIndex();
        const btn = doc.querySelector("#write-lyrics-btn");
        assert.ok(btn, "Write lyrics button should exist");
        assert.equal(btn?.tagName.toLowerCase(), "button");
    });

    it("quota badge includes lyrics item", () => {
        const doc = parseIndex();
        const lyricsItem = doc.querySelector('.quota-item[data-type="lyrics"]');
        assert.ok(lyricsItem, "quota badge should have lyrics item");
    });

    it("create modal has dialog ARIA", () => {
        const doc = parseIndex();
        const modal = doc.querySelector("#create-modal") as HTMLElement | null;
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "create-title");
    });

    it("has session switcher controls", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector("#session-select"));
        assert.ok(doc.querySelector("#session-new"));
    });

    it("orders header controls by identity, session, then actions", () => {
        const doc = parseIndex();
        const headerLeft = doc.querySelector(".header-left");
        const headerRight = doc.querySelector(".header-right");
        assert.deepEqual(
            Array.from(headerLeft?.children ?? []).map((el) => `#${el.id}.${el.className}`),
            ["#.header-emoji", "#.header-title", "#connection-status.status-dot"],
        );
        assert.deepEqual(
            Array.from(headerRight?.children ?? []).map((el) => `#${el.id}.${el.className}`),
            [
                "#.session-switcher",
                "#profile-btn.profile-btn",
                "#create-btn.create-btn",
                "#quota-badge.quota-badge",
            ],
        );
    });

    it("themes the session switcher as integrated app chrome", () => {
        assert.match(styleCss, /--color-bg-card: rgba\(255, 255, 255, 0\.06\);/);
        assert.match(styleCss, /--color-border: rgba\(255, 255, 255, 0\.14\);/);
        assert.match(styleCss, /\.session-switcher \{[^}]*gap: 0;/);
        assert.match(styleCss, /\.session-switcher \{[^}]*overflow: hidden;/);
        assert.match(styleCss, /\.session-switcher \{[^}]*border-radius: var\(--radius-full\);/);
        assert.match(
            styleCss,
            /\.session-switcher \{[^}]*linear-gradient\(135deg, rgba\(255, 255, 255, 0\.1\), var\(--color-bg-card\)\)/,
        );
        assert.match(styleCss, /\.session-select \{[^}]*appearance: none;/);
        assert.match(styleCss, /\.session-select \{[^}]*border: 0;/);
        assert.match(styleCss, /\.session-select \{[^}]*M4 6l4 4 4-4/);
        assert.match(
            styleCss,
            /\.session-select option \{[^}]*background: var\(--color-surface\);/,
        );
        assert.match(
            styleCss,
            /\.session-new \{[^}]*border-left: 1px solid var\(--color-border\);/,
        );
        assert.match(styleCss, /\.session-new \{[^}]*background: transparent;/);
        assert.doesNotMatch(styleCss, /\.session-new \{[^}]*linear-gradient/);
    });

    it("keeps mobile header title visible while actions wrap below", () => {
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*#header \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/,
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.header-right \{[\s\S]*display: grid;/,
        );
        assert.match(
            styleCss,
            /grid-template-areas:[\s\S]*"sessions sessions sessions"[\s\S]*"profile create quota"/,
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-switcher \{[\s\S]*grid-area: sessions;/,
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-switcher \{[\s\S]*width: 100%;/,
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-select \{[\s\S]*width: 100%;/,
        );
        assert.match(styleCss, /\.header-title \{[^}]*text-overflow: ellipsis;/);
        assert.match(styleCss, /\.header-title \{[^}]*white-space: nowrap;/);
        assert.match(styleCss, /\.header-right \{[^}]*min-width: 0;/);
        assert.match(styleCss, /\.session-switcher \{[^}]*min-width: 0;/);
        assert.match(styleCss, /\.session-select \{[^}]*text-overflow: ellipsis;/);
        for (const selector of [".session-switcher", ".session-select", ".session-new"]) {
            const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            assert.match(styleCss, new RegExp(`${escaped} \\{[^}]*min-height: 32px;`));
        }
        assert.match(styleCss, /\.create-btn,\n\.profile-btn \{[^}]*min-height: 32px;/);
    });

    it("create panels have recent history containers", () => {
        const doc = parseIndex();
        for (const kind of ["image", "music", "voice", "analyze", "search"]) {
            assert.ok(doc.querySelector(`.create-recent[data-kind="${kind}"]`), kind);
        }
    });

    it("create modal exposes analyze image as a first-class tool", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector('.create-tab[data-tab="analyze"]'));
        assert.ok(doc.querySelector('#create-analyze-form[data-panel="analyze"]'));
        assert.ok(doc.querySelector('label[for="analyze-url"]'));
        assert.ok(doc.querySelector('label[for="analyze-prompt"]'));
        assert.match(appTs, /Use analyze_image with image_url:/);
    });

    it("lightbox is an accessible dialog", () => {
        const doc = parseIndex();
        const lightbox = doc.querySelector("#lightbox") as HTMLElement | null;
        assert.equal(lightbox?.getAttribute("role"), "dialog");
        assert.equal(lightbox?.getAttribute("aria-modal"), "true");
        assert.equal(lightbox?.getAttribute("aria-label"), "Image preview");
    });

    it("profile button and modal have accessible labels", () => {
        const doc = parseIndex();
        assert.equal(doc.querySelector("#profile-btn")?.getAttribute("aria-label"), "Open profile");
        const modal = doc.querySelector("#profile-modal") as HTMLElement | null;
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "profile-title");
        assert.equal(doc.querySelector("#profile-generate")?.hasAttribute("disabled"), false);
    });

    it("profile fields have distinct guidance and asset avatar controls", () => {
        const doc = parseIndex();
        assert.equal(
            doc.querySelector('label[for="profile-interests"]')?.textContent,
            "Topics to bring up",
        );
        assert.equal(
            doc.querySelector('label[for="profile-favorites"]')?.textContent,
            "Style favorites",
        );
        assert.equal(doc.querySelector("#profile-avatar"), null);
        assert.equal(indexHtml.includes("Avatar emoji"), false);
        assert.ok(doc.querySelector("#profile-avatar-preview"));
        assert.equal(doc.querySelector("#profile-avatar-fallback")?.textContent, "🎮");
        assert.ok(doc.querySelector("#profile-avatar-img"));
        assert.equal(doc.querySelector("#profile-avatar-upload")?.getAttribute("type"), "file");
        assert.equal(indexHtml.toLowerCase().includes("email"), false);
        assert.equal(appTs.includes('type: "emoji"'), false);
        assert.equal(serverTs.includes('type: "emoji"'), false);
        assert.equal(agentTest.includes('type: "emoji"'), false);
        assert.equal(e2eChatSpec.includes('fill("#profile-avatar")'), false);
        assert.equal(e2eChatSpec.includes('toHaveValue("🦊")'), false);
        assert.match(dbTest, /avatar: \{ type: "emoji", value: "🦊" \}[\s\S]*avatar type invalid/);
        assert.match(
            serverTest,
            /avatar: \{ type: "emoji", value: "🦊" \}[\s\S]*avatar type invalid/,
        );
    });

    it("profile avatar changes repaint current user message avatars", () => {
        assert.match(appTs, /function repaintCurrentUserAvatars\(\): void/);
        assert.match(appTs, /\.message--user:not\(\.message--steer\) \.message-avatar/);
        assert.match(appTs, /avatar\.replaceWith\(renderProfileAvatar\(\)\)/);
        assert.match(appTs, /function setCurrentProfile[\s\S]*repaintCurrentUserAvatars\(\);/);
    });

    it("profile avatar generation has visible and accessible pending state", () => {
        const doc = parseIndex();
        const status = doc.querySelector("#profile-avatar-status") as HTMLElement | null;
        assert.equal(status?.getAttribute("role"), "status");
        assert.equal(status?.getAttribute("aria-live"), "polite");
        assert.match(appTs, /profileAvatarPreview\.classList\.toggle\("is-pending", pending\)/);
        assert.match(appTs, /profileAvatarPreview\.setAttribute\("aria-busy"/);
        assert.match(appTs, /profileAvatarStatus\.textContent = pending/);
        assert.match(styleCss, /\.profile-avatar-preview\.is-pending \.profile-avatar-spinner/);
        assert.match(styleCss, /prefers-reduced-motion: reduce[\s\S]*\.profile-avatar-spinner/);
    });

    it("connection status exposes accessible status", () => {
        const doc = parseIndex();
        const status = doc.querySelector("#connection-status") as HTMLElement | null;
        assert.equal(status?.getAttribute("role"), "status");
        assert.equal(status?.getAttribute("aria-label"), "Connection status: Connected");
    });

    it("quota badge is non-interactive status", () => {
        const doc = parseIndex();
        const badge = doc.querySelector("#quota-badge") as HTMLElement | null;
        assert.equal(badge?.tagName.toLowerCase(), "span");
        assert.equal(badge?.getAttribute("role"), "status");
        assert.equal(
            badge?.getAttribute("title"),
            "Images, voice, music, and lyrics remaining today",
        );
        assert.equal(
            badge?.getAttribute("aria-label"),
            "Images, voice, music, and lyrics remaining today",
        );
        assert.ok(doc.querySelector('.quota-item[data-type="speech"]'));
        assert.equal(styleCss.includes(".quota-badge:hover"), false);
        assert.match(styleCss, /\.quota-badge \{[^}]*cursor: default;/);
    });

    it("steering hint is outside input layout flow", () => {
        assert.match(styleCss, /\.steer-hint \{[^}]*position: absolute;/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*margin-top:/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*animation:/);
    });

    it("thinking indicator is a reserved accessible status layer", () => {
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*role="status"/);
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*aria-live="polite"/);
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*aria-label="Genie is thinking"/);
        const doc = new Window().document;
        doc.body.innerHTML = indexHtml;
        assert.equal(doc.querySelector("#typing-indicator")?.hasAttribute("hidden"), false);
        assert.match(styleCss, /\.typing-indicator \{[^}]*min-height: 36px;/);
        assert.match(styleCss, /\.typing-indicator \{[^}]*visibility: hidden;/);
        assert.match(styleCss, /\.typing-indicator \{[^}]*opacity: 0;/);
        assert.match(styleCss, /\.typing-indicator\.is-visible \{[^}]*visibility: visible;/);
        assert.match(styleCss, /\.typing-indicator\.is-visible \{[^}]*opacity: 1;/);
        assert.match(appTs, /typingIndicator\.classList\.add\("is-visible"\)/);
        assert.match(appTs, /typingIndicator\.classList\.remove\("is-visible"\)/);
        assert.doesNotMatch(appTs, /typingIndicator\.hidden\s*=/);
    });

    it("assistant streaming animation is low-risk and reduced-motion safe", () => {
        assert.match(styleCss, /\.assistant-text-region\.is-streaming/);
        assert.match(styleCss, /\.stream-chunk/);
        assert.match(styleCss, /@keyframes stream-chunk-in/);
        assert.match(styleCss, /@keyframes caret-blink/);
        assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*animation: stream-chunk-in/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*display: inline-block;/);
        assert.match(
            styleCss,
            /@keyframes stream-chunk-in \{[\s\S]*clip-path: inset\(0 100% 0 0\)/,
        );
        assert.match(styleCss, /\.stream-chunk \{[^}]*steps\(8, end\)/);
        assert.doesNotMatch(styleCss, /\.stream-char/);
        assert.doesNotMatch(styleCss, /\.stream-render-tick/);
    });

    it("create modal has stable shell and scroll region", () => {
        assert.match(styleCss, /\.create-modal-content \{[^}]*display: flex;/);
        assert.match(styleCss, /\.create-modal-content \{[^}]*height: min\(86dvh, 720px\);/);
        assert.match(styleCss, /\.create-panels \{[^}]*flex: 1;/);
        assert.match(styleCss, /\.create-panels \{[^}]*min-height: 0;/);
        assert.match(styleCss, /\.create-panels \{[^}]*overflow-y: auto;/);
        assert.match(styleCss, /\.modal-content \{[^}]*background: rgba\(20, 20, 26, 0\.94\);/);
        assert.match(styleCss, /backdrop-filter: blur\(10px\)/);
    });

    it("intentional scroll regions share custom scrollbar styling", () => {
        const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (const selector of ["#message-list", ".modal-content", ".create-panels"]) {
            const escaped = escapeRegExp(selector);
            assert.match(styleCss, new RegExp(`${escaped}[\\s\\S]*scrollbar-width: thin;`));
            assert.match(styleCss, new RegExp(`${escaped}::\\-webkit-scrollbar`));
            assert.match(styleCss, new RegExp(`${escaped}::\\-webkit-scrollbar-thumb`));
        }
        assert.match(styleCss, /\.modal-content \{[^}]*overflow-y: auto;/);
        assert.match(styleCss, /\.create-panels \{[^}]*overflow-y: auto;/);
    });

    it("create form controls have visible left borders", () => {
        assert.match(styleCss, /\.create-panels \{[^}]*padding: 0 2px;/);
        assert.match(
            styleCss,
            /\.form-group textarea,[\s\S]*?\.form-group select \{[\s\S]*?border-left-color: rgba\(255, 255, 255, 0\.28\);/,
        );
    });

    it("assistant markdown spacing and images are contained", () => {
        assert.match(styleCss, /\.message-content \{[^}]*white-space: normal;/);
        assert.match(
            styleCss,
            /\.message--user \.message-content,[\s\S]*?\.message--steer \.message-content \{[\s\S]*?white-space: pre-wrap;/,
        );
        assert.match(
            styleCss,
            /\.message--assistant \.message-content p \{[^}]*margin: 0\.25rem 0;/,
        );
        assert.match(
            styleCss,
            /\.message--assistant \.message-content li \{[^}]*line-height: 1\.45;/,
        );
        assert.match(styleCss, /\.markdown-image \{[^}]*max-width: min\(100%, 320px\);/);
        assert.match(styleCss, /\.markdown-image \{[^}]*max-height: min\(45vh, 260px\);/);
    });

    it("asset library uses visible audio controls instead of hidden autoplay", () => {
        assert.match(appTs, /document\.createElement\("audio"\)/);
        assert.match(appTs, /audio\.controls = true;/);
        assert.match(appTs, /audio\.preload = "metadata";/);
        assert.doesNotMatch(appTs, /new Audio\(/);
    });

    it("shell is full-width with constrained content and useful input overflow", () => {
        assert.doesNotMatch(styleCss, /#app \{[^}]*max-width:/);
        assert.match(styleCss, /--content-max-width: 720px/);
        assert.match(styleCss, /--header-content-max-width: 1040px/);
        assert.match(styleCss, /#header \{[^}]*padding-inline: max/);
        assert.match(styleCss, /#header \{[^}]*var\(--header-content-max-width\)/);
        assert.match(styleCss, /#message-list \{[^}]*padding-inline: max/);
        assert.match(styleCss, /#chat-form \{[^}]*max-width: var\(--content-max-width\)/);
        assert.match(styleCss, /#chat-input \{[^}]*overflow-y: hidden/);
        assert.match(styleCss, /#chat-input\.is-overflowing \{[^}]*overflow-y: auto/);
        assert.match(appTs, /classList\.toggle\("is-overflowing", clamped\)/);
    });
});

describe("font vendoring health", () => {
    it("has a pinned manifest with valid local font artifacts", () => {
        const manifest = loadFontManifest();
        assert.equal(manifest.version, 1);
        assert.equal(manifest.source.repo, "https://github.com/google/fonts");
        assert.match(manifest.source.commit, /^[0-9a-f]{40}$/);
        assert.equal(manifest.source.downloaded_by, "just fonts-update");
        assert.deepEqual(manifest.fonts.map((font) => font.id).sort(), [
            "pixelify-sans",
            "playwrite-de-sas",
            "roboto-flex",
        ]);

        for (const font of manifest.fonts) {
            assert.equal(font.format, "woff2", `${font.id} format`);
            assert.equal(existsSync(font.file), true, `${font.file} exists`);
            assert.equal(existsSync(font.license), true, `${font.license} exists`);
            assert.match(font.sha256, /^[0-9a-f]{64}$/);
            assert.equal(sha256(font.file), font.sha256, `${font.id} checksum`);
            assert.ok(font.source_path.startsWith("ofl/"), `${font.id} source path`);
            assert.ok(Object.keys(font.axes).length > 0, `${font.id} axes`);
        }
    });

    it("loads only local font URLs from CSS", () => {
        assert.equal(styleCss.includes("fonts.googleapis.com"), false);
        assert.equal(styleCss.includes("fonts.gstatic.com"), false);
        assert.equal((styleCss.match(/@font-face/g) ?? []).length, 3);

        for (const family of ["HG Playwrite DE SAS", "HG Roboto Flex", "HG Pixelify Sans"]) {
            assert.ok(styleCss.includes(`font-family: "${family}";`), `${family} @font-face`);
            assert.ok(styleCss.includes(`"${family}"`), `${family} token`);
        }

        const localUrls = [...styleCss.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]);
        assert.ok(localUrls.length >= 3);
        const manifest = loadFontManifest();
        assert.deepEqual(
            localUrls.filter((url) => url.includes("fonts")),
            ["pixelify-sans", "roboto-flex", "playwrite-de-sas"].map((id) => {
                const font = manifest.fonts.find((item) => item.id === id)!;
                return `${font.file.replace(/^public/, "")}?v=${font.sha256.slice(0, 12)}`;
            }),
        );
    });

    it("cache-busts CSS font URLs with manifest SHA prefixes", () => {
        const manifest = loadFontManifest();
        for (const font of manifest.fonts) {
            const urlPath = font.file.replace(/^public/, "");
            assert.ok(
                styleCss.includes(`${urlPath}?v=${font.sha256.slice(0, 12)}`),
                `${font.id} cache-buster`,
            );
        }
    });

    it("targets real rendered selectors for user, assistant, and UI fonts", () => {
        for (const selector of [
            ".message--user .message-content",
            ".message--steer .message-content",
            "#chat-input",
            ".message--assistant .message-content",
            ".assistant-text-region",
            ".assistant-thinking-region",
            ".thinking-content",
            "body",
            "button",
            "textarea",
            ".header-title",
            ".quota-badge",
            ".create-tab",
            ".tool-card",
            ".assets-empty",
            ".error-toast",
            ".steer-hint",
        ]) {
            assert.ok(styleCss.includes(selector), `${selector} selector`);
        }
        assert.match(styleCss, /--font-ui:\s*"HG Pixelify Sans"/);
        assert.match(styleCss, /--font-assistant:\s*"HG Roboto Flex"/);
        assert.match(styleCss, /--font-user:\s*"HG Playwrite DE SAS"/);
    });
});

describe("frontend session identity health", () => {
    it("does not create browser-owned session IDs or send X-Session-Id", () => {
        assert.equal(appTs.includes("crypto.randomUUID()"), false);
        assert.equal(appTs.includes('localStorage.setItem("hallucygenie_session_id"'), false);
        assert.equal(appTs.includes("X-Session-Id"), false);
        assert.match(appTs, /localStorage\.removeItem\(LEGACY_SESSION_KEY\)/);
    });

    it("uses active-session asset API URLs without session query", () => {
        assert.match(appTs, /asset\.url/);
        assert.match(appTs, /asset\.download_url/);
        assert.equal(appTs.includes("?s="), false);
    });

    it("does not write profile state to localStorage", () => {
        assert.equal(appTs.includes("hallucygenie_user_profile_v1"), false);
        assert.doesNotMatch(appTs, /localStorage\.setItem\([^\)]*profile/i);
        assert.match(appTs, /\/api\/profile/);
    });

    it("uses localStorage only for onboarding plus legacy session cleanup", () => {
        assert.equal(appTs.includes("hallucygenie_recent_error"), false);
        assert.equal(appJs.includes("hallucygenie_recent_error"), false);
        assert.doesNotMatch(appTs, /restoreRecentError|saveRecentError|clearRecentError/);
        assert.doesNotMatch(appJs, /restoreRecentError|saveRecentError|clearRecentError/);
        assert.match(appTs, /localStorage\.removeItem\(LEGACY_SESSION_KEY\)/);
        assert.match(appTs, /localStorage\.setItem\(ONBOARDING_KEY, "1"\)/);
        assert.match(appTs, /localStorage\.getItem\(ONBOARDING_KEY\)/);
    });
});

describe("constitution health", () => {
    it("AGENTS.md stays instruction-only and points at source docs", () => {
        assert.match(agentsMd, /Agent instructions only/);
        assert.match(agentsMd, /Do not mirror project state here/);
        assert.match(agentsMd, /\.system\/RULES\.md/);
        assert.match(agentsMd, /\/skill:tiger/);
        assert.match(agentsMd, /\/skill:minimax/);
        assert.match(agentsMd, /just --list/);
        assert.doesNotMatch(agentsMd, /\.pi\/prompts\/issue\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/spec\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/minimax-research\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/ci\.md/);
        assert.doesNotMatch(agentsMd, /\.pi\/prompts\/commit\.md/);
        assert.doesNotMatch(agentsMd, /\/home\//);
        assert.doesNotMatch(
            agentsMd,
            /^## (Stack|Commands|Files|Architecture|MiniMax API|Session|SSE|Quotas|Testing|Logger|Don't)$/m,
        );
        assert.doesNotMatch(agentsMd, /No frameworks/);
        assert.doesNotMatch(agentsMd, /No "backwards compat"/);
        assert.doesNotMatch(agentsMd, /logs\/dev\.log/);
    });

    it("music creator specs split lyrics/song generation from cover research", () => {
        assert.match(musicCreatorSpec, /lyrics_generation[^\n]*100/);
        assert.match(musicCreatorSpec, /Separate LLM tools.*integrated Create UI/);
        assert.match(musicCreatorSpec, /is_instrumental: true/);
        assert.match(musicCreatorSpec, /HG-SPEC-013/);
        assert.match(musicCoverSpec, /music-cover[^\n]*\d/);
        assert.match(musicCoverSpec, /YouTube/);
        assert.match(musicCoverSpec, /rights.*attest/i);
    });

    it("rules are a strong prompt with raw asset invariant", () => {
        assert.match(rulesMd, /strong prompt/i);
        assert.match(rulesMd, /No "backwards compat"/);
        assert.match(rulesMd, /Fail fast and loud/);
        assert.match(rulesMd, /Avoid deep OOP hierarchies/);
        assert.match(rulesMd, /Tiger style/);
        assert.match(rulesMd, /Never put raw asset data in agent context or chat history/);
    });

    it("persistent asset and direct tool IDs do not use process-local request IDs", () => {
        assert.equal(serverTs.includes("const assetId = nextReqId()"), false);
        assert.equal(serverTs.includes("`direct_${nextReqId()}`"), false);
        assert.match(serverTs, /randomUUID/);
    });

    it("drains leftover steering messages after agent turns", () => {
        assert.match(serverTs, /drainSteer/);
        assert.match(serverTs, /saveMessage\(database, sessionId, "user", msg\)/);
    });

    it("justfile has no constitution wrapper ceremony", () => {
        assert.equal(/^rules:/m.test(justfile), false);
        assert.equal(/^mission:/m.test(justfile), false);
    });
});

describe("system metadata health", () => {
    function mdFiles(dir: string): string[] {
        return readdirSync(dir)
            .filter((name) => name.endsWith(".md"))
            .map((name) => `${dir}/${name}`);
    }

    function uniqueIds(text: string, prefix: string): string[] {
        return [...new Set(text.match(new RegExp(`${prefix}-\\d{3}`, "g")) ?? [])];
    }

    it("keeps spec and issue cross references in sync", () => {
        const specs = new Map(
            mdFiles(".system/specs").map((path: string) => [
                path.match(/HG-SPEC-\d{3}/)?.[0] ?? "",
                { path, text: readFileSync(path, "utf-8") },
            ]),
        );
        const issues = new Map(
            mdFiles(".system/issues").map((path: string) => [
                path.match(/HG-ISSUE-\d{3}/)?.[0] ?? "",
                { path, text: readFileSync(path, "utf-8") },
            ]),
        );

        for (const [issueId, issue] of issues) {
            // parse specs from frontmatter: { "status": "...", "specs": ["HG-SPEC-NNN"] }
            const specsMatch = issue.text.match(/"specs":\s*\[([^\]]+)\]/);
            const specRefs = specsMatch ? (specsMatch[1].match(/HG-SPEC-\d{3}/g) ?? []) : [];
            assert.ok(specsMatch, `${issue.path} missing specs frontmatter`);
            for (const specId of specRefs) {
                const spec = specs.get(specId);
                assert.ok(spec, `${issue.path} references missing ${specId}`);
            }
        }
    });

    it("keeps issue status valid", () => {
        const validStatuses = ["open", "fixed"];
        for (const path of mdFiles(".system/issues")) {
            const text = readFileSync(path, "utf-8");
            const statusMatch = text.match(/"status":\s*"([^"]+)"/);
            assert.ok(statusMatch, `${path} missing status frontmatter`);
            assert.ok(
                validStatuses.includes(statusMatch[1]),
                `${path} invalid status: ${statusMatch[1]}`,
            );
        }
    });
});

describe("justfile health", () => {
    it("has build recipe, dev depends on build, and fresh-dev resets safely", () => {
        assert.match(justfile, /\nbuild:\n\s+bunx esbuild public\/app\.ts/);
        assert.match(justfile, /\ndev: build\n\s+bun src\/server\.ts/);
        assert.match(justfile, /\nfresh-dev: kill reset-db dev\n/);
    });

    it("uses clear MiniMax smoke test script", () => {
        assert.match(justfile, /\nminimax-test:\n\s+bun scripts\/minimax-test\.ts/);
        assert.match(justfile, /consumes TTS\/image\/music quota/);
        assert.equal(/^minimax-research:/m.test(justfile), false);
    });

    it("can update vendored fonts", () => {
        assert.match(
            justfile,
            /\nfonts-update commit="main":\n\s+bun scripts\/update-fonts\.ts \{\{ commit \}\}/,
        );
        assert.equal(existsSync("scripts/update-fonts.ts"), true);
    });

    it("does not use python, mobile package paths, Playwright allow flags, or test-name-pattern hacks", () => {
        const checked = [justfile, e2eRunner, playwrightConfig, e2eChatSpec].join("\n");
        assert.equal(checked.includes("python3"), false);
        assert.equal(/\/data\/data\/com\.[a-z]+/.test(checked), false);
        assert.equal(/PLAYWRIGHT_ALLOW_[A-Z_]+/.test(checked), false);
        assert.equal(checked.includes("--test-name-pattern"), false);
    });

    it("clean removes real generated files", () => {
        assert.match(justfile, /clean:\n\s+rm -rf .*public\/app\.js/);
        assert.match(justfile, /clean:\n\s+rm -rf .*\.stryker-tmp/);
        assert.match(justfile, /clean:\n\s+rm -rf .*coverage/);
    });

    it("does not define redundant list recipe", () => {
        assert.equal(/^list:/m.test(justfile), false);
    });

    it("defines hook recipes for lefthook", () => {
        assert.match(justfile, /hook-pre-commit: fmt-check lint/);
        assert.match(justfile, /hook-pre-push: test-unit/);
        assert.match(justfile, /test-backend:/);
        assert.match(justfile, /just test-backend & backend=\$!/);
        assert.equal(/^test:/m.test(justfile), false);
        assert.match(
            justfile,
            /fmt-check:\n\s+just -f \.\/justfile --fmt --check\n\s+bunx prettier --check \./,
        );
    });
});

describe("lefthook health", () => {
    it("runs pre-commit checks, gitleaks, pre-push unit tests, and post-merge main CI", () => {
        assert.match(lefthookYml, /pre-commit:/);
        assert.match(lefthookYml, /run: just hook-pre-commit/);
        assert.match(lefthookYml, /gitleaks:/);
        assert.match(lefthookYml, /gitleaks protect --staged --redact --verbose/);
        assert.match(lefthookYml, /pre-push:/);
        assert.match(lefthookYml, /run: just hook-pre-push/);
        assert.match(lefthookYml, /post-merge:/);
        assert.match(lefthookYml, /run: just hook-post-merge/);
        assert.match(justfile, /hook-post-merge:/);
        assert.match(justfile, /git branch --show-current/);
        assert.match(justfile, /\$branch" != "trunk"/);
        assert.match(justfile, /just ci-test-all && just test-e2e/);
        assert.doesNotMatch(justfile, /just ci-act/);
    });
});

describe("prompt health", () => {
    it("uses issue prompt as the single issue-triage workflow", () => {
        assert.equal(existsSync(".pi/prompts/check-issue.md"), false);
        assert.equal(existsSync(".pi/prompts/issue.md"), true);
        assert.match(issuePrompt, /logs\/dev\.log.*if present/);
        assert.match(issuePrompt, /Quote relevant excerpts only/);
        assert.match(issuePrompt, /Never paste raw asset bytes/);
        assert.match(issuePrompt, /Search `.system\/issues\/`/);
        assert.match(issuePrompt, /Cross-reference related specs and issues/);
        assert.match(issuePrompt, /Do not fix unless user asks/);
    });

    it("moves MiniMax research workflow out of justfile", () => {
        assert.equal(existsSync(".pi/prompts/minimax-research.md"), true);
        assert.match(minimaxResearchPrompt, /Research MiniMax API capabilities/);
        assert.match(minimaxResearchPrompt, /\/skill:minimax/);
        assert.match(minimaxResearchPrompt, /\/skill:research/);
        assert.match(minimaxResearchPrompt, /src\/tools\.ts/);
    });

    it("uses ci prompt for commit workflow", () => {
        assert.equal(existsSync(".pi/prompts/commit.md"), false);
        assert.equal(existsSync(".pi/prompts/ci.md"), true);
    });
});

describe("project metadata health", () => {
    it("ships a minimal README with badges and footer", () => {
        assert.match(readmeMd, /^# HallucyGenie\n/);
        assert.match(readmeMd, /actions\/workflows\/ci\.yml\/badge\.svg/);
        assert.match(readmeMd, /License-MIT/);
        assert.match(readmeMd, /Dark little genie/);
        assert.match(readmeMd, /chat, image, voice, and song/);
        assert.match(readmeMd, /Made with love, hand-vibing AI, and bugabinga\./);
    });

    it("uses MIT license metadata", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { license: string };
        assert.equal(pkg.license, "MIT");
        assert.match(licenseMd, /^MIT License/);
        assert.match(licenseMd, /Copyright \(c\) 2026 bugabinga/);
        assert.match(licenseMd, /THE SOFTWARE IS PROVIDED "AS IS"/);
    });
});

describe("GitHub Actions health", () => {
    it("runs all test tiers including mutation", () => {
        assert.doesNotMatch(ciYml, /MINIMAX_(?:API_)?KEY/);
        assert.doesNotMatch(updatesYml, /MINIMAX_(?:API_)?KEY/);
        assert.match(ciYml, /run: bun install --frozen-lockfile/);
        assert.match(ciYml, /run: just ci-test-all/);
        assert.match(ciYml, /run: just test-e2e/);
        assert.match(ciYml, /run: just test-mutation/);
        assert.match(ciYml, /browser-actions\/setup-chrome@v2\.1\.1/);
        assert.match(ciYml, /install-dependencies: true/);
        assert.doesNotMatch(ciYml, /flaky apt source/);
        assert.match(ciYml, /CHROMIUM_PATH=/);
        assert.match(justfile, /ci-test-all: ci-check build test-unit test-integration/);
        assert.match(justfile, /test-all: check build test-unit test-integration/);
        assert.match(justfile, /ci-check: fmt-check lint/);
    });

    it("caches Bun deps and uploads mutation HTML artifacts", () => {
        assert.match(ciYml, /bun-version: 1\.3\.13/);
        assert.match(ciYml, /actions\/checkout@v6\.0\.2/);
        assert.match(ciYml, /oven-sh\/setup-bun@v2\.2\.0/);
        assert.match(ciYml, /actions\/cache@v5\.0\.5/);
        assert.match(ciYml, /taiki-e\/install-action@v2\.75\.28/);
        assert.match(ciYml, /tool: just/);
        assert.match(ciYml, /path: ~\/\.bun\/install\/cache/);
        assert.match(ciYml, /hashFiles\('bun\.lock'\)/);
        assert.match(ciYml, /actions\/upload-artifact@v7\.0\.1/);
        assert.match(ciYml, /if: \$\{\{ always\(\) \}\}/);
        assert.match(ciYml, /name: mutation-reports/);
        assert.match(ciYml, /path: reports\/mutation\//);
        assert.match(strykerAgent, /reporters: \["clear-text", "progress", "html"\]/);
        assert.match(strykerAgent, /fileName: "reports\/mutation\/agent\.html"/);
        assert.match(strykerTools, /fileName: "reports\/mutation\/tools\.html"/);
        assert.match(strykerDb, /fileName: "reports\/mutation\/db\.html"/);
    });

    it("builds container and checks dependency updates", () => {
        assert.match(ciYml, /container:/);
        assert.match(ciYml, /docker build -f deploy\/Dockerfile -t hallucygenie:ci \./);
        assert.doesNotMatch(ciYml, /env\.ACT/);
        assert.doesNotMatch(ciYml, /act \+ Podman/);
        assert.match(updatesYml, /schedule:/);
        assert.match(updatesYml, /workflow_dispatch:/);
        assert.match(updatesYml, /run: just update-check/);
        assert.match(justfile, /container-build:/);
        assert.match(justfile, /docker build -f deploy\/Dockerfile -t hallucygenie:local \./);
        assert.match(justfile, /update-check:/);
        assert.match(justfile, /bun outdated --latest/);
    });

    it("has no local act runner recipes", () => {
        assert.doesNotMatch(justfile, /\bACT_/);
        assert.doesNotMatch(justfile, /\bci-act(?:\b|-)/);
        assert.doesNotMatch(justfile, /\bagent-(?:spec|bugs|deslop|all)\b/);
        assert.doesNotMatch(justfile, /\bact\b/);
        assert.equal(existsSync("deploy/act/Dockerfile"), false);
        assert.doesNotMatch(gitignore, /\.artifacts\//);
        assert.doesNotMatch(gitignore, /\.act-cache\//);
    });

    it("prepare installs hooks only inside a git repo", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
            packageManager: string;
            scripts: Record<string, string>;
        };
        assert.equal(pkg.packageManager, "bun@1.3.13");
        assert.deepEqual(Object.keys(pkg.scripts), ["prepare"]);
        assert.match(pkg.scripts.prepare, /git rev-parse --git-dir/);
        assert.match(pkg.scripts.prepare, /lefthook install/);
    });
});

describe("layout health", () => {
    it("deploy image uses optimized Bun multi-stage build", () => {
        assert.match(deployDockerfile, /^FROM docker\.io\/oven\/bun:1\.3\.13 AS build/m);
        assert.match(deployDockerfile, /^FROM docker\.io\/oven\/bun:1\.3\.13 AS runtime/m);
        assert.match(deployDockerfile, /--mount=type=cache,target=\/root\/\.bun\/install\/cache/);
        assert.match(deployDockerfile, /COPY package\.json bun\.lock \./);
        assert.match(deployDockerfile, /COPY public \.\/public/);
        assert.match(deployDockerfile, /COPY src \.\/src/);
        assert.match(deployDockerfile, /COPY migrations \.\/migrations/);
        assert.match(
            deployDockerfile,
            /COPY --from=build \/app\/public\/app\.js \.\/public\/app\.js/,
        );
        assert.match(deployDockerfile, /bunx esbuild public\/app\.ts/);
        assert.doesNotMatch(deployDockerfile, /COPY \. \./);
    });

    it("deploy build context excludes local caches and generated artifacts", () => {
        for (const path of [
            ".git",
            ".env",
            "node_modules",
            "coverage",
            "reports",
            "data",
            "logs",
            ".stryker-tmp",
            "public/app.js",
            "test-data*",
        ]) {
            assert.match(
                dockerignore,
                new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"),
            );
        }
    });

    it("keeps source in src, tests in test, deploy in deploy", () => {
        for (const file of ["server.ts", "agent.ts", "tools.ts", "db.ts", "log.ts"]) {
            assert.equal(existsSync(file), false, `${file} should not be in repo root`);
            assert.equal(existsSync(`src/${file}`), true, `src/${file} should exist`);
        }
        for (const file of ["server.test.ts", "agent.test.ts", "tools.test.ts", "db.test.ts"]) {
            assert.equal(existsSync(file), false, `${file} should not be in repo root`);
            assert.equal(existsSync(`test/${file}`), true, `test/${file} should exist`);
        }
        assert.equal(existsSync("deploy/Dockerfile"), true);
        assert.equal(existsSync("deploy/hallucygenie.container"), true);
    });

    it("ignores generated frontend bundle and local test artifacts", () => {
        assert.match(gitignore, /public\/app\.js/);
        assert.doesNotMatch(gitignore, /\.pulse\.json/);
        assert.match(gitignore, /test-data\*\//);
    });
});

describe("removed profile UI cleanup", () => {
    it("has no stale personality selector references in source or generated bundle", () => {
        const sourceFiles = [indexHtml, styleCss, appTs, serverTs, appJs];
        for (const text of sourceFiles) {
            assert.equal(/personality/i.test(text), false);
        }
    });
});

// HallucyGenie — static project health tests

import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const indexHtml = readFileSync("public/index.html", "utf-8");
const styleCss = readFileSync("public/style.css", "utf-8");
const appTs = readFileSync("public/app.ts", "utf-8");
const miseToml = existsSync("mise.toml") ? readFileSync("mise.toml", "utf-8") : "";
const miseTaskDir = ".mise/tasks";
const miseTasks = existsSync(miseTaskDir)
    ? readdirSync(miseTaskDir).sort().map((name) => readFileSync(`${miseTaskDir}/${name}`, "utf-8"))
        .join("\n")
    : "";
const commandConfig = [miseToml, miseTasks].join("\n");
const serverTs = readFileSync("src/server.ts", "utf-8");
const agentTest = readFileSync("test/unit/agent.test.ts", "utf-8");
const dbTest = readFileSync("test/unit/db.test.ts", "utf-8");
const e2eRunner = readFileSync("e2e/run-e2e.ts", "utf-8");
const serverTest = readFileSync("test/unit/server.test.ts", "utf-8");
const gitignore = readFileSync(".gitignore", "utf-8");
const containerignore = readFileSync(".containerignore", "utf-8");
const dprintJson = readFileSync("dprint.json", "utf-8");
const biomeJson = readFileSync("biome.json", "utf-8");
const sqruffConfig = readFileSync(".sqruff", "utf-8");
const packageJson = readFileSync("package.json", "utf-8");
const lefthookYml = readFileSync("lefthook.yml", "utf-8");
const ciYml = readFileSync(".github/workflows/ci.yml", "utf-8");
const releaseYml = readFileSync(".github/workflows/release.yml", "utf-8");
const dependabotYml = readFileSync(".github/dependabot.yml", "utf-8");
const agentsYml = readFileSync(".github/workflows/agents.yml", "utf-8");
const janitorAgent = readFileSync(".github/agents/janitor.ts", "utf-8");
const agentLib = readFileSync(".github/agents/lib.ts", "utf-8");
const agentModelsJson = readFileSync(".github/agents/models.json", "utf-8");
const robotnikAgent = readFileSync(".github/agents/robotnik.ts", "utf-8");
const slopChopperAgent = readFileSync(".github/agents/slop-chopper.ts", "utf-8");
const strykerAgent = readFileSync("test/stryker.config.mjs", "utf-8");
const strykerTools = readFileSync("test/stryker-tools.mjs", "utf-8");
const strykerDb = readFileSync("test/stryker-db.mjs", "utf-8");
const deployContainerfile = readFileSync("deploy/Containerfile", "utf-8");
const agentsMd = readFileSync("AGENTS.md", "utf-8");
const issuePrompt = readFileSync(".pi/prompts/issue.md", "utf-8");
const manualPrompt = readFileSync(".pi/prompts/manual.md", "utf-8");
const minimaxResearchPrompt = readFileSync(".pi/prompts/minimax-research.md", "utf-8");
const releasePrompt = readFileSync(".pi/prompts/release.md", "utf-8");
const updateFontsScript = readFileSync("scripts/update-fonts.ts", "utf-8");
const readmeMd = readFileSync("README.md", "utf-8");
const changelogMd = readFileSync("CHANGELOG.md", "utf-8");
const envExample = readFileSync(".env.example", "utf-8");
const licenseMd = readFileSync("LICENSE", "utf-8");
const rulesMd = readFileSync(".system/RULES.md", "utf-8");
const systemExtension = readFileSync(".pi/extensions/system.ts", "utf-8");
const musicCreatorSpec = readFileSync(
    ".system/specs/HG-SPEC-012-minimax-music-creator-tools.md",
    "utf-8"
);
const musicCoverSpec = readFileSync(
    ".system/specs/HG-SPEC-013-minimax-music-cover-reference-tracks.md",
    "utf-8"
);
const trackedFiles = new Set(
    execFileSync("git", ["ls-files"], { encoding: "utf-8" }).trim().split("\n").filter(
        Boolean
    )
);
const legacyFormatter = "pre" + "ttier";

type FontManifest = {
    version: number;
    source: { repo: string; commit: string; downloaded_by: string; };
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

function testWindow(): Window {
    const win = new Window();
    (win as unknown as { SyntaxError: typeof SyntaxError; }).SyntaxError = SyntaxError;
    return win;
}

function parseIndex(): Document {
    const win = testWindow();
    win.document.body.innerHTML = indexHtml;
    const head = indexHtml.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
    win.document.head.innerHTML = head.replace(/^<head>|<\/head>$/g, "");
    return win.document as unknown as Document;
}

function visibleText(el: Element | null | undefined): string {
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
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
        const icon = doc.querySelector("link[rel=\"icon\"]") as HTMLLinkElement | null;
        assert.ok(icon?.href);
    });

    it("has formatter-neutral user-visible text", () => {
        const doc = parseIndex();
        assert.equal(
            visibleText(doc.querySelector(".message--welcome .message-content")),
            "Hey! 👋 I'm HallucyGenie. Ask me anything — I can chat, make images 🔥, do voices 🎙️, and create music 🎵"
        );
        assert.match(visibleText(doc.querySelector("#quota-badge")), /🧮\s*—\s*🎬\s*—/);
    });

    it("has no formatter-specific ignore comments", () => {
        const ignoreCommentPattern = [legacyFormatter, "dprint", "biome"]
            .map((tool) => `${tool}-ignore`)
            .join("|");
        assert.doesNotMatch(indexHtml, new RegExp(ignoreCommentPattern));
    });

    it("create type switcher uses ARIA tabs", () => {
        const doc = parseIndex();
        const tabNames = ["image", "music", "cover", "voice", "analyze", "search", "assets"];
        for (const name of tabNames) {
            const tab = doc.querySelector(`.create-tab[data-tab="${name}"]`) as HTMLElement | null;
            const panel = doc.querySelector(
                `.create-panel[data-panel="${name}"]`
            ) as HTMLElement | null;
            assert.equal(tab?.getAttribute("role"), "tab", `${name} tab role`);
            assert.equal(tab?.id, `create-tab-${name}`, `${name} tab id`);
            assert.equal(tab?.getAttribute("aria-controls"), panel?.id, `${name} controls`);
            assert.equal(panel?.getAttribute("role"), "tabpanel", `${name} panel role`);
            assert.equal(panel?.getAttribute("aria-labelledby"), tab?.id, `${name} labelledby`);
        }
        assert.equal(
            doc.querySelector(".create-tab[data-tab=\"image\"]")?.getAttribute("aria-selected"),
            "true"
        );
        assert.equal(
            doc.querySelector(".create-tab[data-tab=\"music\"]")?.getAttribute("aria-selected"),
            "false"
        );
    });

    it("viewport permits browser zoom", () => {
        const doc = parseIndex();
        const viewport = doc.querySelector("meta[name=\"viewport\"]")?.getAttribute("content")
            ?? "";
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

    it("has accessible child-friendly changelog entry point", () => {
        const doc = parseIndex();
        const btn = doc.querySelector("#whats-new-btn");
        const modal = doc.querySelector("#whats-new-modal");
        assert.equal(btn?.textContent, "v1.0");
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "whats-new-title");
        assert.match(modal?.textContent ?? "", /What’s new in v1\.0/);
        assert.match(modal?.textContent ?? "", /video/i);
        assert.match(modal?.textContent ?? "", /reference/i);
        assert.match(modal?.textContent ?? "", /long narration/i);
        assert.match(modal?.textContent ?? "", /No built-in\s+auth/);
        assert.match(appTs, /openWhatsNew/);
        assert.match(appTs, /trapFocus\(whatsNewModal/);
    });

    it("has accessible labels for form controls", () => {
        const doc = parseIndex();
        const offenders = Array.from(doc.querySelectorAll("input, textarea, select"))
            .filter((el) => (el as HTMLInputElement).type !== "hidden")
            .filter((el) => ((el as HTMLInputElement).labels?.length ?? 0) === 0)
            .map((el) => el.id || el.outerHTML);
        assert.deepEqual(offenders, []);
        assert.equal(doc.querySelector("#music-instrumental"), null);
    });

    it("keeps Create UI on the kid-safe MiniMax parameter subset", () => {
        const doc = parseIndex();
        for (
            const id of [
                "#img-count",
                "#img-size",
                "#img-seed",
                "#img-seed-random",
                "#img-seed-clear",
                "#img-submit",
                "#img-width",
                "#img-height",
                "#img-prompt-optimizer",
                "#voice-id",
                "#voice-speed",
                "#voice-volume",
                "#voice-pitch"
            ]
        ) {
            assert.ok(doc.querySelector(id), id);
        }
        for (
            const forbiddenId of [
                "#img-response-format",
                "#img-subject-reference",
                "#voice-emotion",
                "#voice-language-boost",
                "#voice-output-format",
                "#voice-subtitle-enable",
                "#music-instrumental",
                "#music-lyrics-optimizer",
                "#music-output-format",
                "#music-audio-base64"
            ]
        ) {
            assert.equal(doc.querySelector(forbiddenId), null, forbiddenId);
        }
        assert.match(appTs, /input\.n = imageCount/);
        assert.match(appTs, /input\.seed = imageSeed/);
        assert.match(appTs, /imageSeedForSubmit\(imgCountInput\.value, imgSeedInput\.value\)/);
        assert.match(appTs, /input\.width = Number\(imgWidthInput\.value\.trim\(\)\)/);
        assert.match(appTs, /input\.height = Number\(imgHeightInput\.value\.trim\(\)\)/);
        assert.doesNotMatch(appTs, /response_format|audio_base64|lyrics_optimizer/);
    });

    it("uses kid-friendly controls for bounded Create params", () => {
        const doc = parseIndex();
        assert.equal(doc.querySelector("#img-count")?.tagName.toLowerCase(), "select");
        assert.equal(doc.querySelector("#img-size")?.tagName.toLowerCase(), "select");
        assert.equal(doc.querySelector("#img-seed")?.getAttribute("type"), "hidden");
        assert.equal(doc.querySelector("#img-width")?.getAttribute("type"), "hidden");
        assert.equal(doc.querySelector("#img-height")?.getAttribute("type"), "hidden");
        assert.equal(doc.querySelector("#voice-id")?.tagName.toLowerCase(), "select");
        assert.equal(doc.querySelector("#voice-volume")?.getAttribute("type"), "range");
        assert.equal(doc.querySelector("#voice-pitch")?.getAttribute("type"), "range");
        assert.match(indexHtml, /Let Genie improve my idea before drawing/);
        assert.match(indexHtml, /same code can make a similar picture again/);
        assert.equal(doc.querySelector("#img-submit")?.hasAttribute("disabled"), true);
        assert.equal(doc.querySelector("#img-seed-clear")?.hasAttribute("disabled"), true);
        assert.doesNotMatch(
            indexHtml,
            /Optimize prompt|Volume \(optional|Pitch \(optional|<label for="img-seed">Seed/
        );
        assert.deepEqual(
            Array.from(doc.querySelectorAll("#voice-id optgroup")).map((group) =>
                group.getAttribute("label")
            ),
            ["English", "Deutsch", "Europe", "Rest"]
        );
    });

    it("groups related Create image helper text tightly before the action", () => {
        const doc = parseIndex();
        const group = doc.querySelector("#create-image-form .create-option-group");
        const checkbox = doc.querySelector("label[for='img-prompt-optimizer']");
        const help = group?.querySelector(".field-help");
        const submit = doc.querySelector("#create-image-form .create-submit");
        assert.ok(checkbox);
        assert.ok(help);
        assert.ok(group?.contains(checkbox));
        assert.ok(group?.contains(help));
        assert.equal(visibleText(submit), "Generate image 🎨");
        assert.match(styleCss, /\.create-option-group \{[\s\S]*margin-bottom: var\(--space-lg\);/);
        assert.match(
            styleCss,
            /\.create-option-group \.checkbox-row \{[\s\S]*margin-bottom: 2px;/
        );
        assert.match(styleCss, /\.create-submit \{[\s\S]*margin-top: var\(--space-sm\);/);
    });

    it("Create forms do not send internal tool directives through chat", () => {
        assert.doesNotMatch(appTs, /Use generate_|Use analyze_|Use text_to_speech|Tool params:/);
        assert.match(appTs, /\/api\/create-tool/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"generate_image"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"generate_music"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"generate_music_cover"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"text_to_speech"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"generate_long_speech"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"generate_lyrics"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"analyze_image"/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"web_search"/);
    });

    it("has a 'Write lyrics for me' button in the music form", () => {
        const doc = parseIndex();
        const btn = doc.querySelector("#write-lyrics-btn");
        assert.ok(btn, "Write lyrics button should exist");
        assert.equal(btn?.tagName.toLowerCase(), "button");
    });

    it("has a separate two-step music cover flow", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector(".create-tab[data-tab=\"cover\"]"));
        assert.equal(doc.querySelector("#create-music-form #cover-source-kind"), null);
        assert.equal(
            doc.querySelector("#create-cover-form")?.getAttribute("data-panel"),
            "cover"
        );
        for (
            const id of [
                "#cover-source-kind",
                "#cover-audio-url",
                "#cover-audio-file",
                "#cover-style",
                "#cover-preprocess",
                "#cover-feature-id",
                "#cover-status",
                "#cover-lyrics",
                "#cover-generate"
            ]
        ) {
            assert.ok(doc.querySelector(`#create-cover-form ${id}`), id);
        }
        assert.match(appTs, /\/api\/music-cover\/status/);
        assert.match(appTs, /\/api\/music-cover\/preprocess/);
        assert.match(appTs, /youtube\.disabled = true/);
        assert.match(appTs, /generate_music_cover: "cover"/);
        assert.match(appTs, /resetCoverPreparedState/);
        assert.equal(doc.querySelector("#cover-generate")?.hasAttribute("disabled"), true);
    });

    it("keeps long narration inside Voice instead of a separate top-level tab", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector(".create-tab[data-tab=\"voice\"]"));
        assert.equal(doc.querySelector(".create-tab[data-tab=\"narration\"]"), null);
        assert.equal(doc.querySelector("#create-narration-form"), null);
        assert.equal(doc.querySelector("#voice-text")?.getAttribute("maxlength"), "50000");
        assert.match(indexHtml, /Long scripts use background narration automatically/);
        assert.match(appTs, /const LONG_VOICE_TEXT_THRESHOLD = 1000/);
    });

    it("has compact voice pause and interjection composer controls", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector("#voice-pause-duration"));
        assert.ok(doc.querySelector("#voice-insert-pause"));
        assert.ok(doc.querySelector("#voice-interjection"));
        assert.ok(doc.querySelector("#voice-insert-interjection"));
        assert.equal(doc.querySelectorAll(".voice-interjection[data-tag]").length, 0);
        assert.deepEqual(
            Array.from(doc.querySelectorAll("#voice-interjection option")).map((el) =>
                el.getAttribute("value")
            ),
            [
                "laughs",
                "chuckle",
                "coughs",
                "clear-throat",
                "groans",
                "breath",
                "pant",
                "inhale",
                "exhale",
                "gasps",
                "sniffs",
                "sighs",
                "snorts",
                "burps",
                "lip-smacking",
                "humming",
                "hissing",
                "emm",
                "sneezes"
            ]
        );
        assert.match(appTs, /insertVoiceInterjection/);
        assert.match(appTs, /` \(\$\{tag\}\) `/);
        assert.doesNotMatch(appTs, /` <\$\{button\.dataset\.tag\}> `/);
        assert.match(indexHtml, /speech-2\.8-hd/);
        assert.doesNotMatch(styleCss, /\.voice-interjection \{/);
    });

    it("chat input handles pasted images through asset upload", () => {
        assert.match(appTs, /input\.addEventListener\("paste"/);
        assert.match(appTs, /uploadAnalyzeImage\(file\)/);
        assert.match(appTs, /"analyze_image"/);
        assert.doesNotMatch(appTs, /readAsDataURL/);
    });

    it("uses child-readable base sizing", () => {
        assert.match(styleCss, /body \{[\s\S]*font-size: 18px;/);
        assert.match(styleCss, /\.message-bubble \{[\s\S]*font-size: 17px;/);
        assert.match(styleCss, /\.form-group input,[\s\S]*font-size: 1rem;/);
        assert.match(styleCss, /\.error-toast \{[\s\S]*z-index: 2000;/);
    });

    it("quota badge mirrors MiniMax provider quota shape", () => {
        const doc = parseIndex();
        assert.ok(doc.querySelector(".quota-item[data-type=\"general\"]"));
        assert.ok(doc.querySelector(".quota-item[data-type=\"video\"]"));
        assert.equal(doc.querySelector(".quota-item[data-type=\"image\"]"), null);
        assert.equal(doc.querySelector(".quota-item[data-type=\"speech\"]"), null);
        assert.equal(doc.querySelector(".quota-item[data-type=\"music\"]"), null);
        assert.equal(doc.querySelector(".quota-item[data-type=\"lyrics\"]"), null);
    });

    it("create modal has dialog ARIA", () => {
        const doc = parseIndex();
        const modal = doc.querySelector("#create-modal") as HTMLElement | null;
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "create-title");
    });

    it("desktop dialogs use full viewport budget before internal scroll", () => {
        assert.match(styleCss, /\.modal-content \{[\s\S]*max-height: calc\(100dvh - 24px\);/);
        assert.match(
            styleCss,
            /\.profile-modal-content \{[\s\S]*max-height: calc\(100dvh - 24px\);/
        );
        assert.match(styleCss, /@media \(max-height: 700px\) \{[\s\S]*\.create-panels/);
        assert.doesNotMatch(styleCss, /max-height: 80vh/);
        assert.doesNotMatch(styleCss, /max-height: min\(86dvh/);
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
            [
                "#.header-emoji",
                "#.header-title",
                "#whats-new-btn.whats-new-btn",
                "#connection-status.status-dot"
            ]
        );
        assert.deepEqual(
            Array.from(headerRight?.children ?? []).map((el) => `#${el.id}.${el.className}`),
            [
                "#.session-switcher",
                "#profile-btn.profile-btn",
                "#create-btn.create-btn",
                "#quota-badge.quota-badge"
            ]
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
            /\.session-switcher \{[^}]*linear-gradient\(135deg, rgba\(255, 255, 255, 0\.1\), var\(--color-bg-card\)\)/
        );
        assert.match(styleCss, /\.session-select \{[^}]*appearance: none;/);
        assert.match(styleCss, /\.session-select \{[^}]*border: 0;/);
        assert.match(styleCss, /\.session-select \{[^}]*M4 6l4 4 4-4/);
        assert.match(
            styleCss,
            /\.session-select option \{[^}]*background: var\(--color-surface\);/
        );
        assert.match(
            styleCss,
            /\.session-new \{[^}]*border-left: 1px solid var\(--color-border\);/
        );
        assert.match(styleCss, /\.session-new \{[^}]*background: transparent;/);
        assert.doesNotMatch(styleCss, /\.session-new \{[^}]*linear-gradient/);
    });

    it("keeps mobile header title visible while actions wrap below", () => {
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*#header \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.header-right \{[\s\S]*display: grid;/
        );
        assert.match(
            styleCss,
            /grid-template-areas:[\s\S]*"sessions sessions sessions"[\s\S]*"profile create quota"/
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-switcher \{[\s\S]*grid-area: sessions;/
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-switcher \{[\s\S]*width: 100%;/
        );
        assert.match(
            styleCss,
            /@media \(max-width: 560px\) \{[\s\S]*\.session-select \{[\s\S]*width: 100%;/
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
        assert.ok(doc.querySelector(".create-tab[data-tab=\"analyze\"]"));
        assert.ok(doc.querySelector("#create-analyze-form[data-panel=\"analyze\"]"));
        assert.ok(doc.querySelector("label[for=\"analyze-file\"]"));
        assert.ok(doc.querySelector("input#analyze-file[type=\"file\"]"));
        assert.deepEqual(
            doc.querySelector("#analyze-file")?.getAttribute("accept")?.split(",").map((item) =>
                item.trim()
            ),
            ["image/png", "image/jpeg", "image/webp", "image/gif"]
        );
        assert.ok(
            doc.querySelector("#analyze-dropzone[aria-describedby*=\"analyze-file-status\"]")
        );
        assert.ok(doc.querySelector("#analyze-file-status[role=\"status\"]"));
        assert.ok(doc.querySelector("#analyze-file-preview[hidden]"));
        assert.ok(doc.querySelector("label[for=\"analyze-url\"]"));
        assert.ok(doc.querySelector("label[for=\"analyze-prompt\"]"));
        assert.match(appTs, /uploadAnalyzeImage\(file: File\)/);
        assert.match(appTs, /PNG, JPG, GIF, or WebP/);
        assert.match(appTs, /analyzeDropzone\.addEventListener\("drop"/);
        assert.match(appTs, /\["image\/png", "image\/jpeg", "image\/webp", "image\/gif"\]/);
        assert.match(appTs, /sendCreateTool\([\s\S]*"analyze_image"/);
        assert.doesNotMatch(appTs, /FileReader|readAsDataURL/);
    });

    it("lightbox is an accessible dialog", () => {
        const doc = parseIndex();
        const lightbox = doc.querySelector("#lightbox") as HTMLElement | null;
        assert.equal(lightbox?.getAttribute("role"), "dialog");
        assert.equal(lightbox?.getAttribute("aria-modal"), "true");
        assert.equal(lightbox?.getAttribute("aria-label"), "Image preview");
    });

    it("layers image lightbox above open modals", () => {
        const modalZ = Number(styleCss.match(/\.modal \{[\s\S]*?z-index: (\d+);/)?.[1]);
        const lightboxZ = Number(styleCss.match(/\.lightbox \{[\s\S]*?z-index: (\d+);/)?.[1]);
        assert.ok(lightboxZ > modalZ, `lightbox ${lightboxZ} <= modal ${modalZ}`);
    });

    it("profile button and modal have accessible labels", () => {
        const doc = parseIndex();
        assert.equal(
            doc.querySelector("#profile-btn")?.getAttribute("aria-label"),
            "Open profile"
        );
        const modal = doc.querySelector("#profile-modal") as HTMLElement | null;
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "profile-title");
        assert.equal(doc.querySelector("#profile-generate")?.hasAttribute("disabled"), false);
    });

    it("profile fields have distinct guidance and asset avatar controls", () => {
        const doc = parseIndex();
        assert.equal(
            doc.querySelector("label[for=\"profile-interests\"]")?.textContent,
            "Topics to bring up"
        );
        assert.equal(
            doc.querySelector("label[for=\"profile-favorites\"]")?.textContent,
            "Style ingredients"
        );
        assert.equal(doc.querySelector("#profile-avatar"), null);
        assert.equal(indexHtml.includes("Avatar emoji"), false);
        assert.ok(doc.querySelector("#profile-avatar-preview"));
        assert.equal(doc.querySelector("#profile-avatar-fallback")?.textContent, "🎮");
        assert.ok(doc.querySelector("#profile-avatar-img"));
        assert.equal(doc.querySelector("#profile-avatar-upload")?.getAttribute("type"), "file");
        assert.equal(indexHtml.toLowerCase().includes("email"), false);
        assert.equal(appTs.includes("type: \"emoji\""), false);
        assert.equal(serverTs.includes("type: \"emoji\""), false);
        assert.equal(agentTest.includes("type: \"emoji\""), false);
        assert.equal(e2eRunner.includes("fill(\"#profile-avatar\")"), false);
        assert.equal(e2eRunner.includes("toHaveValue(\"🦊\")"), false);
        assert.match(dbTest, /avatar: \{ type: "emoji", value: "🦊" \}[\s\S]*avatar type invalid/);
        assert.match(
            serverTest,
            /avatar: \{ type: "emoji", value: "🦊" \}[\s\S]*avatar type invalid/
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

    it("keeps avatar generation inside the avatar editor", () => {
        const doc = parseIndex();
        const editor = doc.querySelector(".profile-avatar-editor");
        const generate = doc.querySelector("#profile-generate");
        const actions = doc.querySelector(".profile-actions");
        assert.ok(editor?.contains(generate));
        assert.equal(actions?.contains(generate), false);
        assert.deepEqual(
            Array.from(actions?.querySelectorAll("button") ?? []).map((button) =>
                visibleText(button)
            ),
            ["Save", "Reset"]
        );
    });

    it("lets assistant tool cards use the wide message row", () => {
        assert.match(
            styleCss,
            /\.message--assistant \.message-bubble:has\(\.tool-card\) \{[\s\S]*width: min\(100%, calc\(var\(--content-max-width\) - 48px\)\);/
        );
        assert.match(
            styleCss,
            /\.message--assistant \.message-bubble:has\(\.tool-card\) \{[\s\S]*max-width: calc\(100% - 42px\);/
        );
        assert.match(styleCss, /\.tool-card \{[\s\S]*width: 100%;/);
        assert.match(
            styleCss,
            /\.tool-result-audio,\n\.tool-result-video \{[\s\S]*display: block;/
        );
    });

    it("shows tool input details and tweak affordance", () => {
        assert.match(appTs, /function renderToolInputDetails/);
        assert.match(appTs, /class: "tool-input-details"/);
        assert.match(appTs, /class: "tool-tweak-button"/);
        assert.match(appTs, /hallucygenie:tweak-tool/);
        assert.match(appTs, /sanitizeToolInput/);
        assert.match(appTs, /appendHighlightedJson/);
        assert.doesNotMatch(appTs, /value\.slice\(0, 500\)/);
        assert.doesNotMatch(appTs, /data:image\/png;base64,raw/);
        assert.match(styleCss, /\.tool-input-details \{[\s\S]*margin-top: var\(--space-sm\);/);
        assert.match(styleCss, /\.json-key \{/);
        assert.match(styleCss, /\.tool-tweak-button \{[\s\S]*min-height: 32px;/);
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
        assert.equal(badge?.getAttribute("title"), "MiniMax general and video quota");
        assert.equal(badge?.getAttribute("aria-label"), "MiniMax general and video quota");
        assert.ok(doc.querySelector(".quota-item[data-type=\"general\"]"));
        assert.ok(doc.querySelector(".quota-item[data-type=\"video\"]"));
        assert.equal(styleCss.includes(".quota-badge:hover"), false);
        assert.match(styleCss, /\.quota-badge \{[^}]*cursor: default;/);
    });

    it("steering hint is outside input layout flow", () => {
        assert.match(styleCss, /\.steer-hint \{[^}]*position: absolute;/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*margin-top:/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*animation:/);
    });

    it("thinking indicator is accessible but not visual layout", () => {
        assert.match(indexHtml, /<footer id="input-area">[\s\S]*id="typing-indicator"/);
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*role="status"/);
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*aria-live="polite"/);
        assert.match(indexHtml, /id="typing-indicator"[\s\S]*aria-label="Genie is thinking"/);
        const doc = testWindow().document;
        doc.body.innerHTML = indexHtml;
        assert.equal(doc.querySelector("#typing-indicator")?.hasAttribute("hidden"), false);
        assert.match(styleCss, /\.typing-indicator \{[^}]*position: absolute;/);
        assert.match(styleCss, /\.typing-indicator \{[^}]*width: 1px;/);
        assert.match(styleCss, /\.typing-indicator \{[^}]*height: 1px;/);
        assert.match(styleCss, /\.typing-indicator \{[^}]*overflow: hidden;/);
        assert.doesNotMatch(styleCss, /\.typing-indicator \{[^}]*min-height:/);
        assert.doesNotMatch(styleCss, /\.typing-indicator\.is-visible \{/);
        assert.match(appTs, /typingIndicator\.classList\.add\("is-visible"\)/);
        assert.match(appTs, /typingIndicator\.classList\.remove\("is-visible"\)/);
        assert.doesNotMatch(appTs, /typingIndicator\.hidden\s*=/);
    });

    it("assistant streaming animation is low-risk and reduced-motion safe", () => {
        assert.match(styleCss, /\.assistant-text-region\.is-streaming/);
        assert.match(styleCss, /\.assistant-text-region\.is-streaming \{[^}]*position: relative;/);
        assert.match(styleCss, /\.stream-chunk/);
        assert.match(styleCss, /@keyframes stream-chunk-in/);
        assert.match(styleCss, /@keyframes caret-blink/);
        assert.match(
            styleCss,
            /\.assistant-text-region\.is-streaming::after \{[^}]*position: absolute;/
        );
        assert.match(styleCss, /\.assistant-text-region\.is-streaming::after \{[^}]*width: 0;/);
        assert.match(
            styleCss,
            /\.assistant-text-region\.is-streaming::after \{[^}]*overflow: visible;/
        );
        assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*animation: stream-chunk-in/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*display: inline-block;/);
        assert.match(
            styleCss,
            /@keyframes stream-chunk-in \{[\s\S]*clip-path: inset\(0 100% 0 0\)/
        );
        assert.match(styleCss, /\.stream-chunk \{[^}]*steps\(8, end\)/);
        assert.doesNotMatch(styleCss, /\.stream-char/);
        assert.doesNotMatch(styleCss, /\.stream-render-tick/);
    });

    it("create modal has stable shell and small-height scroll region", () => {
        assert.match(styleCss, /\.create-modal-content \{[^}]*display: flex;/);
        assert.match(styleCss, /\.create-modal-content \{[^}]*max-height: calc\(100dvh - 24px\);/);
        assert.match(styleCss, /\.create-panels \{[^}]*min-height: 0;/);
        assert.match(styleCss, /\.create-panels \{[^}]*overflow-y: visible;/);
        assert.match(
            styleCss,
            /@media \(max-height: 700px\) \{[\s\S]*\.create-panels \{[\s\S]*overflow-y: auto;/
        );
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
        assert.match(styleCss, /@media \(max-height: 700px\) \{[\s\S]*overflow-y: auto;/);
    });

    it("create form controls have visible left borders", () => {
        assert.match(styleCss, /\.create-panels \{[^}]*padding: 0 2px;/);
        assert.match(
            styleCss,
            /\.form-group textarea,[\s\S]*?\.form-group select \{[\s\S]*?border-left-color: rgba\(255, 255, 255, 0\.28\);/
        );
    });

    it("assistant markdown spacing and images are contained", () => {
        assert.match(styleCss, /\.message-content \{[^}]*white-space: normal;/);
        assert.match(
            styleCss,
            /\.message--user \.message-content,[\s\S]*?\.message--steer \.message-content \{[\s\S]*?white-space: pre-wrap;/
        );
        assert.match(
            styleCss,
            /\.message--assistant \.message-content p \{[^}]*margin: 0\.25rem 0;/
        );
        assert.match(
            styleCss,
            /\.message--assistant \.message-content li \{[^}]*line-height: 1\.45;/
        );
        assert.match(styleCss, /\.markdown-image \{[^}]*max-width: min\(100%, 320px\);/);
        assert.match(styleCss, /\.markdown-image \{[^}]*max-height: min\(45vh, 260px\);/);
    });

    it("static file containment has a path-separator boundary", () => {
        assert.match(
            serverTs,
            /filePath !== publicDir && !filePath\.startsWith\(`\$\{publicDir\}\$\{sep\}`\)/
        );
        assert.doesNotMatch(serverTs, /if \(!filePath\.startsWith\(publicDir\)\) return null;/);
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
        assert.equal(manifest.source.downloaded_by, "mise run fonts");
        assert.deepEqual(manifest.fonts.map((font) => font.id).sort(), [
            "pixelify-sans",
            "playwrite-de-sas",
            "roboto-flex"
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
                const font = manifest.fonts.find((item) => item.id === id);
                assert.ok(font);
                return `${font.file.replace(/^public/, "")}?v=${font.sha256.slice(0, 12)}`;
            })
        );
    });

    it("cache-busts CSS font URLs with manifest SHA prefixes", () => {
        const manifest = loadFontManifest();
        for (const font of manifest.fonts) {
            const urlPath = font.file.replace(/^public/, "");
            assert.ok(
                styleCss.includes(`${urlPath}?v=${font.sha256.slice(0, 12)}`),
                `${font.id} cache-buster`
            );
        }
    });

    it("targets real rendered selectors for user, assistant, and UI fonts", () => {
        for (
            const selector of [
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
                ".steer-hint"
            ]
        ) {
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
        assert.equal(appTs.includes("hallucygenie_session_id"), false);
        assert.equal(appTs.includes("LEGACY_SESSION_KEY"), false);
        assert.equal(appTs.includes("X-Session-Id"), false);
    });

    it("uses active-session asset API URLs without session query", () => {
        assert.match(appTs, /asset\.url/);
        assert.match(appTs, /asset\.download_url/);
        assert.equal(appTs.includes("?s="), false);
    });

    it("does not write profile state to localStorage", () => {
        assert.equal(appTs.includes("hallucygenie_user_profile_v1"), false);
        assert.doesNotMatch(appTs, /localStorage\.setItem\([^)]*profile/i);
        assert.match(appTs, /\/api\/profile/);
    });

    it("uses localStorage only for onboarding", () => {
        assert.equal(appTs.includes("hallucygenie_recent_error"), false);
        assert.doesNotMatch(appTs, /restoreRecentError|saveRecentError|clearRecentError/);
        assert.doesNotMatch(appTs, /localStorage\.removeItem/);
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
        assert.match(agentsMd, /mise tasks/);
        assert.doesNotMatch(agentsMd, /\.pi\/prompts\/issue\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/spec\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/minimax-research\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/ci\.md/);
        assert.match(agentsMd, /\.pi\/prompts\/release\.md/);
        assert.match(agentsMd, /mise run release/);
        assert.doesNotMatch(agentsMd, /\.pi\/prompts\/commit\.md/);
        assert.doesNotMatch(agentsMd, /\/home\//);
        assert.doesNotMatch(
            agentsMd,
            /^## (Stack|Commands|Files|Architecture|MiniMax API|Session|SSE|Quotas|Testing|Logger|Don't)$/m
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
        assert.equal(serverTs.includes("`direct_$" + "{nextReqId()}`"), false);
        assert.match(serverTs, /randomUUID/);
    });

    it("drains leftover steering messages after agent turns", () => {
        assert.match(serverTs, /drainSteer/);
        assert.match(serverTs, /saveMessage\(database, sessionId, "user", msg\)/);
    });

    it("mise commands have no constitution wrapper ceremony", () => {
        assert.equal(/^rules:/m.test(commandConfig), false);
        assert.equal(/^mission:/m.test(commandConfig), false);
    });
});

describe("system metadata health", () => {
    function mdFiles(dir: string): string[] {
        return readdirSync(dir)
            .filter((name) => name.endsWith(".md"))
            .map((name) => `${dir}/${name}`);
    }

    function _uniqueIds(text: string, prefix: string): string[] {
        return [...new Set(text.match(new RegExp(`${prefix}-\\d{3}`, "g")) ?? [])];
    }

    it("keeps spec and issue cross references in sync", () => {
        const specs = new Map(
            mdFiles(".system/specs").map((path: string) => [
                path.match(/HG-SPEC-\d{3}/)?.[0] ?? "",
                { path, text: readFileSync(path, "utf-8") }
            ])
        );
        const issues = new Map(
            mdFiles(".system/issues").map((path: string) => [
                path.match(/HG-ISSUE-\d{3}/)?.[0] ?? "",
                { path, text: readFileSync(path, "utf-8") }
            ])
        );

        for (const [_issueId, issue] of issues) {
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

    it("requires human approval for spec writes instead of hard-blocking them", () => {
        assert.match(
            systemExtension,
            /const HARD_READONLY_FILES = \["MISSION\.md", "RULES\.md", "SYSTEM\.md"\]/
        );
        assert.match(systemExtension, /const APPROVAL_DIRS = \["specs"\]/);
        assert.match(systemExtension, /ctx\.ui\.select\(/);
        assert.match(systemExtension, /\["Yes", "No", "Custom"\]/);
        assert.match(systemExtension, /ctx\.abort\(\)/);
        assert.match(systemExtension, /sendUserMessage\(custom, \{ deliverAs: "steer" \}\)/);
        assert.match(systemExtension, /human approval required/);
        assert.doesNotMatch(systemExtension, /const READONLY_DIRS = \["specs"\]/);
        assert.doesNotMatch(systemExtension, /Only humans may edit MISSION, RULES, and specs/);
    });

    it("keeps issue status valid", () => {
        const validStatuses = ["open", "fixed"];
        for (const path of mdFiles(".system/issues")) {
            const text = readFileSync(path, "utf-8");
            const statusMatch = text.match(/"status":\s*"([^"]+)"/);
            assert.ok(statusMatch, `${path} missing status frontmatter`);
            assert.ok(
                validStatuses.includes(statusMatch[1]),
                `${path} invalid status: ${statusMatch[1]}`
            );
        }
    });
});

describe("formatter and linter health", () => {
    it("uses dprint, Biome, and sqruff instead of Prettier", () => {
        assert.equal(existsSync(`.${legacyFormatter}rc`), false);
        assert.equal(existsSync(`.${legacyFormatter}ignore`), false);
        assert.match(packageJson, /"dprint": "0\.54\.0"/);
        assert.match(packageJson, /"@biomejs\/biome": "2\.3\.15"/);
        assert.doesNotMatch(packageJson, new RegExp(legacyFormatter));
        assert.match(dprintJson, /typescript-0\.96\.1\.wasm/);
        assert.match(dprintJson, /pretty_yaml-v0\.6\.0\.wasm/);
        assert.match(dprintJson, /dockerfile-0\.3\.3\.wasm/);
        assert.match(dprintJson, /"\*\*\/\*\.html"/);
        assert.doesNotMatch(dprintJson, /"public\/index\.html"/);
        assert.doesNotMatch(dprintJson, /sql-0\.3\.0\.wasm/);
        assert.match(biomeJson, /"formatter": \{\n\s+"enabled": false/);
        assert.match(biomeJson, /"recommended": true/);
        assert.match(sqruffConfig, /dialect = sqlite/);
        assert.doesNotMatch(sqruffConfig, /exclude_rules/);
    });
});

describe("mise command health", () => {
    it("has a small public command surface", () => {
        assert.equal(existsSync("justfile"), false);
        assert.equal(existsSync("mise.toml"), true);
        assert.match(miseToml, /\[tools\]/);
        assert.match(miseToml, /bun = "1\.3\.14"/);
        assert.match(miseToml, /"pipx:sqruff" = "0\.39\.0"/);
        assert.match(miseToml, /jq = "1\.8\.2"/);
        assert.match(miseToml, /gitleaks = "8\.30\.1"/);
        assert.match(miseToml, /gh = "2\.96\.0"/);

        const taskNames = [...commandConfig.matchAll(/^\[tasks\.([^\]]+)\]/gm)].map((match) =>
            match[1]
        );
        assert.deepEqual(taskNames, [
            "setup",
            "check",
            "test",
            "dev",
            "fonts",
            "image",
            "release",
            "clean",
            "reset"
        ]);
    });

    it("keeps setup, check, and test idempotent/composable", () => {
        assert.match(commandConfig, /\[tasks\.setup\]/);
        assert.match(commandConfig, /flag "--js"/);
        assert.match(commandConfig, /flag "--browsers"/);
        assert.match(commandConfig, /bun install --frozen-lockfile/);
        assert.match(commandConfig, /playwright install --with-deps chromium firefox/);
        assert.match(commandConfig, /\[tasks\.check\]/);
        assert.match(commandConfig, /flag "--fix"/);
        assert.match(commandConfig, /mise fmt --check/);
        assert.match(commandConfig, /bunx dprint check/);
        assert.match(commandConfig, /bunx biome lint \./);
        assert.match(
            commandConfig,
            /sqruff lint migrations\/\*\.sql test\/fixtures\/db\/v1\.0\.0\/schema\.sql/
        );
        assert.match(commandConfig, /podman-user-generator/);
        assert.match(commandConfig, /systemd-analyze --user verify/);
        assert.match(commandConfig, /bunx tsc --noEmit/);
        assert.match(commandConfig, /bun test test\/unit/);
        assert.match(commandConfig, /bun test test\/integration/);
        assert.match(commandConfig, /\[tasks\.test\]/);
        assert.match(commandConfig, /flag "--matrix"/);
        assert.match(commandConfig, /flag "--mutation"/);
        assert.match(commandConfig, /flag "--minimax"/);
        assert.match(commandConfig, /HG_E2E_BROWSER="\$browser" HG_E2E_DEVICE="\$device"/);
        assert.match(commandConfig, /bunx stryker run test\/stryker\.config\.mjs/);
        assert.match(commandConfig, /bun scripts\/minimax-test\.ts/);
    });

    it("keeps dev, fonts, image, release, clean, and reset capabilities", () => {
        assert.match(commandConfig, /\[tasks\.dev\]/);
        assert.match(commandConfig, /flag "--fresh"/);
        assert.match(commandConfig, /flag "--kill"/);
        assert.match(commandConfig, /flag "--chrome"/);
        assert.match(commandConfig, /google-chrome-stable/);
        assert.match(commandConfig, /bun src\/server\.ts/);
        assert.match(commandConfig, /\[tasks\.fonts\]/);
        assert.match(commandConfig, /bun scripts\/update-fonts\.ts "\$usage_commit"/);
        assert.match(commandConfig, /\[tasks\.image\]/);
        assert.match(commandConfig, /flag "--smoke"/);
        assert.match(commandConfig, /flag "--push"/);
        assert.match(
            commandConfig,
            /podman build -f deploy\/Containerfile --build-arg VERSION="\$version" -t "\$image" \./
        );
        assert.match(commandConfig, /podman healthcheck run/);
        assert.match(commandConfig, /podman push "\$image"/);
        assert.match(commandConfig, /\[tasks\.release\]/);
        assert.match(commandConfig, /flag "--check"/);
        const releaseTask = commandConfig.match(/\[tasks\.release\][\s\S]*?\[tasks\.clean\]/)?.[0]
            ?? "";
        assert.match(releaseTask, /interactive = true/);
        assert.doesNotMatch(releaseTask, /confirm =/);
        assert.match(commandConfig, /Manual test OK\? \[y\/N\]/);
        assert.match(commandConfig, /git status --porcelain=v1 --untracked-files=all/);
        assert.match(commandConfig, /git tag "\$tag"/);
        assert.match(commandConfig, /git push origin "\$tag"/);
        assert.match(commandConfig, /\[tasks\.clean\][\s\S]*public\/app\.js/);
        assert.match(commandConfig, /\[tasks\.reset\][\s\S]*rm -rf data \*\.db/);
        assert.doesNotMatch(commandConfig, /MANUAL_CHROME_OK/);
        assert.doesNotMatch(commandConfig, /\bdocker (?:build|buildx|volume|run|inspect|rm)\b/);
        assert.match(
            commandConfig,
            /if \[ "\$\{usage_push:-false\}" = "true" \]; then podman push "\$image"; fi/
        );
    });

    it("runs every test from directories, not brittle file lists", () => {
        assert.match(commandConfig, /bun test test\/unit/);
        assert.match(commandConfig, /bun test test\/integration/);
        assert.match(commandConfig, /bun e2e\/run-e2e\.ts/);
        assert.match(commandConfig, /for browser in chromium firefox/);
        assert.match(commandConfig, /for device in desktop mobile/);
        assert.doesNotMatch(commandConfig, /BACKEND_TESTS|FRONTEND_TESTS/);
        assert.deepEqual(readdirSync("test").filter((name) => name.endsWith(".test.ts")), []);
        assert.equal(existsSync("test/unit/static.test.ts"), true);
        assert.equal(existsSync("test/integration/integration.test.ts"), true);
    });

    it("can update vendored fonts from pinned source commit", () => {
        const commit = loadFontManifest().source.commit;
        assert.match(commandConfig, new RegExp(commit));
        assert.match(
            commandConfig,
            /\[tasks\.fonts\][\s\S]*bun scripts\/update-fonts\.ts "\$usage_commit"/
        );
        assert.doesNotMatch(commandConfig, /fonts[\s\S]*commit="main"/);
        assert.equal(existsSync("scripts/update-fonts.ts"), true);
        assert.match(updateFontsScript, /function manifestTime/);
        assert.match(updateFontsScript, /sameCommit && sameFonts && previous\?\.generated_at/);
    });

    it("uses only the one e2e runner named by mise", () => {
        const checked = [commandConfig, e2eRunner].join("\n");
        assert.equal(existsSync("e2e/chat.spec.ts"), false);
        assert.equal(existsSync("e2e/static-server.ts"), false);
        assert.equal(existsSync("test/playwright.config.ts"), false);
        assert.equal(checked.includes("python3"), false);
        assert.equal(/\/data\/data\/com\.[a-z]+/.test(checked), false);
        assert.equal(/PLAYWRIGHT_ALLOW_[A-Z_]+/.test(checked), false);
        assert.equal(checked.includes("--test-name-pattern"), false);
        assert.match(e2eRunner, /HG_E2E_BROWSER/);
        assert.match(e2eRunner, /HG_E2E_DEVICE/);
        assert.match(e2eRunner, /firefox/);
    });

    it("does not define redundant tasks or aliases", () => {
        assert.equal(/^list:/m.test(commandConfig), false);
        assert.equal(/^alias\b/m.test(commandConfig), false);
        assert.doesNotMatch(commandConfig, /hook-pre-commit|hook-pre-push|hook-post-merge/);
        const taskNames = [...commandConfig.matchAll(/^\[tasks\.([^\]]+)\]/gm)].map((match) =>
            match[1]
        );
        assert.deepEqual(taskNames, [
            "setup",
            "check",
            "test",
            "dev",
            "fonts",
            "image",
            "release",
            "clean",
            "reset"
        ]);
    });
});
describe("lefthook health", () => {
    it("only wires Git hooks to mise commands", () => {
        assert.match(lefthookYml, /pre-commit:/);
        assert.match(lefthookYml, /gitleaks:/);
        assert.match(lefthookYml, /gitleaks protect --staged --redact --verbose/);
        assert.match(lefthookYml, /pre-push:/);
        assert.match(lefthookYml, /post-merge:/);
        assert.equal((lefthookYml.match(/mise run check && mise run test/g) ?? []).length, 3);
        assert.match(lefthookYml, /mise run setup/);
        assert.doesNotMatch(lefthookYml, /hook-pre-commit|hook-pre-push|hook-post-merge/);
        assert.doesNotMatch(commandConfig, /mise run ci-act/);
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

    it("keeps MiniMax research workflow out of command runner", () => {
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

    it("uses release prompt for tag and artifact workflow", () => {
        assert.equal(existsSync(".pi/prompts/release.md"), true);
        assert.match(releasePrompt, /RELEASE_TAG=\$ARGUMENTS mise run release --check/);
        assert.match(releasePrompt, /mise run release \$ARGUMENTS/);
        assert.match(releasePrompt, /Manual test OK\? \[y\/N\]/);
        assert.match(releasePrompt, /CHANGELOG\.md/);
        assert.match(releasePrompt, /\.system\/issues/);
        assert.match(releasePrompt, /opened the exact image in Chrome/);
        assert.match(releasePrompt, /dirty worktrees/);
        assert.match(releasePrompt, /OCI image label disagree/);
    });

    it("uses the supported visible Chrome recipe for manual tests", () => {
        assert.match(manualPrompt, /mise run dev --chrome/);
        assert.doesNotMatch(manualPrompt, /mise run chrome|mise run dev-chrome/);
    });
});

describe("project metadata health", () => {
    it("ships README release docs with badges and footer", () => {
        assert.match(readmeMd, /^# HallucyGenie\n/);
        assert.match(readmeMd, /actions\/workflows\/ci\.yml\/badge\.svg/);
        assert.match(readmeMd, /License-MIT/);
        assert.match(readmeMd, /Dark little genie/);
        assert.match(readmeMd, /chat, image, voice, and song/);
        assert.match(readmeMd, /ghcr\.io\/bugabinga\/hallucygenie:v1\.0\.2/);
        assert.match(readmeMd, /MINIMAX_API_KEY/);
        assert.match(readmeMd, /No built-in auth/);
        assert.match(readmeMd, /data\//);
        assert.match(readmeMd, /mise run release --check/);
        assert.match(readmeMd, /mise run release v1\.0\.2/);
        assert.match(readmeMd, /opens the release image in Chrome/);
        assert.match(readmeMd, /Made with love, hand-vibing AI, and bugabinga\./);
    });

    it("ships first-release changelog and env example", () => {
        assert.match(changelogMd, /^## 1\.0\.2 - 2026-06-12$/m);
        assert.match(changelogMd, /Kid notes/);
        assert.match(changelogMd, /Parent notes/);
        assert.match(changelogMd, /Database/);
        assert.match(changelogMd, /schema version 14/);
        assert.match(changelogMd, /ghcr\.io\/bugabinga\/hallucygenie:v1\.0\.2/);
        assert.match(envExample, /^MINIMAX_API_KEY=$/m);
        assert.match(envExample, /^PORT=3000$/m);
        assert.match(envExample, /^COVER_EXTRACTOR_URL=$/m);
    });

    it("uses MIT license metadata", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
            license: string;
            version: string;
        };
        assert.equal(pkg.version, "1.0.2");
        assert.equal(pkg.license, "MIT");
        assert.match(licenseMd, /^MIT License/);
        assert.match(licenseMd, /Copyright \(c\) 2026 bugabinga/);
        assert.match(licenseMd, /THE SOFTWARE IS PROVIDED "AS IS"/);
    });
});

describe("GitHub Actions health", () => {
    it("runs check, e2e matrix, and mutation through mise", () => {
        assert.doesNotMatch(ciYml, /MINIMAX_(?:API_)?KEY/);
        assert.doesNotMatch(dependabotYml, /MINIMAX_(?:API_)?KEY/);
        assert.match(ciYml, /uses: jdx\/mise-action@v3/);
        assert.match(ciYml, /run: mise run setup --js/);
        assert.match(ciYml, /run: mise run setup --browsers/);
        assert.match(ciYml, /run: mise run check/);
        assert.match(ciYml, /run: mise run test --e2e/);
        assert.match(ciYml, /run: mise run test --mutation/);
        assert.match(ciYml, /browser: \[chromium, firefox\]/);
        assert.match(ciYml, /device: \[desktop, mobile\]/);
        assert.match(ciYml, /HG_E2E_BROWSER: \$\{\{ matrix\.browser \}\}/);
        assert.match(ciYml, /HG_E2E_DEVICE: \$\{\{ matrix\.device \}\}/);
        assert.doesNotMatch(ciYml, /ci-test-all|test-e2e|test-mutation/);
        assert.doesNotMatch(
            ciYml,
            /oven-sh\/setup-bun|taiki-e\/install-action|Install sqruff|setup-chrome|CHROMIUM_PATH/
        );
    });

    it("agent PR workflows fix then test before commit", () => {
        assert.doesNotMatch(agentsYml, /browser-actions\/setup-chrome|Install sqruff|tool: just/);
        assert.match(agentsYml, /uses: jdx\/mise-action@v3/);
        assert.equal((agentsYml.match(/mise run check --fix\n\s+mise run test/g) ?? []).length, 8);
        assert.doesNotMatch(agentsYml, /mise run fmt \|\| true|mise run ready|mise run fix/);
        assert.match(slopChopperAgent, /Run "mise run check --fix" && "mise run test" after/);
    });

    it("caches deps and uploads mutation HTML artifacts", () => {
        assert.match(ciYml, /actions\/checkout@v6\.0\.3/);
        assert.match(ciYml, /jdx\/mise-action@v3/);
        assert.match(ciYml, /cache: true/);
        assert.match(ciYml, /path: ~\/\.cache\/ms-playwright/);
        assert.match(
            ciYml,
            /key: \$\{\{ runner\.os \}\}-playwright-\$\{\{ hashFiles\('bun\.lock'\) \}\}/
        );
        assert.match(ciYml, /path: ~\/\.bun\/install\/cache/);
        assert.match(ciYml, /key: \$\{\{ runner\.os \}\}-bun-\$\{\{ hashFiles\('bun\.lock'\) \}\}/);
        assert.match(ciYml, /actions\/upload-artifact@v7\.0\.1/);
        assert.match(ciYml, /if: \$\{\{ always\(\) \}\}/);
        assert.match(ciYml, /name: mutation-reports/);
        assert.match(ciYml, /path: reports\/mutation\//);
        assert.match(strykerAgent, /reporters: \["clear-text", "progress", "html"\]/);
        assert.match(strykerAgent, /fileName: "reports\/mutation\/agent\.html"/);
        assert.match(strykerTools, /fileName: "reports\/mutation\/tools\.html"/);
        assert.match(strykerDb, /fileName: "reports\/mutation\/db\.html"/);
    });

    it("builds and releases containers without local act clutter", () => {
        assert.match(ciYml, /image:/);
        assert.match(ciYml, /run: mise run image hallucygenie:ci/);
        assert.match(releaseYml, /tags:\n\s+- "v\*\.\*\.\*"/);
        assert.match(releaseYml, /ghcr\.io\/bugabinga\/hallucygenie/);
        assert.match(releaseYml, /permissions:\n\s+contents: read\n\s+packages: write/);
        assert.doesNotMatch(
            releaseYml,
            /browser-actions\/setup-chrome|CHROMIUM_PATH|Install sqruff|setup-bun|tool: just/
        );
        assert.match(
            releaseYml,
            /run: RELEASE_TAG="\$RELEASE_TAG" mise run release --check "\$IMAGE:\$RELEASE_TAG"/
        );
        assert.match(releaseYml, /mise run image --push/);
        assert.match(releaseYml, /podman login ghcr\.io/);
        assert.doesNotMatch(releaseYml, /docker\//);
        assert.doesNotMatch(ciYml, /env\.ACT/);
        assert.doesNotMatch(ciYml, /act \+ Podman/);
        assert.equal(existsSync(".github/workflows/updates.yml"), false);
        assert.match(dependabotYml, /package-ecosystem: bun/);
        assert.doesNotMatch(dependabotYml, /package-ecosystem: npm/);
        assert.match(dependabotYml, /package-ecosystem: github-actions/);
        assert.doesNotMatch(dependabotYml, /package-ecosystem: docker/);
        assert.match(dependabotYml, /interval: weekly/);
        assert.doesNotMatch(dependabotYml, /workflow_dispatch|bun outdated|deps-check/);
        assert.match(commandConfig, /\[tasks\.image\]/);
        assert.match(
            commandConfig,
            /podman build -f deploy\/Containerfile --build-arg VERSION="\$version" -t "\$image" \./
        );
        assert.match(commandConfig, /\[tasks\.release\]/);
        assert.doesNotMatch(commandConfig, /\ndeps-check:|bun outdated --latest/);
    });

    it("has no local act runner tasks", () => {
        assert.doesNotMatch(commandConfig, /\bACT_/);
        assert.doesNotMatch(commandConfig, /\bci-act(?:\b|-)/);
        assert.doesNotMatch(commandConfig, /\bagent-(?:spec|bugs|deslop|all)\b/);
        assert.doesNotMatch(commandConfig, /\bact\b/);
        assert.equal(existsSync("deploy/act/Containerfile"), false);
        assert.doesNotMatch(gitignore, /\.artifacts\//);
        assert.doesNotMatch(gitignore, /\.act-cache\//);
    });

    it("prepare installs hooks only inside a git repo", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
            packageManager: string;
            scripts: Record<string, string>;
        };
        assert.equal(pkg.packageManager, "bun@1.3.14");
        assert.deepEqual(Object.keys(pkg.scripts), ["prepare"]);
        assert.match(pkg.scripts.prepare, /git rev-parse --git-dir/);
        assert.match(pkg.scripts.prepare, /lefthook install/);
    });
});
describe("agent patrol health", () => {
    it("documents the patrol loop for humans", () => {
        assert.equal(existsSync("AGENT_PATROL.md"), true);
        const patrolDoc = readFileSync("AGENT_PATROL.md", "utf-8");
        assert.match(agentsMd, /AGENT_PATROL\.md/);
        for (
            const word of [
                "speck-ferkel",
                "trouble-maker",
                "slop-chopper",
                "robotnik",
                "janitor",
                "needs-fix"
            ]
        ) {
            assert.match(patrolDoc, new RegExp(word));
        }
        assert.ok(patrolDoc.split("\n").length <= 80);
    });

    it("uses only MiniMax LLM provider secrets", () => {
        for (const text of [agentsYml, janitorAgent, robotnikAgent]) {
            assert.doesNotMatch(text, /ZAI_API_KEY|--provider",\s*\n\s*"zai"|glm-5\.1/);
        }
        assert.match(agentsYml, /MINIMAX_API_KEY: \$\{\{ secrets\.MINIMAX_API_KEY \}\}/);
        assert.match(janitorAgent, /--provider",\s*\n\s*"minimax"/);
        assert.match(janitorAgent, /--model",\s*\n\s*"MiniMax-M3"/);
        assert.match(robotnikAgent, /--provider",\s*\n\s*"minimax"/);
        assert.match(robotnikAgent, /--model",\s*\n\s*"MiniMax-M3"/);
    });

    it("ships valid MiniMax model config for CI agents", () => {
        const config = JSON.parse(agentModelsJson) as {
            providers: {
                minimax: { api: string; models: Array<{ id: string; input: string[]; }>; };
            };
        };
        assert.equal(config.providers.minimax.api, "anthropic-messages");
        assert.deepEqual(
            config.providers.minimax.models.map((model) => model.id),
            ["MiniMax-M3", "MiniMax-M2.5-highspeed"]
        );
        assert.deepEqual(config.providers.minimax.models[0].input, ["text", "image"]);
        assert.deepEqual(config.providers.minimax.models[1].input, ["text"]);
        assert.doesNotMatch(agentModelsJson, /"video"|zai|glm-5\.1|ZAI_API_KEY/);
    });

    it("syncs triage labels and requests human review on needs-human", () => {
        for (
            const label of [
                "janitor:needs-fix",
                "janitor:ready",
                "janitor:needs-human",
                "janitor:waiting-for-ci"
            ]
        ) {
            assert.match(janitorAgent, new RegExp(JSON.stringify(label).slice(1, -1)));
        }
        assert.match(janitorAgent, /syncJanitorLabels\(pr\.number, status\)/);
        assert.match(janitorAgent, /requestHumanReview\(pr\.number, status\)/);
        assert.match(janitorAgent, /status !== "needs-human"/);
        assert.match(janitorAgent, /--add-reviewer/);
        assert.match(janitorAgent, /JANITOR_HUMAN_REVIEWER/);
    });

    it("keeps patrol cadence but gives agents long repair windows", () => {
        for (const cron of ["17 */6 * * *", "17 3,9,15,21 * * *", "47 */2 * * *"]) {
            assert.match(agentsYml, new RegExp(`cron: "${cron.replaceAll("*", "\\*")}"`));
        }
        assert.doesNotMatch(agentsYml, /timeout-minutes: 1[0-9]\b/);
        assert.match(agentsYml, /timeout-minutes: 75/);
        assert.match(janitorAgent, /AGENT_PASS_TIMEOUT_MS/);
        assert.match(agentLib, /20 \* 60 \* 1000/);
    });

    it("lets patrol agents cooperate on existing bot PR repairs", () => {
        assert.match(agentLib, /headRefName\.startsWith\("agent\/"\)/);
        assert.match(agentLib, /headRefName\.startsWith\(branchPrefix\)/);
        assert.match(agentLib, /status === "needs-fix"/);
        assert.doesNotMatch(
            agentLib,
            /pr\.headRefName\.startsWith\(branchPrefix\)\s*&&\s*BOT_AUTHORS/s
        );
    });

    it("treats model stalls as soft patrol outcomes", () => {
        assert.match(agentLib, /pi-agent-soft-failed/);
        assert.match(agentLib, /resetWorkingTree/);
        assert.match(agentLib, /code === "ETIMEDOUT"/);
        assert.match(agentLib, /SOFT_FAIL/);
        assert.match(agentLib, /process\.exit\(0\)/);
        assert.match(agentLib, /PASS 1 DID NOT WRITE FINDINGS/);
        assert.match(agentsYml, /pi-agent-soft-failed/);
    });
});

describe("layout health", () => {
    it("deploy image uses hardened optimized Bun multi-stage build", () => {
        assert.match(deployContainerfile, /^ARG BUN_VERSION=1\.3\.14$/m);
        assert.match(deployContainerfile, /^FROM oven\/bun:\$\{BUN_VERSION\} AS deps/m);
        assert.match(deployContainerfile, /^FROM deps AS build/m);
        assert.match(deployContainerfile, /^FROM oven\/bun:\$\{BUN_VERSION\} AS runtime/m);
        assert.match(deployContainerfile, /^ARG VERSION=1\.0\.0$/m);
        assert.match(
            deployContainerfile,
            /--mount=type=cache,target=\/root\/\.bun\/install\/cache,sharing=locked/
        );
        assert.match(deployContainerfile, /COPY package\.json bun\.lock \./);
        assert.match(deployContainerfile, /COPY public \.\/public/);
        assert.match(deployContainerfile, /COPY --chown=bun:bun src \.\/src/);
        assert.match(deployContainerfile, /COPY --chown=bun:bun migrations \.\/migrations/);
        assert.match(
            deployContainerfile,
            /COPY --from=build --chown=bun:bun \/app\/public\/app\.js \.\/public\/app\.js/
        );
        assert.match(deployContainerfile, /bunx esbuild public\/app\.ts/);
        assert.match(deployContainerfile, /--minify/);
        assert.match(deployContainerfile, /org\.opencontainers\.image\.version/);
        assert.match(deployContainerfile, /^USER bun$/m);
        assert.doesNotMatch(deployContainerfile, /^HEALTHCHECK /m);
        assert.match(commandConfig, /--health-cmd/);
        assert.match(commandConfig, /podman healthcheck run/);
        assert.match(readFileSync("deploy/hallucygenie.container", "utf-8"), /^HealthCmd=/m);
        assert.doesNotMatch(deployContainerfile, /COPY \. \./);
    });

    it("deploy build context uses a whitelist", () => {
        const lines = containerignore
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
        assert.equal(lines[0], "*");
        for (
            const path of [
                "package.json",
                "bun.lock",
                "src/",
                "src/**",
                "migrations/",
                "migrations/**",
                "public/",
                "public/app.ts",
                "public/index.html",
                "public/markdown.ts",
                "public/style.css",
                "public/fonts/",
                "public/fonts/**"
            ]
        ) {
            assert.ok(lines.includes(`!${path}`), `${path} must be allowed`);
        }
        assert.equal(lines.includes("!public/**"), false);
        assert.equal(
            lines.some((line) => line.includes("screenshot")),
            false
        );
        assert.equal(
            lines.some((line) => line.startsWith("!test")),
            false
        );
        assert.equal(
            lines.some((line) => line.startsWith("!.system")),
            false
        );
        assert.equal(
            lines.some((line) => line.startsWith("!node_modules")),
            false
        );
    });

    it("keeps source in src, tests in test, deploy in deploy", () => {
        for (const file of ["server.ts", "agent.ts", "tools.ts", "db.ts", "log.ts"]) {
            assert.equal(existsSync(file), false, `${file} should not be in repo root`);
            assert.equal(existsSync(`src/${file}`), true, `src/${file} should exist`);
        }
        for (const file of ["server.test.ts", "agent.test.ts", "tools.test.ts", "db.test.ts"]) {
            assert.equal(existsSync(file), false, `${file} should not be in repo root`);
            assert.equal(existsSync(`test/unit/${file}`), true, `test/unit/${file} should exist`);
        }
        assert.equal(existsSync("deploy/Containerfile"), true);
        assert.equal(existsSync("deploy/Dockerfile"), false);
        assert.equal(existsSync("deploy/hallucygenie.container"), true);
    });

    it("ignores and does not track generated frontend bundle", () => {
        assert.match(gitignore, /public\/app\.js/);
        assert.equal(trackedFiles.has("public/app.js"), false);
        assert.doesNotMatch(gitignore, /\.pulse\.json/);
        assert.match(gitignore, /test-data\*\//);
        assert.match(dprintJson, /test\/\*\*\/__snapshots__\/\*\*/);
        assert.doesNotMatch(dprintJson, /\.system\//);
    });
});

describe("removed profile UI cleanup", () => {
    it("has no stale personality selector references in source", () => {
        const sourceFiles = [indexHtml, styleCss, appTs, serverTs];
        for (const text of sourceFiles) {
            assert.equal(/personality/i.test(text), false);
        }
    });
});

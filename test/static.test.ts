// HallucyGenie — static project health tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Window } from "happy-dom";

const indexHtml = readFileSync("public/index.html", "utf-8");
const styleCss = readFileSync("public/style.css", "utf-8");
const appTs = readFileSync("public/app.ts", "utf-8");
const justfile = readFileSync("justfile", "utf-8");
const serverTs = readFileSync("src/server.ts", "utf-8");
const gitignore = readFileSync(".gitignore", "utf-8");
const dockerignore = readFileSync(".dockerignore", "utf-8");
const lefthookYml = readFileSync("lefthook.yml", "utf-8");
const ciYml = readFileSync(".github/workflows/ci.yml", "utf-8");
const updatesYml = readFileSync(".github/workflows/updates.yml", "utf-8");
const strykerAgent = readFileSync("test/stryker.config.mjs", "utf-8");
const strykerTools = readFileSync("test/stryker-tools.mjs", "utf-8");
const strykerDb = readFileSync("test/stryker-db.mjs", "utf-8");
const deployDockerfile = readFileSync("deploy/Dockerfile", "utf-8");
const actDockerfile = readFileSync("deploy/act/Dockerfile", "utf-8");
const agentsMd = readFileSync("AGENTS.md", "utf-8");
const constitutionMd = readFileSync(".system/CONSTITUTION.md", "utf-8");
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

    it("create modal has dialog ARIA", () => {
        const doc = parseIndex();
        const modal = doc.querySelector("#create-modal") as HTMLElement | null;
        assert.equal(modal?.getAttribute("role"), "dialog");
        assert.equal(modal?.getAttribute("aria-modal"), "true");
        assert.equal(modal?.getAttribute("aria-labelledby"), "create-title");
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
        assert.equal(badge?.getAttribute("title"), "Images, voice, and music remaining today");
        assert.equal(badge?.getAttribute("aria-label"), "Images, voice, and music remaining today");
        assert.ok(doc.querySelector('.quota-item[data-type="speech"]'));
        assert.equal(styleCss.includes(".quota-badge:hover"), false);
        assert.match(styleCss, /\.quota-badge \{[^}]*cursor: default;/);
    });

    it("steering hint is outside input layout flow", () => {
        assert.match(styleCss, /\.steer-hint \{[^}]*position: absolute;/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*margin-top:/);
        assert.doesNotMatch(styleCss, /\.steer-hint \{[^}]*animation:/);
    });

    it("assistant streaming animation is low-risk and reduced-motion safe", () => {
        assert.match(styleCss, /\.assistant-text-region\.is-streaming/);
        assert.match(styleCss, /\.stream-chunk/);
        assert.match(styleCss, /@keyframes stream-chunk-in/);
        assert.match(styleCss, /@keyframes caret-blink/);
        assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*animation: stream-chunk-in/);
        assert.match(styleCss, /\.stream-chunk \{[^}]*display: inline-block;/);
        assert.doesNotMatch(styleCss, /\.stream-char/);
    });

    it("create modal has stable shell and scroll region", () => {
        assert.match(styleCss, /\.create-modal-content \{[^}]*display: flex;/);
        assert.match(styleCss, /\.create-modal-content \{[^}]*height: min\(86dvh, 720px\);/);
        assert.match(styleCss, /\.create-panels \{[^}]*flex: 1;/);
        assert.match(styleCss, /\.create-panels \{[^}]*min-height: 0;/);
        assert.match(styleCss, /\.create-panels \{[^}]*overflow-y: auto;/);
        assert.match(styleCss, /\.modal-content \{[^}]*background: rgba\(20, 20, 26, 0\.95\);/);
        assert.match(styleCss, /backdrop-filter: blur\(10px\)/);
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

describe("constitution health", () => {
    it("AGENTS.md points to the constitution and Tiger style", () => {
        assert.match(agentsMd, /\.system\/CONSTITUTION\.md/);
        assert.match(agentsMd, /Tiger skill/);
        assert.match(agentsMd, /No "backwards compat"/);
        assert.match(agentsMd, /fail fast and hard/i);
    });

    it("music creator specs split lyrics/song generation from cover research", () => {
        assert.match(musicCreatorSpec, /lyrics_generation: 100/);
        assert.match(musicCreatorSpec, /separate LLM tools, integrated Create UI/);
        assert.match(musicCreatorSpec, /is_instrumental: true/);
        assert.match(musicCreatorSpec, /music-cover: 100.*HG-SPEC-013/s);
        assert.match(musicCoverSpec, /music-cover: 100/);
        assert.match(musicCoverSpec, /paste YouTube URL/);
        assert.match(musicCoverSpec, /yt-dlp/);
        assert.match(musicCoverSpec, /rights_attestation/);
    });

    it("constitution is a strong prompt with raw asset invariant", () => {
        assert.match(constitutionMd, /strong prompt/i);
        assert.match(constitutionMd, /No "backwards compat"/);
        assert.match(constitutionMd, /Fail fast and loud/);
        assert.match(constitutionMd, /Avoid deep OOP hierarchies/);
        assert.match(constitutionMd, /Tiger style/);
        assert.match(constitutionMd, /Never put raw asset data in agent context or chat history/);
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
        assert.equal(/^constitution:/m.test(justfile), false);
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
    });

    it("can update vendored fonts", () => {
        assert.match(
            justfile,
            /\nfonts-update commit="main":\n\s+bun scripts\/update-fonts\.ts \{\{ commit \}\}/,
        );
        assert.equal(existsSync("scripts/update-fonts.ts"), true);
    });

    it("does not use python, termux paths, or test-name-pattern hacks", () => {
        assert.equal(justfile.includes("python3"), false);
        assert.equal(justfile.includes("/data/data/com.termux"), false);
        assert.equal(justfile.includes("--test-name-pattern"), false);
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
        assert.match(
            justfile,
            /fmt-check:\n\s+just -f \.\/justfile --fmt --check\n\s+bunx prettier --check \./,
        );
    });
});

describe("lefthook health", () => {
    it("runs pre-commit checks, pre-push unit tests, and post-merge main CI", () => {
        assert.match(lefthookYml, /pre-commit:/);
        assert.match(lefthookYml, /run: just hook-pre-commit/);
        assert.match(lefthookYml, /pre-push:/);
        assert.match(lefthookYml, /run: just hook-pre-push/);
        assert.match(lefthookYml, /post-merge:/);
        assert.match(lefthookYml, /run: just hook-post-merge/);
        assert.match(justfile, /hook-post-merge:/);
        assert.match(justfile, /git branch --show-current/);
        assert.match(justfile, /just ci-act/);
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
        assert.match(justfile, /ci-test-all: ci-check build/);
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
        assert.match(ciYml, /name: mutation-reports/);
        assert.match(ciYml, /path: reports\/mutation\//);
        assert.match(strykerAgent, /reporters: \["clear-text", "progress", "html"\]/);
        assert.match(strykerAgent, /fileName: "reports\/mutation\/agent\.html"/);
        assert.match(strykerTools, /fileName: "reports\/mutation\/tools\.html"/);
        assert.match(strykerDb, /fileName: "reports\/mutation\/db\.html"/);
    });

    it("builds container and checks dependency updates", () => {
        assert.match(ciYml, /container:/);
        assert.match(ciYml, /if: \$\{\{ !env\.ACT \}\}/);
        assert.match(ciYml, /docker build -f deploy\/Dockerfile -t hallucygenie:ci \./);
        assert.match(ciYml, /act \+ Podman cannot run nested BuildKit here/);
        assert.match(updatesYml, /schedule:/);
        assert.match(updatesYml, /workflow_dispatch:/);
        assert.match(updatesYml, /run: just update-check/);
        assert.match(justfile, /container-build:/);
        assert.match(justfile, /docker build -f deploy\/Dockerfile -t hallucygenie:local \./);
        assert.match(justfile, /update-check:/);
        assert.match(justfile, /bun outdated --latest/);
    });

    it("has fast local act recipes", () => {
        assert.match(justfile, /--pull=false/);
        assert.match(justfile, /--action-offline-mode/);
        assert.match(justfile, /--artifact-server-path \.artifacts/);
        assert.match(justfile, /--cache-server-path \.act-cache/);
        assert.match(justfile, /ACT_IMAGE := "localhost\/hallucygenie-act:local"/);
        assert.match(justfile, /ci-act-image:/);
        assert.match(justfile, /ci-act: ci-act-image/);
        assert.match(justfile, /ci-act-test: ci-act-image/);
        assert.match(justfile, /ci-act-mutation: ci-act-image/);
        assert.match(justfile, /ci-act-container: ci-act-image container-build/);
        assert.match(justfile, /ci-act-updates: ci-act-image/);
        assert.match(actDockerfile, /FROM docker\.io\/catthehacker\/ubuntu:act-latest/);
        assert.match(actDockerfile, /git-core-ubuntu-ppa-noble\.sources/);
        assert.match(gitignore, /\.artifacts\//);
        assert.match(gitignore, /\.act-cache\//);
    });

    it("prepare installs hooks only inside a git repo", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
            scripts: Record<string, string>;
        };
        assert.equal(
            JSON.parse(readFileSync("package.json", "utf-8")).packageManager,
            "bun@1.3.13",
        );
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
            ".artifacts",
            ".act-cache",
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

    it("ignores generated frontend bundle and local tool artifacts", () => {
        assert.match(gitignore, /public\/app\.js/);
        assert.match(gitignore, /\.pulse\.json/);
        assert.match(gitignore, /test-data\*\//);
    });
});

describe("bundle staleness guard", () => {
    it("generated bundle, when present, does not contain removed personality selector", () => {
        if (!existsSync("public/app.js")) return;
        const bundle = readFileSync("public/app.js", "utf-8");
        assert.equal(bundle.includes("personality-select"), false);
    });
});

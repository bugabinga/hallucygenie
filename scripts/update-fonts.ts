#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GOOGLE_FONTS_REPO = "https://github.com/google/fonts";
const GITHUB_API = "https://api.github.com/repos/google/fonts";

const FONT_SPECS = [
    {
        id: "playwrite-de-sas",
        family: "Playwrite DE SAS",
        cssFamily: "HG Playwrite DE SAS",
        role: "user",
        upstreamDir: "ofl/playwritedesas",
        outputDir: "public/fonts/playwrite-de-sas",
        outputFile: "PlaywriteDESAS.woff2",
        axes: { wght: [100, 400] }
    },
    {
        id: "roboto-flex",
        family: "Roboto Flex",
        cssFamily: "HG Roboto Flex",
        role: "assistant",
        upstreamDir: "ofl/robotoflex",
        outputDir: "public/fonts/roboto-flex",
        outputFile: "RobotoFlex.woff2",
        axes: {
            GRAD: [-200, 150],
            XOPQ: [27, 175],
            XTRA: [323, 603],
            YOPQ: [25, 135],
            YTAS: [649, 854],
            YTDE: [-305, -98],
            YTFI: [560, 788],
            YTLC: [416, 570],
            YTUC: [528, 760],
            opsz: [8, 144],
            slnt: [-10, 0],
            wdth: [25, 151],
            wght: [100, 1000]
        }
    },
    {
        id: "pixelify-sans",
        family: "Pixelify Sans",
        cssFamily: "HG Pixelify Sans",
        role: "ui",
        upstreamDir: "ofl/pixelifysans",
        outputDir: "public/fonts/pixelify-sans",
        outputFile: "PixelifySans.woff2",
        axes: { wght: [400, 700] }
    }
] as const;

type FontSpec = (typeof FONT_SPECS)[number];

type GithubContent = {
    name: string;
    path: string;
    download_url: string | null;
    type: string;
};

type PreviousManifest = {
    generated_at?: string;
    source?: { commit?: string; };
    fonts?: Array<{ id?: string; sha256?: string; }>;
};

function say(message: string): void {
    process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "hallucygenie-font-updater/1.0"
        }
    });
    if (!response.ok) fail(`GET ${url} -> ${response.status}`);
    return (await response.json()) as T;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
    const response = await fetch(url, {
        headers: { "User-Agent": "hallucygenie-font-updater/1.0" }
    });
    if (!response.ok) fail(`GET ${url} -> ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
}

async function resolveCommit(ref: string): Promise<string> {
    const data = await fetchJson<{ sha: string; }>(
        `${GITHUB_API}/commits/${encodeURIComponent(ref)}`
    );
    if (!/^[0-9a-f]{40}$/i.test(data.sha)) fail(`invalid commit sha for ${ref}: ${data.sha}`);
    return data.sha;
}

async function listUpstreamDir(dir: string, commit: string): Promise<GithubContent[]> {
    const url = `${GITHUB_API}/contents/${dir}?ref=${commit}`;
    const data = await fetchJson<GithubContent[] | GithubContent>(url);
    if (!Array.isArray(data)) fail(`expected directory listing for ${dir}`);
    return data;
}

function findFile(
    files: GithubContent[],
    predicate: (file: GithubContent) => boolean,
    label: string
): GithubContent & { download_url: string; } {
    const file = files.find((item) => item.type === "file" && predicate(item));
    if (!file?.download_url) fail(`missing ${label}`);
    return { ...file, download_url: file.download_url };
}

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function readPreviousManifest(): PreviousManifest | undefined {
    if (!existsSync("public/fonts/fonts.manifest.json")) return undefined;
    return JSON.parse(
        readFileSync("public/fonts/fonts.manifest.json", "utf-8")
    ) as PreviousManifest;
}

function previousSha(id: string): string | undefined {
    return readPreviousManifest()?.fonts?.find((font) => font.id === id)?.sha256;
}

function manifestTime(commit: string, fonts: Array<{ id: string; sha256: string; }>): string {
    const previous = readPreviousManifest();
    const sameCommit = previous?.source?.commit === commit;
    const sameFonts = fonts.every(
        (font) => previous?.fonts?.find((old) => old.id === font.id)?.sha256 === font.sha256
    );
    if (sameCommit && sameFonts && previous?.generated_at) return previous.generated_at;
    return new Date().toISOString();
}

function convertToWoff2(inputPath: string, outputPath: string): void {
    try {
        execFileSync("fonttools", ["ttLib.woff2", "compress", "-q", "-o", outputPath, inputPath], {
            stdio: "pipe"
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        fail(`fonttools woff2 conversion failed: ${message}`);
    }
}

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateStyleCssCacheBusters(fonts: Array<{ file: string; sha256: string; }>): void {
    const stylePath = "public/style.css";
    let css = readFileSync(stylePath, "utf-8");

    for (const font of fonts) {
        const urlPath = font.file.replace(/^public/, "");
        const cacheBustUrl = `${urlPath}?v=${font.sha256.slice(0, 12)}`;
        const pattern = new RegExp(`${escapeRegex(urlPath)}(?:\\?v=[0-9a-f]{12})?`, "g");
        css = css.replace(pattern, cacheBustUrl);
    }

    writeFileSync(stylePath, css);
    say("updated public/style.css font cache-busters");
}

async function downloadFont(spec: FontSpec, commit: string, tmpRoot: string) {
    const files = await listUpstreamDir(spec.upstreamDir, commit);
    const sourceFont = findFile(
        files,
        (file) => /\.(ttf|otf)$/i.test(file.name),
        `${spec.family} font`
    );
    const license = findFile(files, (file) => file.name === "OFL.txt", `${spec.family} OFL.txt`);

    mkdirSync(spec.outputDir, { recursive: true });
    const tmpFontPath = join(
        tmpRoot,
        `${spec.id}-${sourceFont.name.replace(/[^a-z0-9._-]/gi, "_")}`
    );
    const outputPath = join(spec.outputDir, spec.outputFile);
    const licensePath = join(spec.outputDir, "OFL.txt");

    const sourceBytes = await fetchBytes(sourceFont.download_url);
    writeFileSync(tmpFontPath, sourceBytes);
    convertToWoff2(tmpFontPath, outputPath);

    const licenseBytes = await fetchBytes(license.download_url);
    writeFileSync(licensePath, licenseBytes);

    const outputBytes = readFileSync(outputPath);
    const digest = sha256(outputBytes);
    const oldDigest = previousSha(spec.id) ?? "none";
    say(`${spec.id}: ${oldDigest} -> ${digest}`);

    return {
        id: spec.id,
        family: spec.family,
        css_family: spec.cssFamily,
        role: spec.role,
        source_path: sourceFont.path,
        file: outputPath,
        format: "woff2",
        axes: spec.axes,
        sha256: digest,
        license: licensePath
    };
}

async function main(): Promise<void> {
    const ref = process.argv[2] ?? "main";
    const commit = await resolveCommit(ref);
    const tmpRoot = join(tmpdir(), `hg-fonts-${process.pid}`);
    mkdirSync(tmpRoot, { recursive: true });

    try {
        mkdirSync("public/fonts", { recursive: true });
        say(`source: ${GOOGLE_FONTS_REPO}`);
        say(`ref: ${ref}`);
        say(`commit: ${commit}`);

        const fonts = [];
        for (const spec of FONT_SPECS) {
            fonts.push(await downloadFont(spec, commit, tmpRoot));
        }

        const manifest = {
            version: 1,
            generated_at: manifestTime(commit, fonts),
            source: {
                repo: GOOGLE_FONTS_REPO,
                commit,
                downloaded_by: "just fonts-update"
            },
            fonts
        };

        writeFileSync(
            "public/fonts/fonts.manifest.json",
            `${JSON.stringify(manifest, null, 2)}\n`
        );
        updateStyleCssCacheBusters(fonts);
        say("wrote public/fonts/fonts.manifest.json");
    } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
});

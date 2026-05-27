import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
    version: string;
    packageManager: string;
};
const version = pkg.version;
const tag = `v${version}`;
const requiredFiles = [
    "CHANGELOG.md",
    ".env.example",
    ".pi/prompts/release.md",
    ".github/workflows/release.yml",
    "test/fixtures/db/v1.0.0/schema.sql",
];

function fail(message: string): never {
    throw new Error(`release-check: ${message}`);
}

function read(path: string): string {
    if (!existsSync(path)) fail(`${path} missing`);
    return readFileSync(path, "utf-8");
}

function requireMatch(path: string, pattern: RegExp, message: string): void {
    if (!pattern.test(read(path))) fail(`${path}: ${message}`);
}

function exactGitTag(): string | null {
    try {
        return execFileSync("git", ["describe", "--tags", "--exact-match"], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package version must be SemVer, got ${version}`);
if (pkg.packageManager !== "bun@1.3.14") fail(`packageManager must be bun@1.3.14`);

for (const file of requiredFiles) read(file);

const releaseTag = process.env.RELEASE_TAG;
if (!releaseTag) fail("RELEASE_TAG is required");
if (!/^v\d+\.\d+\.\d+$/.test(releaseTag)) fail(`RELEASE_TAG must be vX.Y.Z, got ${releaseTag}`);
if (releaseTag !== tag) fail(`RELEASE_TAG ${releaseTag} != ${tag}`);
const currentTag = exactGitTag();
if (currentTag && currentTag !== tag) fail(`git tag ${currentTag} != ${tag}`);

requireMatch(
    "CHANGELOG.md",
    new RegExp(`^## ${version} - \\d{4}-\\d{2}-\\d{2}$`, "m"),
    "missing current version heading",
);
requireMatch("CHANGELOG.md", /Kid notes/i, "missing kid notes");
requireMatch("CHANGELOG.md", /Parent notes/i, "missing parent notes");
requireMatch("CHANGELOG.md", /Database/i, "missing DB notes");
requireMatch(
    "README.md",
    new RegExp(`ghcr\\.io/bugabinga/hallucygenie:${tag}`),
    "missing GHCR run tag",
);
requireMatch("README.md", /MINIMAX_API_KEY/, "missing API key docs");
requireMatch("README.md", /No built-in auth/i, "missing no-auth warning");
requireMatch("README.md", /data\//, "missing data volume docs");
requireMatch(".env.example", /^MINIMAX_API_KEY=$/m, "missing MINIMAX_API_KEY");
requireMatch(".env.example", /^PORT=3000$/m, "missing PORT");
requireMatch(".env.example", /^COVER_EXTRACTOR_URL=$/m, "missing COVER_EXTRACTOR_URL");
requireMatch(
    ".pi/prompts/release.md",
    /RELEASE_TAG=\$ARGUMENTS just release-check/,
    "missing tagged release gate instruction",
);
requireMatch(
    ".pi/prompts/release.md",
    /just release \$ARGUMENTS/,
    "missing release recipe instruction",
);
requireMatch(
    ".pi/prompts/release.md",
    /Manual test OK\? \[y\/N\]/,
    "missing interactive manual approval instruction",
);
requireMatch(".pi/prompts/release.md", /dirty worktrees/, "missing clean worktree instruction");
requireMatch(
    ".pi/prompts/release.md",
    /image tag, `RELEASE_TAG`, `package\.json`, or OCI image label disagree/,
    "missing tag-label coherence rule",
);
requireMatch(".pi/prompts/release.md", /CHANGELOG\.md/, "missing changelog instruction");
requireMatch(".pi/prompts/release.md", /\.system\/issues/, "missing issue update instruction");
requireMatch(
    "AGENTS.md",
    /Release -> `.pi\/prompts\/release\.md`/,
    "missing release prompt pointer",
);
requireMatch("deploy/Dockerfile", /^USER bun$/m, "runtime must use non-root bun user");
requireMatch("deploy/Dockerfile", /^HEALTHCHECK /m, "missing healthcheck");
requireMatch(
    "deploy/Dockerfile",
    /org\.opencontainers\.image\.version/,
    "missing OCI version label",
);
requireMatch(
    ".github/workflows/release.yml",
    /ghcr\.io\/bugabinga\/hallucygenie/,
    "missing GHCR image",
);
requireMatch(
    ".github/workflows/release.yml",
    /docker\/build-push-action@v7\.0\.0/,
    "missing build-push action",
);
requireMatch(".github/workflows/release.yml", /just release-check/, "missing local artifact proof");

console.log(`release-check metadata ok: ${tag}`);

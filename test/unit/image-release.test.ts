import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

const config = readFileSync("mise.toml", "utf-8");
const task = config.split("[tasks.image]\n")[1]?.match(/\nrun = '''\n([\s\S]*?)\n'''/);
assert.ok(task, "image task must provide an executable script");
const script = task[1];
const version = JSON.parse(readFileSync("package.json", "utf-8")).version as string;
const image = `ghcr.io/bugabinga/hallucygenie:v${version}`;
const latest = "ghcr.io/bugabinga/hallucygenie:latest";

for (
    const { failure, publish } of [
        { failure: "none", publish: true },
        { failure: "build", publish: true },
        { failure: "version", publish: true },
        { failure: "latest", publish: true },
        { failure: "none", publish: false }
    ]
) {
    it(`image publication: failure=${failure}, publish=${publish}`, () => {
        const tmp = mkdtempSync(join(tmpdir(), "genie-image-release-"));
        try {
            const log = join(tmp, "podman.log");
            writeFileSync(
                join(tmp, "podman"),
                `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$PODMAN_LOG"
if [ "$1:$FAIL_PUSH" = build:build ]; then exit 42; fi
if [ "$1" = push ]; then
    case "$2:$FAIL_PUSH" in
        *:latest:latest) exit 42 ;;
        *:v*:version) exit 42 ;;
    esac
fi
`,
                { mode: 0o755 }
            );
            const result = spawnSync("sh", ["-c", script], {
                encoding: "utf-8",
                env: {
                    ...process.env,
                    PATH: `${tmp}:${process.env.PATH}`,
                    PODMAN_LOG: log,
                    FAIL_PUSH: failure,
                    RELEASE_TAG: `v${version}`,
                    usage_image: image,
                    usage_push: String(publish),
                    usage_smoke: "false"
                }
            });
            assert.equal(result.status, failure === "none" ? 0 : 42, result.stderr);
            const operations = readFileSync(log, "utf-8").trim().split("\n");
            const expected = [
                `build -f deploy/Containerfile --build-arg VERSION=v${version} -t ${image} .`
            ];
            if (publish && failure !== "build") {
                expected.push(`push ${image}`);
                if (failure !== "version") {
                    expected.push(`tag ${image} ${latest}`, `push ${latest}`);
                }
            }
            assert.deepEqual(operations, expected);
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
}

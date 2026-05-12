// HallucyGenie — MiniMax smoke script tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    statusLine,
    hexSummary,
    imageUrlSummary,
    dataUrlSummary,
    textSummary,
    musicInstrumentalPayload,
    vlmPayload,
} from "../scripts/minimax-test.ts";

describe("minimax-test script formatting", () => {
    it("prints explicit MiniMax status label", () => {
        assert.equal(
            statusLine({ base_resp: { status_code: 0, status_msg: "success" } }),
            "MiniMax status: 0 (success)",
        );
    });

    it("summarizes hex without printing raw media", () => {
        assert.equal(hexSummary("abcdef"), "present (6 hex chars)");
        assert.equal(hexSummary(""), "missing");
        assert.equal(hexSummary(undefined), "missing");
    });

    it("summarizes image URLs without signed URL", () => {
        assert.equal(
            imageUrlSummary(["https://example.com/path/file.png?Signature=secret"]),
            "present (1, host example.com)",
        );
    });

    it("summarizes VLM image data URLs without printing raw media", () => {
        assert.equal(
            dataUrlSummary("data:image/jpeg;base64,abcdEF12=="),
            "present (image/jpeg, 10 base64 chars)",
        );
        assert.equal(dataUrlSummary("https://example.com/image.jpg"), "missing");
    });

    it("summarizes VLM text without printing content", () => {
        assert.equal(textSummary("a small red cube"), "present (16 chars)");
        assert.equal(textSummary(""), "missing");
    });

    it("uses current instrumental music payload shape", () => {
        const payload = musicInstrumentalPayload();
        assert.equal(payload.is_instrumental, true);
        assert.equal("instrumental" in payload, false);
        assert.equal("lyrics" in payload, false);
    });

    it("uses VLM data-url payload shape", () => {
        const payload = vlmPayload("data:image/png;base64,abc=");
        assert.equal(payload.prompt, "Describe this image in one short sentence.");
        assert.equal(payload.image_url, "data:image/png;base64,abc=");
    });
});

// HallucyGenie — MiniMax smoke script tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    statusLine,
    hexSummary,
    imageUrlSummary,
    musicInstrumentalPayload,
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

    it("uses current instrumental music payload shape", () => {
        const payload = musicInstrumentalPayload();
        assert.equal(payload.is_instrumental, true);
        assert.equal("instrumental" in payload, false);
        assert.equal("lyrics" in payload, false);
    });
});

// MiniMax API mocks for E2E tests
// Uses nock to intercept outbound HTTP requests at the Node.js level
// so the real server code runs but never hits the real MiniMax API.

import nock from "nock";

const MINIMAX_BASE = "https://api.minimax.io";

/**
 * Build an Anthropic-format SSE response body for a simple text reply.
 * The agent loop in agent.ts expects this specific SSE event structure.
 */
function anthropicTextSSE(text: string): string {
    const events = [
        {
            event: "message_start",
            data: {
                type: "message_start",
                message: {
                    id: "msg_e2e",
                    type: "message",
                    role: "assistant",
                    content: [],
                    model: "MiniMax-M2.7-highspeed",
                },
            },
        },
        {
            event: "content_block_start",
            data: {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
            },
        },
        {
            event: "content_block_delta",
            data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
        },
        { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
        {
            event: "message_delta",
            data: {
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: text.length },
            },
        },
        { event: "message_stop", data: { type: "message_stop" } },
    ];
    return (
        events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`).join("\n") + "\n"
    );
}

/**
 * Set up persistent nock interceptors for all MiniMax endpoints.
 * Persistent means they can be matched multiple times across all tests.
 */
export function setupMinimaxMocks(): void {
    // Chat completion — Anthropic-compatible streaming endpoint
    nock(MINIMAX_BASE)
        .persist()
        .post("/anthropic/v1/messages")
        .reply(
            200,
            () =>
                anthropicTextSSE("Hello! I'm HallucyGenie, your gaming buddy! 🎮 How can I help?"),
            {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
            },
        );

    // Image generation
    nock(MINIMAX_BASE)
        .persist()
        .post("/v1/image_generation")
        .reply(200, {
            data: {
                image_url: "https://example.com/generated/test.png",
                prompt: "test image",
            },
        });

    // TTS
    nock(MINIMAX_BASE)
        .persist()
        .post("/v1/t2a_v2")
        .reply(200, {
            data: {
                audio_file: "",
                audio_url: "https://example.com/test.mp3",
                hex: Buffer.from("fake-mp3-data").toString("hex"),
            },
        });

    // Music generation
    nock(MINIMAX_BASE)
        .persist()
        .post("/v1/music_generation")
        .reply(200, {
            data: [
                {
                    audio_url: "https://example.com/test.music.mp3",
                    extra: { audio_file: Buffer.from("fake-music-data").toString("hex") },
                },
            ],
        });

    // Web search
    nock(MINIMAX_BASE)
        .persist()
        .post("/v1/coding_plan/search")
        .reply(200, {
            data: {
                results: [
                    {
                        title: "Test Result",
                        url: "https://example.com",
                        snippet: "This is a test search result.",
                    },
                ],
            },
        });

    // Vision (VLM)
    nock(MINIMAX_BASE)
        .persist()
        .post("/v1/coding_plan/vlm")
        .reply(200, {
            choices: [
                {
                    message: { content: "I can see a test image." },
                },
            ],
        });

    // Quota / token plan
    nock(MINIMAX_BASE)
        .persist()
        .get("/v1/token_plan/remains")
        .reply(200, {
            model_remains: [
                {
                    model_name: "MiniMax-M2.7-highspeed",
                    current_interval_total_count: 1000,
                    current_interval_usage_count: 5,
                    remains_time: 86400000,
                },
                {
                    model_name: "speech-hd",
                    current_interval_total_count: 9000,
                    current_interval_usage_count: 10,
                    remains_time: 86400000,
                },
                {
                    model_name: "image-01",
                    current_interval_total_count: 100,
                    current_interval_usage_count: 2,
                    remains_time: 86400000,
                },
                {
                    model_name: "music-2.6",
                    current_interval_total_count: 100,
                    current_interval_usage_count: 1,
                    remains_time: 86400000,
                },
            ],
        });
}

/**
 * Clean up all nock interceptors.
 */
export function cleanupMinimaxMocks(): void {
    nock.cleanAll();
}

// MiniMax API mocks for E2E tests.
// Bun's native fetch is not reliably intercepted by nock, so patch fetch directly.

const MINIMAX_BASE = "https://api.minimax.io";
let previousFetch: typeof fetch | null = null;

export interface MinimaxMockCall {
    url: string;
    method: string;
    body: string;
}

const minimaxMockCalls: MinimaxMockCall[] = [];

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

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function minimaxResponse(url: URL): Response | null {
    switch (url.pathname) {
        case "/anthropic/v1/messages":
            return new Response(
                anthropicTextSSE("Hello! I'm HallucyGenie, your gaming buddy! 🎮 How can I help?"),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                    },
                },
            );

        case "/v1/image_generation":
            return jsonResponse({
                data: {
                    image_urls: ["https://example.com/generated/test.png"],
                },
                base_resp: { status_code: 0 },
            });

        case "/v1/t2a_v2":
            return jsonResponse({
                data: {
                    audio: Buffer.from("fake-mp3-data").toString("hex"),
                },
                base_resp: { status_code: 0 },
            });

        case "/v1/lyrics_generation":
            return jsonResponse({
                lyrics: "Verse one, game on\nChorus, win the fight",
                base_resp: { status_code: 0 },
            });

        case "/v1/music_generation":
            return jsonResponse({
                data: {
                    audio: Buffer.from("fake-music-data").toString("hex"),
                },
                base_resp: { status_code: 0 },
            });

        case "/v1/coding_plan/search":
            return jsonResponse({
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

        case "/v1/coding_plan/vlm":
            return jsonResponse({
                choices: [
                    {
                        message: { content: "I can see a test image." },
                    },
                ],
            });

        case "/v1/token_plan/remains":
            return jsonResponse({
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

        default:
            return null;
    }
}

/** Set up persistent fetch interceptors for all MiniMax endpoints. */
export function setupMinimaxMocks(): void {
    if (previousFetch) return;
    previousFetch = globalThis.fetch;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href.startsWith(MINIMAX_BASE)) {
            minimaxMockCalls.push({
                url: url.href,
                method: init?.method ?? "GET",
                body: typeof init?.body === "string" ? init.body : "",
            });
            const response = minimaxResponse(url);
            if (response) return response;
        }
        if (url.href === "https://example.com/generated/test.png") {
            return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
                status: 200,
                headers: { "Content-Type": "image/png" },
            });
        }
        return previousFetch!(input, init);
    };
}

export function resetMinimaxMockCalls(): void {
    minimaxMockCalls.length = 0;
}

export function getMinimaxMockCalls(): MinimaxMockCall[] {
    return minimaxMockCalls.slice();
}

/** Clean up all fetch interceptors. */
export function cleanupMinimaxMocks(): void {
    if (!previousFetch) return;
    globalThis.fetch = previousFetch;
    previousFetch = null;
    resetMinimaxMockCalls();
}

// MiniMax API mocks for E2E tests.
// Patch fetch directly instead of relying on HTTP interception.

const MINIMAX_BASE = "https://api.minimax.io";
const GENERATED_IMAGE_PNG = new Uint8Array(
    Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQI12Psjvn2n4GBgYGJAQoAK40C4HMwMBgAAAAASUVORK5CYII=",
        "base64"
    )
);
const GENERATED_VIDEO_MP4 = new Uint8Array(Buffer.from("fake-mp4-data"));
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
                    model: "MiniMax-M3"
                }
            }
        },
        {
            event: "content_block_start",
            data: {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" }
            }
        },
        {
            event: "content_block_delta",
            data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }
        },
        { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
        {
            event: "message_delta",
            data: {
                type: "message_delta",
                delta: { stop_reason: "end_turn" },
                usage: { output_tokens: text.length }
            }
        },
        { event: "message_stop", data: { type: "message_stop" } }
    ];
    return (
        events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n`).join("\n")
        + "\n"
    );
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    });
}

function requestBody(init?: RequestInit): Record<string, unknown> {
    if (typeof init?.body !== "string") return {};
    try {
        return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function minimaxResponse(url: URL, init?: RequestInit): Response | null {
    switch (url.pathname) {
        case "/anthropic/v1/messages":
            return new Response(
                anthropicTextSSE("Hello! I'm HallucyGenie, your gaming buddy! 🎮 How can I help?"),
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache"
                    }
                }
            );

        case "/v1/image_generation": {
            const n = Math.max(1, Math.min(4, Number(requestBody(init).n ?? 1)));
            return jsonResponse({
                data: {
                    image_urls: Array.from(
                        { length: n },
                        (_, index) => `https://example.com/generated/test-${index + 1}.png`
                    )
                },
                base_resp: { status_code: 0 }
            });
        }

        case "/v1/t2a_v2":
            return jsonResponse({
                data: {
                    audio: Buffer.from("fake-mp3-data").toString("hex")
                },
                base_resp: { status_code: 0 }
            });

        case "/v1/lyrics_generation":
            return jsonResponse({
                lyrics: "Verse one, game on\nChorus, win the fight",
                base_resp: { status_code: 0 }
            });

        case "/v1/music_generation":
            return jsonResponse({
                data: {
                    audio: Buffer.from("fake-music-data").toString("hex")
                },
                base_resp: { status_code: 0 }
            });

        case "/v1/music_cover_preprocess":
            return jsonResponse({
                data: {
                    cover_feature_id: "cover-e2e-1",
                    formatted_lyrics: "Verse, cover ready\nChorus, remix go"
                },
                base_resp: { status_code: 0 }
            });

        case "/v1/video_generation":
            return jsonResponse({ task_id: "video-task-e2e", base_resp: { status_code: 0 } });

        case "/v1/query/video_generation":
            return jsonResponse({
                status: "success",
                file_id: "video-file-e2e",
                base_resp: { status_code: 0 }
            });

        case "/v1/files/retrieve":
            return jsonResponse({
                download_url: "https://example.com/generated/test-video.mp4",
                base_resp: { status_code: 0 }
            });

        case "/v1/coding_plan/search":
            return jsonResponse({
                data: {
                    results: [
                        {
                            title: "Test Result",
                            url: "https://example.com",
                            snippet: "This is a test search result."
                        }
                    ]
                }
            });

        case "/v1/coding_plan/vlm":
            return jsonResponse({
                choices: [
                    {
                        message: { content: "I can see a test image." }
                    }
                ]
            });

        case "/v1/token_plan/remains":
            return jsonResponse({
                model_remains: [
                    {
                        model_name: "general",
                        current_interval_total_count: 1000,
                        current_interval_usage_count: 5,
                        remains_time: 86400000
                    },
                    {
                        model_name: "video",
                        current_interval_total_count: 0,
                        current_interval_usage_count: 0,
                        remains_time: 86400000
                    }
                ]
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
                body: typeof init?.body === "string" ? init.body : ""
            });
            const response = minimaxResponse(url, init);
            if (response) return response;
        }
        if (/^https:\/\/example\.com\/generated\/test-\d+\.png$/.test(url.href)) {
            return new Response(GENERATED_IMAGE_PNG, {
                status: 200,
                headers: { "Content-Type": "image/png" }
            });
        }
        if (url.href === "https://example.com/generated/test-video.mp4") {
            return new Response(GENERATED_VIDEO_MP4, {
                status: 200,
                headers: { "Content-Type": "video/mp4" }
            });
        }
        return previousFetch?.(input, init);
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

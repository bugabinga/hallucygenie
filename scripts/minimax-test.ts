// HallucyGenie — MiniMax live API smoke test

type JsonObject = Record<string, unknown>;

const MINIMAX_BASE = "https://api.minimax.io";

export function statusLine(data: JsonObject): string {
    const base = data.base_resp as JsonObject | undefined;
    if (!base) return "MiniMax status: missing base_resp";
    const code = base.status_code;
    const msg = base.status_msg;
    return `MiniMax status: ${String(code)} (${String(msg)})`;
}

export function hexSummary(hex: unknown): string {
    if (typeof hex !== "string" || hex.length === 0) return "missing";
    return `present (${hex.length} hex chars)`;
}

export function imageUrlSummary(urls: unknown): string {
    if (!Array.isArray(urls) || urls.length === 0 || typeof urls[0] !== "string") return "missing";
    try {
        const parsed = new URL(urls[0]);
        return `present (${urls.length}, host ${parsed.host})`;
    } catch {
        return `present (${urls.length})`;
    }
}

function apiKey(): string {
    const key = process.env.MINIMAX_API_KEY;
    if (!key) throw new Error("MINIMAX_API_KEY is missing");
    return key;
}

async function readJson(resp: Response): Promise<JsonObject> {
    const text = await resp.text();
    if (!text) return {};
    try {
        return JSON.parse(text) as JsonObject;
    } catch {
        return { raw: text.slice(0, 500) };
    }
}

async function postJson(
    path: string,
    body: JsonObject,
): Promise<{ http: number; data: JsonObject }> {
    const resp = await fetch(`${MINIMAX_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify(body),
    });
    return { http: resp.status, data: await readJson(resp) };
}

async function getJson(path: string): Promise<{ http: number; data: JsonObject }> {
    const resp = await fetch(`${MINIMAX_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${apiKey()}`,
            "User-Agent": "hallucygenie/1.0",
        },
    });
    return { http: resp.status, data: await readJson(resp) };
}

function printSection(title: string): void {
    console.log(`\n${title}`);
    console.log("-".repeat(title.length));
}

function printResult(result: { http: number; data: JsonObject }): void {
    console.log(`HTTP: ${result.http}`);
    console.log(statusLine(result.data));
}

async function testQuota(): Promise<void> {
    printSection("Quota /v1/token_plan/remains");
    const result = await getJson("/v1/token_plan/remains");
    console.log(`HTTP: ${result.http}`);
    const remains = result.data.model_remains;
    if (!Array.isArray(remains)) {
        console.log("model_remains: missing");
        console.log(JSON.stringify(result.data, null, 2));
        return;
    }
    for (const item of remains as JsonObject[]) {
        console.log(`- ${String(item.model_name)}: ${String(item.current_interval_total_count)}`);
    }
}

async function testTts(): Promise<void> {
    printSection("TTS /v1/t2a_v2");
    const result = await postJson("/v1/t2a_v2", {
        model: "speech-2.8-hd",
        text: "test",
        voice_setting: { voice_id: "English_expressive_narrator" },
    });
    printResult(result);
    const data = result.data.data as JsonObject | undefined;
    console.log(`audio: ${hexSummary(data?.audio)}`);
}

async function testImage(): Promise<void> {
    printSection("Image /v1/image_generation");
    const result = await postJson("/v1/image_generation", {
        model: "image-01",
        prompt: "test image, simple icon",
    });
    printResult(result);
    const data = result.data.data as JsonObject | undefined;
    console.log(`image_urls: ${imageUrlSummary(data?.image_urls)}`);
}

export function musicInstrumentalPayload(): JsonObject {
    return {
        model: "music-2.6",
        prompt: "short upbeat chiptune game loop",
        is_instrumental: true,
        output_format: "hex",
    };
}

async function testMusic(): Promise<void> {
    printSection("Music /v1/music_generation instrumental");
    console.log("Payload: is_instrumental=true, no lyrics");
    const result = await postJson("/v1/music_generation", musicInstrumentalPayload());
    printResult(result);
    const data = result.data.data as JsonObject | undefined;
    console.log(`audio: ${hexSummary(data?.audio)}`);
}

export async function main(): Promise<void> {
    console.log("MiniMax live API smoke test");
    console.log("Raw media omitted from output.");
    await testQuota();
    await testTts();
    await testImage();
    await testMusic();
}

if (import.meta.main) {
    main().catch((err) => {
        console.error(String(err));
        process.exit(1);
    });
}

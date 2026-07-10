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

export function dataUrlSummary(value: unknown): string {
    if (typeof value !== "string") return "missing";
    const match = value.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return "missing";
    return `present (${match[1]}, ${match[2].length} base64 chars)`;
}

export function textSummary(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) return "missing";
    return `present (${value.length} chars)`;
}

export function vlmPayload(imageUrl: string): JsonObject {
    return {
        prompt: "Describe this image in one short sentence.",
        image_url: imageUrl
    };
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
    body: JsonObject
): Promise<{ http: number; data: JsonObject; }> {
    const resp = await fetch(`${MINIMAX_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey()}`
        },
        body: JSON.stringify(body)
    });
    return { http: resp.status, data: await readJson(resp) };
}

async function getJson(path: string): Promise<{ http: number; data: JsonObject; }> {
    const resp = await fetch(`${MINIMAX_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${apiKey()}`,
            "User-Agent": "hallucygenie/1.0"
        }
    });
    return { http: resp.status, data: await readJson(resp) };
}

function imageMime(url: string, contentType: string | null): string {
    const lowerType = (contentType ?? "").toLowerCase();
    if (lowerType.includes("image/jpeg") || lowerType.includes("image/jpg")) return "image/jpeg";
    if (lowerType.includes("image/png")) return "image/png";
    if (lowerType.includes("image/webp")) return "image/webp";
    if (lowerType.includes("image/gif")) return "image/gif";

    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith(".png")) return "image/png";
    if (lowerUrl.endsWith(".webp")) return "image/webp";
    if (lowerUrl.endsWith(".gif")) return "image/gif";
    if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) return "image/jpeg";

    throw new Error(`Unsupported image content type: ${contentType ?? "unknown"}`);
}

export async function imageDataUrlFromUrl(url: string): Promise<string> {
    const resp = await fetch(url, { headers: { "User-Agent": "hallucygenie/1.0" } });
    if (!resp.ok) throw new Error(`Image download failed: HTTP ${resp.status}`);

    const mime = imageMime(url, resp.headers.get("content-type"));
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.length === 0) throw new Error("Image download returned no bytes");
    if (bytes.length > 20 * 1024 * 1024) throw new Error("Image exceeds VLM 20MB limit");

    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

function printSection(title: string): void {
    console.log(`\n${title}`);
    console.log("-".repeat(title.length));
}

function printResult(result: { http: number; data: JsonObject; }): void {
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
        console.log(
            `- ${String(item.model_name)}: ${String(item.current_interval_total_count)}`
        );
    }
}

async function testTts(): Promise<void> {
    printSection("TTS /v1/t2a_v2");
    const result = await postJson("/v1/t2a_v2", {
        model: "speech-2.8-hd",
        text: "test",
        voice_setting: { voice_id: "English_expressive_narrator" }
    });
    printResult(result);
    const data = result.data.data as JsonObject | undefined;
    console.log(`audio: ${hexSummary(data?.audio)}`);
}

async function testImage(): Promise<void> {
    printSection("Image /v1/image_generation");
    const result = await postJson("/v1/image_generation", {
        model: "image-01",
        prompt: "test image, simple icon"
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
        output_format: "hex"
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

async function testVlm(): Promise<void> {
    printSection("VLM /v1/coding_plan/vlm");
    const imageUrl = "https://www.gstatic.com/webp/gallery/1.jpg";
    const imageDataUrl = await imageDataUrlFromUrl(imageUrl);
    console.log(`image: ${dataUrlSummary(imageDataUrl)}`);
    const result = await postJson("/v1/coding_plan/vlm", vlmPayload(imageDataUrl));
    printResult(result);
    console.log(`content: ${textSummary(result.data.content)}`);
}

export async function main(): Promise<void> {
    console.log("MiniMax live API smoke test");
    console.log("Raw media omitted from output.");
    await testQuota();
    await testTts();
    await testImage();
    await testMusic();
    await testVlm();
}

export function handleMainError(err: unknown): never {
    console.error(String(err));
    process.exit(1);
}

if (import.meta.main) {
    main().catch(handleMainError);
}

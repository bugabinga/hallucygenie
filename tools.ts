// HallucyGenie — Tool definitions and execution
// Implements generate_image, text_to_speech, generate_music

// ── Types ────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolResult {
  type: "image" | "audio" | "error";
  content: string;
}

// ── Configuration ────────────────────────────────────────────────────

export const MINIMAX_BASE = "https://api.minimax.io";

// ── Tool schemas (Anthropic format) ───────────────────────────────────

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "generate_image",
      description:
        "Generate an image from a text prompt. Returns the URL of the generated image.",
      input_schema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image to generate",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "text_to_speech",
      description:
        "Convert text to speech audio. Returns a base64-encoded MP3 audio data URL.",
      input_schema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to convert to speech",
          },
          voice_id: {
            type: "string",
            description:
              'Voice ID to use. Defaults to "English_expressive_narrator".',
          },
        },
        required: ["text"],
      },
    },
    {
      name: "generate_music",
      description:
        "Generate music from a prompt and optional lyrics. Returns a base64-encoded MP3 audio data URL.",
      input_schema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Description of the music to generate",
          },
          lyrics: {
            type: "string",
            description: "Optional lyrics for the generated music",
          },
        },
        required: ["prompt"],
      },
    },
  ];
}

// ── Tool execution ───────────────────────────────────────────────────

/**
 * Execute a tool by name with the given arguments.
 * Dispatches to the appropriate tool function.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  apiKey: string
): Promise<ToolResult> {
  switch (name) {
    case "generate_image":
      return generateImage(
        args.prompt as string,
        apiKey
      );
    case "text_to_speech":
      return textToSpeech(
        args.text as string,
        apiKey,
        args.voice_id as string | undefined
      );
    case "generate_music":
      return generateMusic(
        args.prompt as string,
        apiKey,
        args.lyrics as string | undefined
      );
    default:
      return { type: "error", content: `Unknown tool: ${name}` };
  }
}

// ── Tool implementations ─────────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 * Calls POST /v1/image_generation with model "image-01".
 */
export async function generateImage(
  prompt: string,
  apiKey: string
): Promise<ToolResult> {
  try {
    const resp = await fetch(`${MINIMAX_BASE}/v1/image_generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "image-01",
        prompt,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return {
        type: "error",
        content: `Image generation API error: ${resp.status} — ${errorText}`,
      };
    }

    const data = (await resp.json()) as {
      data?: { image_urls?: string[] };
    };

    const urls = data?.data?.image_urls;
    if (!urls || urls.length === 0) {
      return {
        type: "error",
        content: "Image generation returned no image URLs",
      };
    }

    return { type: "image", content: urls[0] };
  } catch (err) {
    return {
      type: "error",
      content: `Image generation failed: ${String(err)}`,
    };
  }
}

/**
 * Convert text to speech.
 * Calls POST /v1/t2a_v2 with model "speech-2.8-hd".
 * Returns a data:audio/mp3;base64,... data URL.
 */
export async function textToSpeech(
  text: string,
  apiKey: string,
  voiceId?: string
): Promise<ToolResult> {
  const voice = voiceId || "English_expressive_narrator";

  try {
    const resp = await fetch(`${MINIMAX_BASE}/v1/t2a_v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "speech-2.8-hd",
        text,
        voice_setting: { voice_id: voice },
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return {
        type: "error",
        content: `TTS API error: ${resp.status} — ${errorText}`,
      };
    }

    const data = (await resp.json()) as { data?: { audio?: string } };
    const hex = data?.data?.audio;

    if (!hex) {
      return {
        type: "error",
        content: "TTS returned empty audio data",
      };
    }

    const base64 = Buffer.from(hex, "hex").toString("base64");
    return {
      type: "audio",
      content: `data:audio/mp3;base64,${base64}`,
    };
  } catch (err) {
    return {
      type: "error",
      content: `TTS failed: ${String(err)}`,
    };
  }
}

/**
 * Generate music from a prompt and optional lyrics.
 * Calls POST /v1/music_generation with model "music-2.6".
 * Returns a data:audio/mp3;base64,... data URL.
 */
export async function generateMusic(
  prompt: string,
  apiKey: string,
  lyrics?: string
): Promise<ToolResult> {
  try {
    const payload: Record<string, unknown> = {
      model: "music-2.6",
      prompt,
    };
    if (lyrics) {
      payload.lyrics = lyrics;
    }

    const resp = await fetch(`${MINIMAX_BASE}/v1/music_generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return {
        type: "error",
        content: `Music generation API error: ${resp.status} — ${errorText}`,
      };
    }

    const data = (await resp.json()) as { data?: { audio?: string } };
    const hex = data?.data?.audio;

    if (!hex) {
      return {
        type: "error",
        content: "Music generation returned empty audio data",
      };
    }

    const base64 = Buffer.from(hex, "hex").toString("base64");
    return {
      type: "audio",
      content: `data:audio/mp3;base64,${base64}`,
    };
  } catch (err) {
    return {
      type: "error",
      content: `Music generation failed: ${String(err)}`,
    };
  }
}

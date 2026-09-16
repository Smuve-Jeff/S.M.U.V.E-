import { AppError } from "@/lib";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const FALLBACK_TEXT =
  "Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.";

const FAL_KEY = process.env.FAL_KEY;

export class AiProviderUnavailableError extends Error {
  constructor(message = "AI image generation is not configured") {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

type GenAiModel = {
  generateContent: (opts: {
    model?: string;
    contents: string;
  }) => Promise<{ text?: string; response?: { text?: () => string } }>;
};

/**
 * Proxy for the frontend's POST /api/ai/analyze. Uses the Gemini API when a
 * GEMINI_API_KEY is configured; otherwise returns a canned offline response so
 * the app never hard-fails. Mirrors the old server's AI behavior.
 */
export const analyzePrompt = async (
  prompt: string,
): Promise<{ text: string }> => {
  if (!GEMINI_API_KEY) {
    return { text: FALLBACK_TEXT };
  }

  try {
    // Lazy require so the API boots without @google/genai installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const genAIMod = await import("@google/genai");
    const GoogleGenAI = (genAIMod as { GoogleGenAI: new (opts: { apiKey: string }) => unknown })
      .GoogleGenAI;
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // The modern SDK exposes `ai.models.generateContent(...)`.
    const models = (ai as { models?: { generateContent?: GenAiModel["generateContent"] } }).models;
    if (!models?.generateContent) {
      return { text: FALLBACK_TEXT };
    }
    const result = await models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text =
      (result?.text as string | undefined) ||
      (typeof result?.response?.text === "function"
        ? result.response.text()
        : undefined);
    return { text: text || FALLBACK_TEXT };
  } catch (error) {
    console.error("AI proxy error:", error);
    throw new AppError(502, "AI service unavailable");
  }
};

/**
 * Generate a concept frame through fal.ai without exposing the provider key to
 * the browser. Text shot planning remains available through Gemini/local
 * fallback when FAL_KEY has not been configured.
 */
export const generateConceptArt = async (
  prompt: string,
): Promise<{ type: "image"; url: string }> => {
  if (!FAL_KEY) throw new AiProviderUnavailableError();

  const response = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new AppError(502, "AI image provider unavailable");
  }

  const payload = (await response.json()) as {
    images?: Array<{ url?: string }>;
  };
  const url = payload.images?.[0]?.url;
  if (!url) throw new AppError(502, "AI image provider returned no image");
  return { type: "image", url };
};

import { AppError } from "@/lib";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Overridable so an operator can pin a model without a code change. Defaults
// to the current Flash tier used across the product.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const FALLBACK_TEXT =
  "Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.";

const FAL_KEY = process.env.FAL_KEY;

export class AiProviderUnavailableError extends Error {
  constructor(message = "AI image generation is not configured") {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

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
    // Dynamic import keeps boot cheap and avoids loading the SDK until a
    // request actually needs it.
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    // `GenerateContentResponse.text` is a getter that concatenates the first
    // candidate's text parts (and is undefined when the model returns none).
    return { text: result.text || FALLBACK_TEXT };
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

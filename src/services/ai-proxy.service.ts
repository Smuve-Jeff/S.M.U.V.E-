import { AppError } from "@/lib";
import { AI_MANAGER_STANDARDS } from "../ai-manager.contract";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Overridable so an operator can pin a model without a code change. Defaults
// to the current Flash tier used across the product.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const FALLBACK_TEXT =
  "Strategic Link Severed. Offline processing active. FIX YOUR FUCKING CONNECTION.";

const FAL_KEY = process.env.FAL_KEY;

/**
 * Provider statuses that mean "not now" rather than "never". A single 503 or a
 * momentary 429 used to end the artist's request with a severed-link line even
 * though the same call succeeds a second later, which trained users to retype
 * work the app had already accepted. These are retried; every other 4xx (bad
 * key, blocked content, malformed request) fails on the first attempt because
 * repeating it only spends quota.
 */
const RETRYABLE_PROVIDER_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
/** One attempt plus two retries: enough to ride out a provider blip. */
export const AI_PROVIDER_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 4_000;
/** A provider asking for a longer wait than this is not worth blocking on. */
const MAX_RETRY_AFTER_MS = 8_000;
/** What the client may be told to wait — the provider's own hint, unclipped. */
const MAX_REPORTED_RETRY_AFTER_MS = 300_000;

/** Provider call facts reported back to the client so its status copy is true. */
export interface AiCallMeta {
  model: string;
  attempts: number;
  latencyMs: number;
}

export class AiProviderUnavailableError extends Error {
  constructor(message = "AI image generation is not configured") {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

interface ProviderLikeError {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  response?: { status?: unknown; headers?: unknown };
  error?: { code?: unknown; status?: unknown };
}

/**
 * The HTTP status a provider SDK error carries, if it carries one.
 *
 * `@google/genai` surfaces failures as an `ApiError` with `status`, but a
 * transport failure arrives as a `TypeError`/`AbortError` with none, and a
 * proxy-shaped error puts it under `response.status`. Reading all three keeps
 * the retry decision attached to the real cause.
 */
export function providerErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as ProviderLikeError;
  const raw = [
    candidate.status,
    candidate.statusCode,
    candidate.response?.status,
    candidate.error?.status,
    candidate.error?.code,
  ];
  for (const value of raw) {
    const status = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }
  }
  return undefined;
}

/** Whether a call that failed this way has a real chance of succeeding again. */
export function isRetryableProviderError(error: unknown): boolean {
  const status = providerErrorStatus(error);
  if (status !== undefined) return RETRYABLE_PROVIDER_STATUSES.has(status);
  // No status: a dropped socket, DNS failure or the SDK's own abort timer. A
  // timeout is worth one more attempt; a malformed request would carry a 400.
  return true;
}

/** A provider's `Retry-After` hint in milliseconds, when it sent one. */
export function providerRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const headers = (error as ProviderLikeError).response?.headers;
  let raw: unknown;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, unknown>)["retry-after"];
  }
  if (raw === undefined || raw === null || raw === "") return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.min(
      MAX_REPORTED_RETRY_AFTER_MS,
      Math.max(0, Math.round(seconds * 1000)),
    );
  }
  const date = Date.parse(String(raw));
  if (Number.isNaN(date)) return undefined;
  return Math.min(
    MAX_REPORTED_RETRY_AFTER_MS,
    Math.max(0, date - Date.now()),
  );
}

/**
 * How long to wait before attempt `attempt + 1`.
 *
 * Exponential, capped, with jitter so a burst of artists hitting the same
 * provider limit does not retry in lockstep. A provider `Retry-After` wins
 * because it is the only party that knows when its window reopens.
 */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs?: number,
): number {
  // The artist is told the provider's real window (providerRetryAfterMs); the
  // retry itself only waits what the request budget can afford.
  if (retryAfterMs !== undefined) {
    return Math.min(MAX_RETRY_AFTER_MS, retryAfterMs);
  }
  const exponential = Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt)),
  );
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run a provider call, retrying only the failures that can heal.
 *
 * Returns the successful result with the number of attempts it took, or
 * rethrows the last error so the caller can turn it into one honest status
 * code.
 */
export async function withProviderRetry<T>(
  run: (attempt: number) => Promise<T>,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < AI_PROVIDER_MAX_ATTEMPTS; attempt += 1) {
    try {
      return { value: await run(attempt), attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt === AI_PROVIDER_MAX_ATTEMPTS - 1) break;
      if (!isRetryableProviderError(error)) break;
      await sleep(backoffDelayMs(attempt, providerRetryAfterMs(error)));
    }
  }
  throw lastError;
}

/**
 * The client-facing failure for a provider call that never succeeded.
 *
 * The distinction matters downstream: a 429 tells the artist to resend in a
 * minute, a 504 says the request was too slow, and only a 502 is the app
 * admitting the link itself is broken. Collapsing all three into one 502 (as
 * this did) made the UI's "severed" copy the only thing it could ever say.
 */
export function providerFailure(error: unknown): AppError {
  const status = providerErrorStatus(error);
  const retryAfterMs = providerRetryAfterMs(error);
  if (status === 429) {
    return new AppError(
      429,
      "The AI provider is rate limiting S.M.U.V.E. Try again shortly.",
      retryAfterMs !== undefined ? { retryAfterMs } : undefined,
    );
  }
  if (status === 408 || status === 504) {
    return new AppError(504, "The AI provider took too long to answer.");
  }
  return new AppError(502, "AI service unavailable");
}

/**
 * Proxy for the frontend's POST /api/ai/analyze. Uses the Gemini API when a
 * GEMINI_API_KEY is configured; otherwise returns a canned offline response so
 * the app never hard-fails. Mirrors the old server's AI behavior.
 */
export const analyzePrompt = async (
  prompt: string,
): Promise<{ text: string; meta?: AiCallMeta }> => {
  if (!GEMINI_API_KEY) {
    return { text: FALLBACK_TEXT };
  }

  const startedAt = Date.now();
  try {
    // Dynamic import keeps boot cheap and avoids loading the SDK until a
    // request actually needs it.
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { timeout: 25_000 },
    });

    const { value: result, attempts } = await withProviderRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: AI_MANAGER_STANDARDS,
          maxOutputTokens: 2048,
        },
      }),
    );
    // `GenerateContentResponse.text` is a getter that concatenates the first
    // candidate's text parts (and is undefined when the model returns none).
    return {
      text: result.text || FALLBACK_TEXT,
      meta: {
        model: GEMINI_MODEL,
        attempts,
        latencyMs: Math.max(0, Date.now() - startedAt),
      },
    };
  } catch (error) {
    console.error("AI proxy request failed"); // Never log prompts, provider URLs or credentials.
    throw providerFailure(error);
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

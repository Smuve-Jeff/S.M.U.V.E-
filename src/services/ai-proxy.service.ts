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

// ── Visual grounding + Photo Studio + image-to-video ──────────────────
//
// S.M.U.V.E. could talk about a frame it had never seen. These three
// additions give the director eyes (Gemini Vision on the already-wired
// GEMINI_API_KEY) and hands (fal.ai photo enhancement, AI cutout and
// image-to-video on the already-wired FAL_KEY). No new provider is
// introduced, so an installation that has one key or the other degrades
// feature-by-feature instead of failing as a whole.

/** fal.ai endpoints, verified against fal.ai's published schemas. */
const FAL_TOPAZ_UPSCALE_IMAGE = "https://fal.run/fal-ai/topaz/upscale/image";
const FAL_BIREFNET_V2 = "https://fal.run/fal-ai/birefnet/v2";
/** Image-to-video runs through the fal queue: renders take minutes, not ms. */
const FAL_PIKA_V2_2_IMAGE_TO_VIDEO = "fal-ai/pika/v2.2/image-to-video";
/** sync-3: animates a still's face to the supplied audio (talking head). */
const FAL_SYNC_LIPSYNC_IMAGE_TO_VIDEO =
  "fal-ai/sync-lipsync/v3/image-to-video";

/**
 * Largest audio source a caller may hand the media endpoints, in characters.
 * The talking-head audio is a data URL WAV and the client caps the slice at
 * 60 s of 16 kHz mono, so this comfortably covers it while bounding POSTs.
 */
export const MAX_AUDIO_SOURCE_LENGTH = 8_000_000;

/**
 * Largest image source a caller may hand the media endpoints, in characters.
 * A device-local photo travels as a data URL, and a 4 MP JPEG is already
 * several megabytes of base64 — the cap is generous but finite so one
 * request cannot carry the whole upload budget.
 */
export const MAX_IMAGE_SOURCE_LENGTH = 8_000_000;

/** MIME types Gemini Vision accepts for an inline frame. */
export const SUPPORTED_FRAME_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Durations the chosen image-to-video model renders, in seconds. */
export const SHOT_VIDEO_DURATIONS = [5, 10] as const;

/**
 * Normalise a caller-supplied image into something fal.ai can fetch: an
 * http(s) URL passes through, a data URL passes through, and bare base64
 * (what a canvas grab produces after stripping its prefix) is re-wrapped
 * with the caller's MIME type.
 */
export function normalizeImageSource(
  source: string,
  mimeType = "image/jpeg",
): string {
  const value = source.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `data:${mimeType};base64,${value}`;
}

/** Strip a data-URL prefix down to the raw base64 Gemini Vision expects. */
function rawBase64(image: string): string {
  const comma = image.indexOf(",");
  return image.startsWith("data:") && comma >= 0 ? image.slice(comma + 1) : image;
}

/**
 * One fal.run call: FAL_KEY in the header, the provider's failure mapped
 * through the shared taxonomy so a 429 stays a 429 and a slow provider a
 * 504, and an empty payload a 502 rather than a crash downstream.
 */
async function falRun(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!FAL_KEY) throw new AiProviderUnavailableError();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw providerFailure({ status: response.status });
  }
  return (await response.json()) as Record<string, unknown>;
}

/** The URL a fal media payload carries, or undefined when it carries none. */
function falMediaUrl(payload: Record<string, unknown>): string | undefined {
  const media = payload.image ?? payload.video;
  if (media && typeof media === "object") {
    const url = (media as { url?: unknown }).url;
    return typeof url === "string" && url ? url : undefined;
  }
  return undefined;
}

/**
 * Normalise a caller-supplied audio source the same way as an image: an
 * http(s) URL or data URL passes through; bare base64 is re-wrapped with
 * the caller's MIME type.
 */
export function normalizeAudioSource(
  source: string,
  mimeType = "audio/wav",
): string {
  const value = source.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return `data:${mimeType};base64,${value}`;
}

/** How long the proxy will poll a queued render before giving up. */
export const FAL_QUEUE_MAX_WAIT_MS = 540_000;
export const FAL_QUEUE_POLL_MS = 2_000;

/**
 * One fal queue job: submit, poll the status URL until COMPLETED, fetch the
 * response. Long video renders must not hold a synchronous request, so the
 * movie endpoints go through here while the fast still endpoints keep
 * `falRun`. A FAILED job is a 502 and a deadline overrun a 504 — never a
 * hung socket.
 */
export async function falRunQueue(
  model: string,
  input: Record<string, unknown>,
  options: {
    maxWaitMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Record<string, unknown>> {
  if (!FAL_KEY) throw new AiProviderUnavailableError();
  const auth = { Authorization: `Key ${FAL_KEY}` };

  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw providerFailure({ status: submit.status });
  const submission = (await submit.json()) as Record<string, unknown>;
  const statusUrl = submission.status_url;
  const responseUrl = submission.response_url;
  if (typeof statusUrl !== "string" || typeof responseUrl !== "string") {
    throw new AppError(502, "AI queue provider returned no request URLs");
  }

  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + (options.maxWaitMs ?? FAL_QUEUE_MAX_WAIT_MS);
  for (;;) {
    const poll = await fetch(statusUrl, { headers: auth });
    if (!poll.ok) throw providerFailure({ status: poll.status });
    const status = ((await poll.json()) as Record<string, unknown>).status;
    if (status === "COMPLETED") break;
    if (status === "FAILED") {
      throw new AppError(502, "AI video render failed in the provider queue");
    }
    if (Date.now() > deadline) {
      throw new AppError(504, "AI video render timed out in the provider queue");
    }
    await sleep(FAL_QUEUE_POLL_MS);
  }

  const result = await fetch(responseUrl, { headers: auth });
  if (!result.ok) throw providerFailure({ status: result.status });
  return (await result.json()) as Record<string, unknown>;
}

/**
 * Eyes for S.M.U.V.E: describe or answer questions about one frame.
 *
 * Unlike `analyzePrompt` this never answers offline — a text answer about
 * an unviewed image would be a fabrication, so an unconfigured key is a
 * 503 the client can name honestly.
 */
export const analyzeFrame = async (request: {
  image: string;
  mimeType: string;
  question: string;
}): Promise<{ text: string; meta?: AiCallMeta }> => {
  if (!GEMINI_API_KEY) {
    throw new AiProviderUnavailableError("AI vision is not configured");
  }
  const { image, mimeType, question } = request;
  if (
    !(SUPPORTED_FRAME_MIME_TYPES as readonly string[]).includes(mimeType)
  ) {
    throw new AppError(400, "Unsupported frame format");
  }
  if (!image.trim() || !question.trim()) {
    throw new AppError(400, "image and question are required");
  }

  const startedAt = Date.now();
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { timeout: 25_000 },
    });
    const { value: result, attempts } = await withProviderRetry(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: rawBase64(image) } },
              { text: question },
            ],
          },
        ],
        config: {
          systemInstruction:
            "You are S.M.U.V.E, a film and photography director looking at one frame. " +
            "Answer only from what is visible in the frame; when something is not " +
            "visible, say so instead of guessing. Be concrete: name the subject, " +
            "lighting, composition and anything a director would stage differently.",
          maxOutputTokens: 1024,
        },
      }),
    );
    return {
      text: result.text || FALLBACK_TEXT,
      meta: {
        model: GEMINI_MODEL,
        attempts,
        latencyMs: Math.max(0, Date.now() - startedAt),
      },
    };
  } catch (error) {
    console.error("AI vision request failed"); // Never log prompts, media or credentials.
    throw providerFailure(error);
  }
};

/**
 * Photo Studio enhancement: Topaz upscale + face/detail recovery.
 * `upscaleFactor` is clamped to the model's 1–4 range.
 */
export const enhancePhoto = async (request: {
  image: string;
  mimeType?: string;
  upscaleFactor?: number;
}): Promise<{ type: "image"; url: string }> => {
  const factor = Number(request.upscaleFactor);
  const payload = await falRun(FAL_TOPAZ_UPSCALE_IMAGE, {
    image_url: normalizeImageSource(request.image, request.mimeType),
    upscale_factor: Number.isFinite(factor)
      ? Math.min(4, Math.max(1, Math.round(factor * 10) / 10))
      : 2,
    output_format: "png",
  });
  const url = falMediaUrl(payload);
  if (!url) throw new AppError(502, "AI photo provider returned no image");
  return { type: "image", url };
};

/**
 * Photo Studio cutout: BiRefNet v2 removes the background and returns a
 * transparency-preserving PNG — the AI replacement for the corner-key.
 */
export const cutoutPhoto = async (request: {
  image: string;
  mimeType?: string;
}): Promise<{ type: "image"; url: string }> => {
  const payload = await falRun(FAL_BIREFNET_V2, {
    image_url: normalizeImageSource(request.image, request.mimeType),
    output_format: "png",
  });
  const url = falMediaUrl(payload);
  if (!url) throw new AppError(502, "AI photo provider returned no cutout");
  return { type: "image", url };
};

/**
 * Director v2 image-to-video: Pika 2.2 animates one still frame.
 * Duration snaps to a length the model renders (5 or 10 seconds).
 */
export const generateShotVideo = async (request: {
  image: string;
  mimeType?: string;
  prompt: string;
  durationSeconds?: number;
}): Promise<{ type: "video"; url: string; duration: number }> => {
  const prompt = request.prompt.trim();
  if (!prompt) throw new AppError(400, "prompt is required");
  const duration =
    Number(request.durationSeconds) > 5 ? 10 : 5;
  const payload = await falRunQueue(FAL_PIKA_V2_2_IMAGE_TO_VIDEO, {
    image_url: normalizeImageSource(request.image, request.mimeType),
    prompt,
    duration,
  });
  const url = falMediaUrl(payload);
  if (!url) throw new AppError(502, "AI video provider returned no video");
  return { type: "video", url, duration };
};

/**
 * Talking head: sync-3 animates a still's face so it lip-syncs to the
 * supplied audio. The output matches the audio's duration (the client
 * sends the slice it cut), so the returned duration echoes that for the
 * lane placement.
 */
export const generateLipSync = async (request: {
  image: string;
  mimeType?: string;
  audio: string;
  durationSeconds?: number;
}): Promise<{ type: "video"; url: string; duration: number }> => {
  const image = request.image?.trim();
  const audio = request.audio?.trim();
  if (!image) throw new AppError(400, "image is required");
  if (!audio) throw new AppError(400, "audio is required");
  const payload = await falRunQueue(FAL_SYNC_LIPSYNC_IMAGE_TO_VIDEO, {
    image_url: normalizeImageSource(image, request.mimeType),
    audio_url: normalizeAudioSource(audio),
  });
  const url = falMediaUrl(payload);
  if (!url) throw new AppError(502, "AI lip-sync provider returned no video");
  const duration = Number(request.durationSeconds);
  return {
    type: "video",
    url,
    duration: Number.isFinite(duration)
      ? Math.min(120, Math.max(1, duration))
      : 0,
  };
};

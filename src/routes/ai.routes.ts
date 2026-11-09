import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  analyzePrompt,
  analyzeFrame,
  cutoutPhoto,
  enhancePhoto,
  generateConceptArt,
  generateLipSync,
  generateShotVideo,
  MAX_AUDIO_SOURCE_LENGTH,
  MAX_IMAGE_SOURCE_LENGTH,
  AiProviderUnavailableError,
} from "@/services";
import { authenticate } from "@/middleware/auth";

const router = Router();

import { AI_MAX_PROMPT_LENGTH } from "../ai-manager.contract";
const MAX_PROMPT_LENGTH = AI_MAX_PROMPT_LENGTH;
const MAX_IMAGE_PROMPT_LENGTH = 4000;

// AI calls consume external-provider quota, so these endpoints get stricter
// limiters on top of the app-wide one, split by what the call costs: text is
// cheap and chatty, stills cost real provider money, and video costs the
// most per request by far. One shared budget starved vision/churn calls
// behind concept art, and let one burst of video calls spend the whole
// quarter's image quota.
const aiLimiterOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
} as const;
const textLimiter = rateLimit({ ...aiLimiterOptions, max: 60 });
const imageLimiter = rateLimit({ ...aiLimiterOptions, max: 20 });
const videoLimiter = rateLimit({ ...aiLimiterOptions, max: 5 });

const mediaUnavailable = (
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  what: string,
): unknown =>
  res.status(503).json({
    error: `AI ${what} is not configured. Add FAL_KEY in the environment.`,
  });

// POST /api/ai/analyze — Gemini-backed analysis proxy (authenticated).
router.post("/analyze", authenticate, textLimiter, async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : undefined;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({ error: "prompt too long" });
  }
  res.json(await analyzePrompt(prompt));
});

// POST /api/ai/concept-art — optional fal.ai concept frame generation.
router.post("/concept-art", authenticate, imageLimiter, async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : undefined;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
    return res.status(413).json({ error: "prompt too long" });
  }

  try {
    return res.json(await generateConceptArt(prompt));
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return res.status(503).json({
        error: "AI image generation is not configured. Add FAL_KEY in the environment.",
      });
    }
    throw error;
  }
});

// POST /api/ai/vision — Gemini Vision: answer a question about one frame.
// The image is the frame's base64 (or a data URL); the question is what the
// artist wants to know about it. Vision never answers offline: a guess about
// an unviewed frame is worse than a 503.
router.post("/vision", authenticate, imageLimiter, async (req, res) => {
  const image =
    typeof req.body?.image === "string" ? req.body.image : undefined;
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";
  const question =
    typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!image) return res.status(400).json({ error: "image is required" });
  if (image.length > MAX_IMAGE_SOURCE_LENGTH) {
    return res.status(413).json({ error: "image too large" });
  }
  if (!question) return res.status(400).json({ error: "question is required" });

  try {
    return res.json(await analyzeFrame({ image, mimeType, question }));
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return res.status(503).json({
        error: "AI vision is not configured. Add GEMINI_API_KEY in the environment.",
      });
    }
    throw error;
  }
});

// POST /api/ai/photo/enhance — Photo Studio upscale/enhance (Topaz).
router.post("/photo/enhance", authenticate, imageLimiter, async (req, res) => {
  const image =
    typeof req.body?.image === "string" ? req.body.image : undefined;
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined;
  const upscaleFactor =
    typeof req.body?.upscaleFactor === "number"
      ? req.body.upscaleFactor
      : undefined;
  if (!image) return res.status(400).json({ error: "image is required" });
  if (image.length > MAX_IMAGE_SOURCE_LENGTH) {
    return res.status(413).json({ error: "image too large" });
  }

  try {
    return res.json(await enhancePhoto({ image, mimeType, upscaleFactor }));
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return mediaUnavailable(res, "photo tools");
    }
    throw error;
  }
});

// POST /api/ai/photo/cutout — Photo Studio AI background removal (BiRefNet).
router.post("/photo/cutout", authenticate, imageLimiter, async (req, res) => {
  const image =
    typeof req.body?.image === "string" ? req.body.image : undefined;
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined;
  if (!image) return res.status(400).json({ error: "image is required" });
  if (image.length > MAX_IMAGE_SOURCE_LENGTH) {
    return res.status(413).json({ error: "image too large" });
  }

  try {
    return res.json(await cutoutPhoto({ image, mimeType }));
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return mediaUnavailable(res, "photo tools");
    }
    throw error;
  }
});

// POST /api/ai/shot-video — Director v2: animate one still frame (Pika).
// `image` (base64 / data URL) and `imageUrl` (a hosted frame URL, e.g. a
// just-generated concept still) are interchangeable here.
router.post("/shot-video", authenticate, videoLimiter, async (req, res) => {
  const image =
    typeof req.body?.image === "string"
      ? req.body.image
      : typeof req.body?.imageUrl === "string"
        ? req.body.imageUrl
        : undefined;
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined;
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : undefined;
  const durationSeconds =
    typeof req.body?.durationSeconds === "number"
      ? req.body.durationSeconds
      : undefined;
  if (!image) return res.status(400).json({ error: "image is required" });
  if (image.length > MAX_IMAGE_SOURCE_LENGTH) {
    return res.status(413).json({ error: "image too large" });
  }
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
    return res.status(413).json({ error: "prompt too long" });
  }

  try {
    return res.json(
      await generateShotVideo({ image, mimeType, prompt, durationSeconds }),
    );
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return mediaUnavailable(res, "video generation");
    }
    throw error;
  }
});

// POST /api/ai/lip-sync — Talking head: animate one still to audio (sync-3).
// The audio travels as a data-URL WAV (the client's blob: overlay URL is
// meaningless to fal); the client caps the slice at 60 s, and
// `durationSeconds` echoes it for lane placement.
router.post("/lip-sync", authenticate, videoLimiter, async (req, res) => {
  const image =
    typeof req.body?.image === "string" ? req.body.image : undefined;
  const mimeType =
    typeof req.body?.mimeType === "string" ? req.body.mimeType : undefined;
  const audio =
    typeof req.body?.audio === "string" ? req.body.audio : undefined;
  const durationSeconds =
    typeof req.body?.durationSeconds === "number"
      ? req.body.durationSeconds
      : undefined;
  if (!image) return res.status(400).json({ error: "image is required" });
  if (image.length > MAX_IMAGE_SOURCE_LENGTH) {
    return res.status(413).json({ error: "image too large" });
  }
  if (!audio) return res.status(400).json({ error: "audio is required" });
  if (audio.length > MAX_AUDIO_SOURCE_LENGTH) {
    return res.status(413).json({ error: "audio too large" });
  }

  try {
    return res.json(
      await generateLipSync({ image, mimeType, audio, durationSeconds }),
    );
  } catch (error) {
    if (error instanceof AiProviderUnavailableError) {
      return mediaUnavailable(res, "lip-sync");
    }
    throw error;
  }
});

export default router;

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { analyzePrompt } from "@/services";
import { authenticate } from "@/middleware/auth";

const router = Router();

const MAX_PROMPT_LENGTH = 8000;

// AI calls consume external-provider quota, so this endpoint gets a stricter
// limiter on top of the app-wide one.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/ai/analyze — Gemini-backed analysis proxy (authenticated).
router.post("/analyze", authenticate, aiLimiter, async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt : undefined;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(413).json({ error: "prompt too long" });
  }
  res.json(await analyzePrompt(prompt));
});

export default router;

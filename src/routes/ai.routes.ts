import { Router } from "express";
import { analyzePrompt } from "@/services";

const router = Router();

// POST /api/ai/analyze — Gemini-backed analysis proxy.
router.post("/analyze", async (req, res) => {
  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt : undefined;
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }
  res.json(await analyzePrompt(prompt));
});

export default router;

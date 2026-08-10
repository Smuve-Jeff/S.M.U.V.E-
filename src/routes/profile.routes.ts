import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import { getProfile, saveProfile } from "@/services";

const router = Router();

// GET /api/profile/:userId — load a profile's raw JSON blob.
router.get("/:userId", authenticate, async (req, res) => {
  res.json(await getProfile(req.params.userId));
});

// POST /api/profile — upsert { userId, profileData } owned by the caller.
router.post("/", authenticate, async (req, res) => {
  const { userId, profileData } = req.body ?? {};
  if (!userId || !profileData) {
    return res.status(400).json({ error: "Missing userId or profileData." });
  }
  const me = req.user;
  if (!me || (me.role !== "admin" && String(me.userId) !== String(userId))) {
    return res.status(403).json({ error: "Access denied." });
  }
  res.json(await saveProfile({ userId: String(userId), profileData }));
});

export default router;

import { Router } from "express";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import { getProfile, saveProfile } from "@/services";

const router = Router();

// GET /api/profile/:userId — load a profile's raw JSON blob.
//
// The blob is the artist's *private* profile: revenue, split sheets, contacts,
// journey notes. Authentication alone is not authorisation, so the read is
// scoped to the account that owns the row (admins may read any). The id the
// client sends is the account id it is signed in as, so legitimate loads pass
// unchanged; anything else is refused instead of leaking the row.
router.get("/:userId", authenticate, async (req, res) => {
  const me = req.user;
  if (!me) throw new AppError(401, "Authentication required");

  const requested = String(req.params.userId ?? "");
  if (me.role !== "admin" && requested !== String(me.userId)) {
    throw new AppError(403, "You do not have permission to view this profile");
  }

  res.json(await getProfile(requested));
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

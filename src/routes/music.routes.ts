import { Router, type Response } from "express";
import multer from "multer";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/lib";
import {
  listPublishedMasters,
  publishMaster,
  unpublishMaster,
} from "@/services";

const router = Router();

/**
 * A master is much bigger than a general asset: a four-minute WAV recording runs
 * 40–60 MB, where the shared `/api/upload` limit is 25 MB. Only audio is
 * accepted here — this endpoint exists to put recordings on the radio and
 * nothing else, so the general media allowlist would be the wrong shape.
 */
const MAX_MASTER_BYTES = 80 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MASTER_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype || "").toLowerCase().startsWith("audio/")) {
      cb(new AppError(400, "Only audio masters can be published."));
      return;
    }
    cb(null, true);
  },
});

/** Mirrors `/api/upload`: a known failure keeps its status, an unknown one is a 500. */
const fail = (res: Response, err: unknown, fallback: string): void => {
  const e = err as { statusCode?: number; message?: string };
  res.status(e.statusCode ?? 500).json({ error: e.message || fallback });
};

// GET /api/music/masters — public. What the station hosts at full length right
// now; the client joins this onto the catalogue by track id or title.
router.get("/masters", async (_req, res) => {
  res.json({ masters: await listPublishedMasters() });
});

// POST /api/music/masters — upload one recording and put it on air.
router.post(
  "/masters",
  authenticate,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No audio file uploaded." });
        return;
      }
      const entry = await publishMaster(req, req.file, {
        trackId: req.body?.trackId,
        title: req.body?.title,
        album: req.body?.album,
      });
      res.status(201).json(entry);
    } catch (err) {
      fail(res, err, "Failed to publish the master.");
    }
  },
);

// DELETE /api/music/masters/:id — take one recording back off the station.
router.delete("/masters/:id", authenticate, async (req, res) => {
  try {
    res.json({ masters: await unpublishMaster(req.params.id) });
  } catch (err) {
    fail(res, err, "Failed to remove the master.");
  }
});

export default router;

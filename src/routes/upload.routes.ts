import { Router } from "express";
import multer from "multer";
import { authenticate } from "@/middleware/auth";
import { uploadToStorage } from "@/services";
import { AppError } from "@/lib";

const router = Router();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Media allowlist. The app uploads artist assets (cover art, audio stems,
 * clips, PDFs, docs) — everything else is rejected to keep stored objects
 * predictable and avoid serving arbitrary executable content from the CDN.
 */
const isAllowedMime = (mime: string): boolean =>
  mime.startsWith("image/") ||
  mime.startsWith("audio/") ||
  mime.startsWith("video/") ||
  mime === "application/pdf" ||
  mime === "application/zip" ||
  mime === "application/x-zip-compressed" ||
  mime === "application/json" ||
  mime === "text/plain" ||
  mime === "text/markdown" ||
  mime.startsWith("application/vnd.openxmlformats-officedocument.");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime((file.mimetype || "").toLowerCase())) {
      cb(new AppError(400, "File type not allowed."));
      return;
    }
    cb(null, true);
  },
});

// POST /api/upload — upload a single asset to R2, returns { url }.
router.post("/", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    res.json(await uploadToStorage(req, req.file));
  } catch (err) {
    const e = err as { statusCode?: number; message: string };
    res
      .status(e.statusCode ?? 500)
      .json({ error: e.message || "Failed to upload asset to storage." });
  }
});

export default router;

import { Router } from "express";
import multer from "multer";
import { authenticate } from "@/middleware/auth";
import { uploadToStorage } from "@/services";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

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

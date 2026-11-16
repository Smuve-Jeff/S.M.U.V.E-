import { Router, type Request } from "express";
import { Readable } from "node:stream";
import rateLimit from "express-rate-limit";
import { AppError } from "@/lib";
import { authenticate } from "@/middleware/auth";
import {
  clearKickDestination,
  destinationOverview,
  ingestStatus,
  saveKickDestination,
  selfTestStatus,
  startIngestSession,
  startSelfTest,
  stopIngestSession,
} from "@/services/broadcast-ingest.service";
import {
  listBroadcastRecordings,
  openBroadcastRecording,
} from "@/services/broadcast-recordings.service";

const router = Router();

/**
 * Opening a relay session starts an ffmpeg process on the relay, so the
 * budget is per account and small: a host reconnects a handful of times, not
 * sixty.
 */
const pushLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `broadcast-push:${req.user?.userId ?? "unknown"}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Too many broadcast push attempts. Try again in a minute." },
});

function actorOf(req: Request): number {
  if (!req.user) throw new AppError(401, "Authentication required");
  return req.user.userId;
}

// GET /api/broadcast/destinations — which platforms can receive a push.
router.get("/destinations", authenticate, async (req, res) => {
  res.json(await destinationOverview(actorOf(req)));
});

// PUT /api/broadcast/destinations/kick — store the dashboard URL + key.
router.put("/destinations/kick", authenticate, async (req, res) => {
  res.json(await saveKickDestination(actorOf(req), req.body ?? {}));
});

// DELETE /api/broadcast/destinations/kick — forget the Kick destination.
router.delete("/destinations/kick", authenticate, async (req, res) => {
  await clearKickDestination(actorOf(req));
  res.status(204).end();
});

// POST /api/broadcast/ingest/:platform — open a relay session and hand back
// the WHIP URL to publish to. The stream key stays on the server.
router.post("/ingest/:platform", authenticate, pushLimiter, async (req, res) => {
  res.status(201).json(
    await startIngestSession(actorOf(req), String(req.params.platform || "")),
  );
});

// POST /api/broadcast/selftest — prove WHIP → relay → RTMP with a test pattern.
router.post("/selftest", authenticate, pushLimiter, async (_req, res) => {
  res.status(201).json(await startSelfTest());
});

// GET /api/broadcast/selftest/:relayId — what the relay actually received.
router.get("/selftest/:relayId", authenticate, async (req, res) => {
  res.json(await selfTestStatus(String(req.params.relayId || "")));
});

// GET /api/broadcast/ingest/:relayId — is the push still reaching the provider?
// The relay owns the watchdog; this only reports its verdict.
router.get("/ingest/:relayId", authenticate, async (req, res) => {
  res.json(await ingestStatus(String(req.params.relayId || "")));
});

// DELETE /api/broadcast/ingest/:relayId — close the relay session.
router.delete("/ingest/:relayId", authenticate, async (req, res) => {
  await stopIngestSession(String(req.params.relayId || ""));
  res.status(204).end();
});

// GET /api/broadcast/recordings — the host's recordings that still exist on
// the relay. Retention prunes them, so this is never a promise of forever.
router.get("/recordings", authenticate, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json(await listBroadcastRecordings(actorOf(req)));
});

// GET /api/broadcast/recordings/:relayId/download?name=<file> — the bytes.
// Ownership is checked against the session the API opened, and the file name
// must be one the relay listed for it; nothing from the query is pasted into a
// path or a relay URL unchecked.
router.get("/recordings/:relayId/download", authenticate, async (req, res, next) => {
  try {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const file = await openBroadcastRecording(
      actorOf(req),
      String(req.params.relayId || ""),
      name,
    );
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": file.bytes,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    });
    Readable.fromWeb(file.body as never)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router, type Request } from "express";
import { Readable } from "node:stream";
import rateLimit from "express-rate-limit";
import { AppError } from "@/lib";
import { ARCHIVE_TICKET_NAME } from "@/lib/media-ticket";
import { openArchiveStream } from "@/lib/zip-archive";
import { authenticate } from "@/middleware/auth";
import {
  clearManualDestination,
  destinationOverview,
  ingestStatus,
  saveManualDestination,
  selfTestStatus,
  startIngestSession,
  startSelfTest,
  verifyDestinationTest,
  stopIngestSession,
} from "@/services/broadcast-ingest.service";
import {
  deleteBroadcastRecording,
  issueArchiveTicket,
  issuePlaybackTicket,
  listBroadcastRecordings,
  openBroadcastRecording,
  playbackTicketFromQuery,
  recordingArchive,
  relayRecordingStatus,
  setBroadcastRetention,
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

/**
 * Playback asks for one byte range at a time, so it needs a far larger budget
 * than the rest of the API. The global limiter skips this path (see app.ts);
 * this one keeps it bounded.
 */
const streamLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `broadcast-stream:${req.ip ?? "unknown"}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Too many playback requests. Try again in a minute." },
});

function actorOf(req: Request): number {
  if (!req.user) throw new AppError(401, "Authentication required");
  return req.user.userId;
}

// GET /api/broadcast/destinations — which platforms can receive a push.
router.get("/destinations", authenticate, async (req, res) => {
  res.json(await destinationOverview(actorOf(req)));
});

// PUT /api/broadcast/destinations/:platform — store a manual RTMP URL + key.
router.put("/destinations/:platform", authenticate, async (req, res) => {
  res.json(
    await saveManualDestination(
      actorOf(req),
      String(req.params.platform || ""),
      req.body ?? {},
    ),
  );
});

// POST /api/broadcast/destinations/:platform/verify — certify the current
// saved URL + key from a live test session the relay itself confirms.
router.post("/destinations/:platform/verify", authenticate, async (req, res) => {
  res.json(
    await verifyDestinationTest(
      actorOf(req),
      String(req.params.platform || ""),
      String(req.body?.relayId || ""),
    ),
  );
});

// DELETE /api/broadcast/destinations/:platform — forget a manual destination.
router.delete("/destinations/:platform", authenticate, async (req, res) => {
  await clearManualDestination(actorOf(req), String(req.params.platform || ""));
  res.status(204).end();
});

// POST /api/broadcast/ingest — one relay session for a provider fan-out.
// The stream keys stay on the server; the browser only gets the WHIP URL.
router.post("/ingest", authenticate, pushLimiter, async (req, res) => {
  const platforms = Array.isArray(req.body?.platforms)
    ? req.body.platforms.filter((value: unknown) => typeof value === "string")
    : [];
  // Destination tests use the real ingest path but are not shows; keep them
  // out of the host's recordings history.
  const ephemeral = req.body?.ephemeral === true;
  res
    .status(201)
    .json(
      ephemeral
        ? await startIngestSession(actorOf(req), platforms as string[], {
            ephemeral: true,
          })
        : await startIngestSession(actorOf(req), platforms as string[]),
    );
});

// POST /api/broadcast/ingest/:platform — compatibility for one-destination
// callers. New clients use the list route above.
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

// GET /api/broadcast/recordings/status — whether the relay records at all and
// which window is in force, so a panel can warn before a broadcast and notice a
// change without re-reading every recording. Registered before the :relayId
// routes on purpose.
router.get("/recordings/status", authenticate, async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await relayRecordingStatus());
  } catch (error) {
    next(error);
  }
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

// DELETE /api/broadcast/recordings/:relayId?name=<file> — free the space now.
// The relay owns the volume; this only proves the file is the host's first.
router.delete("/recordings/:relayId", authenticate, async (req, res, next) => {
  try {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    await deleteBroadcastRecording(
      actorOf(req),
      String(req.params.relayId || ""),
      name,
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// PUT /api/broadcast/recordings/:relayId/retention?name=<file> { hours } —
// keep one show past the default window, or 0 to put it back on the default.
router.put(
  "/recordings/:relayId/retention",
  authenticate,
  async (req, res, next) => {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const hours = (req.body ?? {}).hours;
      res.json(
        await setBroadcastRetention(
          actorOf(req),
          String(req.params.relayId || ""),
          name,
          hours,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/broadcast/recordings/:relayId/playback?name=<file> — a short-lived
// signed URL for a media element. Ownership is checked before minting.
router.post(
  "/recordings/:relayId/playback",
  authenticate,
  async (req, res, next) => {
    try {
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const playback = await issuePlaybackTicket(
        actorOf(req),
        String(req.params.relayId || ""),
        name,
      );
      res.set("Cache-Control", "private, no-store");
      res.json(playback);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/broadcast/recordings/:relayId/archive — a signed URL for the whole
// show as one file. Ownership is checked before minting, like playback.
router.post(
  "/recordings/:relayId/archive",
  authenticate,
  async (req, res, next) => {
    try {
      const archive = await issueArchiveTicket(
        actorOf(req),
        String(req.params.relayId || ""),
      );
      res.set("Cache-Control", "private, no-store");
      res.json(archive);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/broadcast/recordings/:relayId/archive?name=@archive&u=…&exp=…&sig=…
// Every segment of a show as one zip, streamed as the relay hands it over. A
// show longer than an hour is one download instead of one per hour, and this
// server holds no copy of it.
router.get(
  "/recordings/:relayId/archive",
  streamLimiter,
  async (req, res, next) => {
    // Opened before anything is fetched: giving up while the relay is still
    // being listed, or before the first segment arrives, cancels both.
    const download = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) download.abort();
    });
    try {
      const relayId = String(req.params.relayId || "");
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const allowed =
        name === ARCHIVE_TICKET_NAME &&
        playbackTicketFromQuery({
          userId: req.query.u,
          relayId,
          name,
          expiresAt: req.query.exp,
          signature: req.query.sig,
        });
      if (!allowed) {
        return res
          .status(403)
          .json({ error: "That download link is not valid." });
      }

      const archive = await recordingArchive(Number(req.query.u), relayId, {
        signal: download.signal,
      });
      // The first segment is opened before any header is written: a relay that
      // cannot hand over the first hour answers with an error, not an empty zip.
      const zip = await openArchiveStream(
        archive.entries.map((entry) => ({
          name: entry.name,
          modifiedAt: entry.modifiedAt,
          open: async () => Readable.fromWeb((await entry.open()) as never),
        })),
        { signal: download.signal },
      );
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      zip.on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      // Nobody is waiting for this response any more: the abort already said
      // everything the caller needed.
      if (download.signal.aborted) return;
      next(error);
    }
  },
);

// GET /api/broadcast/recordings/:relayId/stream?name=…&u=…&exp=…&sig=…
// Unauthenticated by design: the ticket is the credential, and it names one
// user, one session and one file. Byte ranges pass straight through so the
// player can seek without re-downloading the show.
router.get(
  "/recordings/:relayId/stream",
  streamLimiter,
  async (req, res, next) => {
    try {
      const relayId = String(req.params.relayId || "");
      const name = typeof req.query.name === "string" ? req.query.name : "";
      const allowed = playbackTicketFromQuery({
        userId: req.query.u,
        relayId,
        name,
        expiresAt: req.query.exp,
        signature: req.query.sig,
      });
      if (!allowed) {
        return res.status(403).json({ error: "That playback link is not valid." });
      }

      const range =
        typeof req.headers.range === "string" ? req.headers.range : undefined;
      const file = await openBroadcastRecording(
        Number(req.query.u),
        relayId,
        name,
        { range },
      );
      res.writeHead(file.status, {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Content-Length": file.bytes,
        ...(file.contentRange ? { "Content-Range": file.contentRange } : {}),
        "Cache-Control": "private, no-store",
      });
      Readable.fromWeb(file.body as never)
        .on("error", () => res.destroy())
        .pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

export default router;

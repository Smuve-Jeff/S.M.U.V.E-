import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import {
  LIVE_STREAM_PLATFORMS,
  LiveStreamPlatform,
  startLiveStream as issueStart,
  getCurrentLiveStream,
  endLiveStream,
  resolveViewerJoin,
  redeemViewerJoin,
} from "@/services/live-stream.service";
import type { AuthUser } from "@/types";

/**
 * Live-stream / Go-Live backend surface:
 *   POST   /api/users/:userId/live-streams         start a stream (auth)
 *   GET    /api/users/:userId/live-streams/current  fetch my last stream (auth)
 *   POST   /api/users/:userId/live-streams/end      end one OR all (auth, admin sweeps all)
 *   GET    /api/live-streams/join/:token            public preview
 *   POST   /api/live-streams/join/:token/redeem     redeem (records viewer join)
 *
 * The resolve + redeem routes are public: any logged-out viewer can
 * preview a stream and see what would happen if they tap-to-join. The
 * host's actual viewer list comes back via the socket after redeem.
 */
const router = Router();

const lookupActor = (req: any): AuthUser | null =>
  req.user && typeof req.user.userId !== "undefined"
    ? (req.user as AuthUser)
    : null;

const sanitizePlatform = (p: unknown): LiveStreamPlatform | null =>
  typeof p === "string" &&
  (LIVE_STREAM_PLATFORMS as readonly string[]).includes(p)
    ? (p as LiveStreamPlatform)
    : null;

// POST /api/users/:userId/live-streams
router.post(
  "/users/:userId/live-streams",
  authenticate,
  async (req, res, next) => {
    try {
      const actor = lookupActor(req);
      if (!actor) return res.status(401).json({ error: "auth required" });
      // Ownership check (admin bypasses so admin tools can start on behalf of test users).
      if (actor.role !== "admin" && String(actor.userId) !== req.params.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const platform = sanitizePlatform(req.body?.platform);
      if (!platform) {
        return res.status(400).json({
          error: `platform must be one of: ${LIVE_STREAM_PLATFORMS.join(", ")}`,
        });
      }
      const row = await issueStart({
        hostId: String(actor.userId),
        hostDisplayName:
          typeof req.body?.hostDisplayName === "string"
            ? req.body.hostDisplayName
            : undefined,
        platform,
        gameId:
          typeof req.body?.gameId === "string" ? req.body.gameId : undefined,
        lobbyId:
          typeof req.body?.lobbyId === "string" ? req.body.lobbyId : undefined,
        payload:
          req.body && typeof req.body.payload === "object" && req.body.payload !== null
            ? (req.body.payload as Record<string, unknown>)
            : null,
      });
      return res.status(201).json(row);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/users/:userId/live-streams/current
router.get(
  "/users/:userId/live-streams/current",
  authenticate,
  async (req, res, next) => {
    try {
      const actor = lookupActor(req);
      if (!actor) return res.status(401).json({ error: "auth required" });
      // Ownership: the caller can only fetch their own row (admin bypasses).
      if (actor.role !== "admin" && String(actor.userId) !== req.params.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const row = await getCurrentLiveStream(req.params.userId);
      return res.status(row ? 200 : 204).json(row);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/users/:userId/live-streams/end
//   body: { all?: boolean }  — admins can sweep ALL active streams.
router.post(
  "/users/:userId/live-streams/end",
  authenticate,
  async (req, res, next) => {
    try {
      const actor = lookupActor(req);
      if (!actor) return res.status(401).json({ error: "auth required" });
      if (actor.role !== "admin" && String(actor.userId) !== req.params.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const sweepAll = actor.role === "admin" && !!req.body?.all;
      const result = await endLiveStream(
        req.params.userId,
        actor.role === "admin"
      );
      return res.json(sweepAll ? { success: true, sweep: "all" } : result);
    } catch (err) {
      return next(err);
    }
  }
);

// GET /api/live-streams/join/:token  — public preview
router.get("/live-streams/join/:token", async (req, res, next) => {
  try {
    return res.json(await resolveViewerJoin(req.params.token));
  } catch (err) {
    return next(err);
  }
});

// POST /api/live-streams/join/:token/redeem  — public; soft-auth OK
router.post("/live-streams/join/:token/redeem", async (req, res, next) => {
  try {
    return res.json(await redeemViewerJoin(req.params.token));
  } catch (err) {
    return next(err);
  }
});

export default router;

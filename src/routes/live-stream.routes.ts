import { Router } from "express";
import { authenticate } from "@/middleware/auth";
import {
  LIVE_GO_LIVE_PLATFORMS,
  LiveStreamPlatform,
  startLiveStream as issueStart,
  getCurrentLiveStream,
  listActiveLiveStreams,
  endLiveStream,
  resolveViewerJoin,
  redeemViewerJoin,
  liveViewerKey,
} from "@/services/live-stream.service";
import { getIceConfig } from "@/services/turn.service";
import type { AuthUser } from "@/types";
import {
  announceFriendLiveEnded,
  announceFriendWentLive,
  emitLiveDirectoryChanged,
} from "@/socket";

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
  (LIVE_GO_LIVE_PLATFORMS as readonly string[]).includes(p)
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
      if (
        actor.role !== "admin" &&
        String(actor.userId) !== req.params.userId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
      const platform = sanitizePlatform(req.body?.platform);
      if (!platform) {
        return res.status(400).json({
          error: `platform must be one of: ${LIVE_GO_LIVE_PLATFORMS.join(", ")}`,
        });
      }
      // Admins act on behalf of the :userId in the path; everyone else is
      // already proven to be that user by the ownership check above.
      const hostId =
        actor.role === "admin" ? req.params.userId : String(actor.userId);
      const row = await issueStart({
        hostId,
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
          req.body &&
          typeof req.body.payload === "object" &&
          req.body.payload !== null
            ? (req.body.payload as Record<string, unknown>)
            : null,
      });
      // REST starts never hit the socket lifecycle handler, so announce the
      // directory change here; peers refetch without waiting for a poll.
      emitLiveDirectoryChanged("started");
      // REST starts skip the socket lifecycle handler, so the friends'
      // "went live" card is raised here too.
      void announceFriendWentLive(hostId, {
        shareToken: row.shareToken,
        platform: row.platform,
        gameId: row.gameId,
        hostDisplayName: row.hostDisplayName,
      });
      return res.status(201).json(row);
    } catch (err) {
      return next(err);
    }
  },
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
      if (
        actor.role !== "admin" &&
        String(actor.userId) !== req.params.userId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
      const row = await getCurrentLiveStream(req.params.userId);
      return res.status(row ? 200 : 204).json(row);
    } catch (err) {
      return next(err);
    }
  },
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
      if (
        actor.role !== "admin" &&
        String(actor.userId) !== req.params.userId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
      const sweepAll = actor.role === "admin" && !!req.body?.all;
      // `isAdmin` makes the service ignore hostId and end EVERY active row,
      // so it must only be set for an explicit sweep. Passing the admin role
      // here used to end every artist's stream when one was targeted.
      // Read the token before the row is deactivated: a friend holding this
      // broadcast's join card must not be left offering WATCH.
      const ending = await getCurrentLiveStream(req.params.userId).catch(
        () => null,
      );
      const result = await endLiveStream(req.params.userId, sweepAll);
      if (ending?.shareToken) {
        void announceFriendLiveEnded(req.params.userId, ending.shareToken);
      }
      emitLiveDirectoryChanged("ended");
      return res.json(sweepAll ? { success: true, sweep: "all" } : result);
    } catch (err) {
      return next(err);
    }
  },
);

// GET /api/live-streams/active — authenticated discovery directory.
// The share token is the same public token already embedded in share links,
// so an online friend who missed the live presence event can still join.
router.get("/live-streams/active", authenticate, async (req, res, next) => {
  try {
    const actor = lookupActor(req);
    if (!actor) return res.status(401).json({ error: "auth required" });
    const streams = await listActiveLiveStreams();
    res.set("Cache-Control", "private, no-store");
    return res.json(
      streams.filter((row) => String(row.hostId) !== String(actor.userId)),
    );
  } catch (err) {
    return next(err);
  }
});

// GET /api/live-streams/ice — ICE servers for the WebRTC broadcast.
// STUN is enough on most home networks; a relay is required when both peers
// sit behind symmetric NATs. Managed Cloudflare TURN credentials are minted
// server-side and cached; static TURN/STUN env remains the fallback. Requires
// a live share token so relay credentials are never minted for anonymous
// traffic; only the short-lived values ever reach the client.
router.get("/live-streams/ice", async (req, res, next) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(400).json({ error: "token is required" });
  try {
    // Minting relay credentials is not open to anonymous traffic: the caller
    // must hold a live stream token.
    await resolveViewerJoin(token);
    const { iceServers, turn } = await getIceConfig();
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ iceServers, turn });
  } catch (err) {
    return next(err);
  }
});

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
    // The route is public so a share-link guest can redeem. Key the telemetry
    // dedupe on the same per-viewer id the socket path uses; an IP address is
    // not a viewer and would merge everyone behind one NAT.
    const actor = lookupActor(req);
    const viewerKey = liveViewerKey(actor?.userId ?? null, req.body?.viewerId);
    return res.json(await redeemViewerJoin(req.params.token, viewerKey));
  } catch (err) {
    return next(err);
  }
});

export default router;

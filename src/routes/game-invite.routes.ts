import { Router } from "express";
import {
  InviteMode,
  ALLOWED_MODES,
  issueInvite,
  listMyInvites,
  resolveInvite,
  consumeInvite,
  revokeInvite,
} from "@/services/game-invite.service";
import { authenticate } from "@/middleware/auth";

/**
 * Shareable invite routes:
 *   POST   /api/games/:gameId/invites      issue a new invite (auth)
 *   GET    /api/games/invites/me           list my invites       (auth)
 *   DELETE /api/games/invites/:token       revoke                (auth, owner)
 *   GET    /api/games/invites/:token       peek the invite       (public)
 *   POST   /api/games/invites/:token/redeem consume (auth optional)
 *
 * The resolve + redeem GETs remain PUBLIC so anyone can open a share link
 * without an account; the server returns a preview card and the client
 * triggers login-on-action.
 */
const router = Router();

const sanitizeMode = (mode: unknown): InviteMode | null =>
  typeof mode === "string" &&
  (ALLOWED_MODES as readonly string[]).includes(mode)
    ? (mode as InviteMode)
    : null;

// POST /api/games/:gameId/invites
router.post(
  "/:gameId/invites",
  authenticate,
  async (req, res, next) => {
    try {
      const mode = sanitizeMode(req.body?.mode);
      if (!mode) {
        return res.status(400).json({
          error:
            "mode must be one of: online, offline, co-op, split-screen, challenge, quick-match",
        });
      }
      const created = await issueInvite({
        gameId: req.params.gameId,
        mode,
        createdById: String(req.user.userId),
        targetUserId:
          typeof req.body?.targetUserId === "string"
            ? req.body.targetUserId
            : null,
        payload:
          req.body && typeof req.body.payload === "object" && req.body.payload !== null
            ? (req.body.payload as Record<string, unknown>)
            : null,
        ttlSeconds:
          typeof req.body?.ttlSeconds === "number"
            ? req.body.ttlSeconds
            : undefined,
      });
      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  },
);

// GET /api/games/invites/me
router.get("/invites/me", authenticate, async (req, res, next) => {
  try {
    const rows = await listMyInvites(String(req.user.userId));
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/games/invites/:token — owner or admin
router.delete(
  "/invites/:token",
  authenticate,
  async (req, res, next) => {
    try {
      const result = await revokeInvite(
        req.params.token,
        String(req.user.userId),
        req.user.role === "admin",
      );
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },
);

// GET /api/games/invites/:token  — public preview (no auth)
router.get("/invites/:token", async (req, res, next) => {
  try {
    return res.json(await resolveInvite(req.params.token));
  } catch (err) {
    return next(err);
  }
});

// POST /api/games/invites/:token/redeem  — best-effort consume
// Returns 410 for expired/revoked/used-restricted invites; 403 for
// restricted invites claimed by the wrong player.
router.post(
  "/invites/:token/redeem",
  authenticate, // optional auth — soft-auth: enforced only for restricted invites
  async (req, res, next) => {
    try {
      const actorId = req.user?.userId
        ? String(req.user.userId)
        : null;
      const result = await consumeInvite(req.params.token, actorId);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },
);

export default router;

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { parseIdParam } from "@/lib";
import { authenticate } from "@/middleware/auth";
import { emitChallengeResponse } from "@/socket";
import {
  addFriend,
  assertOwnershipOrAdmin,
  createChallenge,
  featuredUsers,
  listChallenges,
  listFriends,
  listMessageThread,
  listNotifications,
  markNotificationRead,
  removeFriend,
  respondToChallenge,
  respondToFriendRequest,
  searchUsers,
} from "@/services";
import type { AuthUser } from "@/types";

const router = Router();

router.use(authenticate);

// Middleware: every /:userId route requires ownership (or admin).
// Errors flow through the central error handler via next(err).
const own = (req: Request, res: Response, next: NextFunction): void => {
  try {
    assertOwnershipOrAdmin(req.user as AuthUser, req.params.userId);
    next();
  } catch (err) {
    next(err as Error);
  }
};

// GET /api/users/search?q=&location=
router.get("/search", async (req, res) => {
  res.json(
    await searchUsers({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      location:
        typeof req.query.location === "string" ? req.query.location : undefined,
    }),
  );
});

// GET /api/users/featured
router.get("/featured", async (_req, res) => {
  res.json(await featuredUsers());
});

// GET /api/users/:userId/messages/:friendId
router.get("/:userId/messages/:friendId", own, async (req, res) => {
  res.json(await listMessageThread(req.params.userId, req.params.friendId));
});

// GET /api/users/:userId/friends
router.get("/:userId/friends", own, async (req, res) => {
  res.json(await listFriends(req.params.userId));
});

// POST /api/users/:userId/friends/:friendId
router.post("/:userId/friends/:friendId", own, async (req, res) => {
  res.json(await addFriend(req.params.userId, req.params.friendId));
});

// PATCH /api/users/:userId/friends/:friendId — { status }
router.patch("/:userId/friends/:friendId", own, async (req, res) => {
  res.json(
    await respondToFriendRequest(
      req.params.userId,
      req.params.friendId,
      req.body?.status,
    ),
  );
});

// DELETE /api/users/:userId/friends/:friendId
router.delete("/:userId/friends/:friendId", own, async (req, res) => {
  res.json(await removeFriend(req.params.userId, req.params.friendId));
});

// GET /api/users/:userId/challenges?status=
router.get("/:userId/challenges", own, async (req, res) => {
  res.json(
    await listChallenges(
      req.params.userId,
      typeof req.query.status === "string" ? req.query.status : undefined,
    ),
  );
});

// POST /api/users/:userId/challenges — { toUserId, gameId, gameName }
router.post("/:userId/challenges", own, async (req, res) => {
  const created = await createChallenge(req.params.userId, undefined, {
    toUserId: req.body?.toUserId,
    gameId: req.body?.gameId,
    gameName: req.body?.gameName,
  });
  res.status(201).json(created);
});

// POST /api/users/:userId/challenges/:challengeId/respond — { status }
router.post(
  "/:userId/challenges/:challengeId/respond",
  own,
  async (req, res) => {
    const updated = await respondToChallenge(
      parseIdParam(req.params.challengeId, "challengeId"),
      req.body?.status,
      req.params.userId,
    );
    // Realtime: converge the challenger's + recipient's inboxes.
    try {
      emitChallengeResponse(updated);
    } catch (err) {
      console.error("Challenge response emit failed:", err);
    }
    res.json(updated);
  },
);

// GET /api/users/:userId/notifications?unreadOnly=
router.get("/:userId/notifications", own, async (req, res) => {
  res.json(
    await listNotifications(
      req.params.userId,
      req.query.unreadOnly === "true",
    ),
  );
});

// POST /api/users/:userId/notifications/:notifId/read
router.post(
  "/:userId/notifications/:notifId/read",
  own,
  async (req, res) => {
    res.json(
      await markNotificationRead(
        req.params.userId,
        parseIdParam(req.params.notifId, "notifId"),
      ),
    );
  },
);

export default router;

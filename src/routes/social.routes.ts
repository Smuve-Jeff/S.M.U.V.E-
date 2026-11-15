import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { parseIdParam } from "@/lib";
import { authenticate } from "@/middleware/auth";
import {
  emitChallengeCreated,
  emitChallengeResponse,
  emitFriendRequestReceived,
  emitFriendRequestResolved,
  emitFriendRequestsRead,
} from "@/socket";
import {
  addFriend,
  assertOwnershipOrAdmin,
  blockUser,
  clearFriendRequestNotifications,
  createChallenge,
  featuredUsers,
  listBlockedUsers,
  listChallenges,
  listFriends,
  listMessageThread,
  listNotifications,
  markFriendRequestNotificationsRead,
  markNotificationRead,
  persistNotification,
  removeFriend,
  respondToChallenge,
  respondToFriendRequest,
  searchUsers,
  unblockUser,
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

/**
 * A request that was accepted, declined, cancelled, or auto-accepted is no
 * longer actionable. Delete its notification rows and tell both connected
 * inboxes to drop them.
 */
const resolveFriendRequestNotifications = async (
  userId: string,
  friendId: string,
): Promise<void> => {
  try {
    await clearFriendRequestNotifications(userId, friendId);
    emitFriendRequestResolved(userId, friendId);
  } catch (err) {
    // The friendship transition is authoritative; cleanup can retry on reload.
    console.error("Friend request notification cleanup failed:", err);
  }
};

// GET /api/users/search?q=&location=
router.get("/search", async (req, res) => {
  res.json(
    await searchUsers({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      location:
        typeof req.query.location === "string" ? req.query.location : undefined,
      actorUserId: String((req.user as AuthUser).userId),
    }),
  );
});

// GET /api/users/featured
router.get("/featured", async (req, res) => {
  res.json(await featuredUsers(String((req.user as AuthUser).userId)));
});

// GET /api/users/:userId/messages/:friendId
router.get("/:userId/messages/:friendId", own, async (req, res) => {
  res.json(await listMessageThread(req.params.userId, req.params.friendId));
});

// GET /api/users/:userId/friends
router.get("/:userId/friends", own, async (req, res) => {
  const friends = await listFriends(req.params.userId);
  try {
    // Fetching the friends list is the point where incoming requests become
    // visible, so this is when their notifications stop being unread.
    const marked = await markFriendRequestNotificationsRead(req.params.userId);
    if (marked.updated > 0) {
      // Clear the unread dot on any inbox already loaded on this account.
      try {
        emitFriendRequestsRead(req.params.userId);
      } catch (err) {
        console.error("Friend request read emit failed:", err);
      }
    }
  } catch (err) {
    // A read-state failure must never hide the friends list.
    console.error("Friend request notification read failed:", err);
  }
  res.json(friends);
});

// GET /api/users/:userId/blocks
router.get("/:userId/blocks", own, async (req, res) => {
  res.json(await listBlockedUsers(req.params.userId));
});

// PUT /api/users/:userId/blocks/:blockedUserId — block a player
router.put("/:userId/blocks/:blockedUserId", own, async (req, res) => {
  res.json(await blockUser(req.params.userId, req.params.blockedUserId));
});

// DELETE /api/users/:userId/blocks/:blockedUserId — unblock a player
router.delete("/:userId/blocks/:blockedUserId", own, async (req, res) => {
  res.json(await unblockUser(req.params.userId, req.params.blockedUserId));
});

// POST /api/users/:userId/friends/:friendId
router.post("/:userId/friends/:friendId", own, async (req, res) => {
  const result = await addFriend(req.params.userId, req.params.friendId);
  if (result.requested) {
    // `requested` is false for duplicates and mutual-request auto-accepts, so
    // the recipient is only pinged when there is a genuinely new request.
    // Persist BEFORE emitting: the event makes the client fetch the friends
    // list, which marks these notifications read, so an unread row written
    // afterwards would stay unread despite the list having been seen.
    try {
      await persistNotification({
        userId: req.params.friendId,
        type: "friend_request",
        title: "New friend request",
        body: "A player wants to connect with you. Open NET to respond.",
        payload: { fromUserId: req.params.userId },
      });
    } catch (err) {
      // Persistence is best-effort; the request and live ping still matter.
      console.error("Friend request notification persist failed:", err);
    }
    try {
      emitFriendRequestReceived({
        toUserId: req.params.friendId,
        fromUserId: req.params.userId,
      });
    } catch (err) {
      // The request is already persisted; a realtime failure must not undo it.
      console.error("Friend request emit failed:", err);
    }
  } else if (result.accepted) {
    // Mutual requests auto-accept, so any request notifications are stale.
    await resolveFriendRequestNotifications(
      req.params.userId,
      req.params.friendId,
    );
  }
  res.json(result);
});

// PATCH /api/users/:userId/friends/:friendId — { status }
router.patch("/:userId/friends/:friendId", own, async (req, res) => {
  const updated = await respondToFriendRequest(
    req.params.userId,
    req.params.friendId,
    req.body?.status,
  );
  await resolveFriendRequestNotifications(
    req.params.userId,
    req.params.friendId,
  );
  res.json(updated);
});

// DELETE /api/users/:userId/friends/:friendId
router.delete("/:userId/friends/:friendId", own, async (req, res) => {
  const removed = await removeFriend(req.params.userId, req.params.friendId);
  // Covers cancelling an outgoing request and unfriending an accepted one.
  await resolveFriendRequestNotifications(
    req.params.userId,
    req.params.friendId,
  );
  res.json(removed);
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
    message: req.body?.message,
  });
  if (created.isNew) {
    try {
      await persistNotification({
        userId: created.toUserId,
        type: "challenge_incoming",
        title: "🎮 Game Challenge",
        body: `${created.fromUserName || req.params.userId} challenged you to ${created.gameName || created.gameId}`,
        payload: {
          challengeId: created.id,
          fromUserId: req.params.userId,
          gameId: created.gameId,
          gameTitle: created.gameName,
        },
      });
    } catch (err) {
      // Challenge persistence is authoritative; notification failure must not
      // hide the saved challenge or prevent realtime delivery.
      console.error("Challenge notification persist failed:", err);
    }
    try {
      emitChallengeCreated({
        ...created,
        fromUserId: req.params.userId,
      });
    } catch (err) {
      console.error("Challenge create emit failed:", err);
    }
  }
  res.status(created.isNew ? 201 : 200).json(created);
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
    await listNotifications(req.params.userId, req.query.unreadOnly === "true"),
  );
});

// POST /api/users/:userId/notifications/:notifId/read
router.post("/:userId/notifications/:notifId/read", own, async (req, res) => {
  res.json(
    await markNotificationRead(
      req.params.userId,
      parseIdParam(req.params.notifId, "notifId"),
    ),
  );
});

export default router;

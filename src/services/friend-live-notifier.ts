import { emitToUser, isUserOnline } from "@/socket";
import type { LiveStreamAnnouncement } from "@/socket";
import { listFriends, persistNotification } from "./social.service";

/**
 * Announce a new broadcast to the host's accepted friends.
 *
 * The live directory and presence badges already tell an online friend that
 * someone is broadcasting, but only if they happen to be looking at the NET
 * tab. This raises a join card on every friend's screen with the share token,
 * so watching is one tap from wherever they are.
 *
 * Pending requests are skipped: a friend request is not a broadcast invite.
 */
export const notifyFriendsWentLive = async (
  hostId: string,
  stream: LiveStreamAnnouncement,
): Promise<void> => {
  if (!stream?.shareToken) return;
  const friends = await listFriends(String(hostId));
  const payload = {
    hostId: String(hostId),
    hostDisplayName: stream.hostDisplayName ?? "A FRIEND",
    platform: stream.platform ?? "smuve",
    gameId: stream.gameId ?? null,
    shareToken: stream.shareToken,
    ts: Date.now(),
  };
  for (const friend of friends) {
    if (friend.status && friend.status !== "accepted") continue;
    if (!friend.userId) continue;
    const friendId = String(friend.userId);
    if (isUserOnline(friendId)) {
      emitToUser(friendId, "friend_went_live", payload);
      continue;
    }
    // Offline friends get the same card waiting in their notification inbox,
    // so a broadcast they missed is not lost the moment they close the tab.
    try {
      await persistNotification({
        userId: friendId,
        type: "friend_live",
        title: `${payload.hostDisplayName} IS LIVE`,
        body: `${payload.platform.toUpperCase()}${payload.gameId ? ` · ${payload.gameId}` : ""} — tap to watch`,
        payload,
      });
    } catch {
      /* the live directory still lists the broadcast */
    }
  }
};

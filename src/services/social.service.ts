import { AppDataSource } from "@/database/data-source";
import {
  UserProfile,
  Friend,
  DirectMessage,
  GameChallenge,
  Notification,
} from "@/entities";
import { AppError } from "@/lib";
import type { AuthUser } from "@/types";

const repo = () => ({
  profiles: AppDataSource.getRepository(UserProfile),
  friends: AppDataSource.getRepository(Friend),
  messages: AppDataSource.getRepository(DirectMessage),
  challenges: AppDataSource.getRepository(GameChallenge),
  notifications: AppDataSource.getRepository(Notification),
});

// ─── Profiles ────────────────────────────────────────────────────────────────

/** GET /api/profile/:userId — raw profile_data JSON (404 when absent). */
export const getProfile = async (userId: string): Promise<unknown> => {
  const row = await repo().profiles.findOneBy({ userId });
  if (!row) throw new AppError(404, "Profile not found");
  return row.profileData;
};

/** POST /api/profile — upsert { userId, profileData }. */
export const saveProfile = async (input: {
  userId: string;
  profileData: unknown;
}): Promise<{ success: boolean }> => {
  const existing = await repo().profiles.findOneBy({ userId: input.userId });
  if (existing) {
    existing.profileData = input.profileData as Record<string, unknown>;
    await repo().profiles.save(existing);
  } else {
    await repo().profiles.save(
      repo().profiles.create({
        userId: input.userId,
        profileData: input.profileData as Record<string, unknown>,
      }),
    );
  }
  return { success: true };
};

// ─── User search / featured ──────────────────────────────────────────────────

export interface OnlineUserRow {
  userId: string;
  artistName?: string;
  primaryGenre?: string;
  avatarImage?: string;
  location?: string;
  profileSetupCompleted?: boolean;
  online?: boolean;
}

const profileToOnlineUser = (
  p: UserProfile,
  extra: Partial<OnlineUserRow> = {},
): OnlineUserRow => {
  const d = (p.profileData ?? {}) as Record<string, unknown>;
  return {
    userId: p.userId,
    artistName: (d.artistName as string) || undefined,
    primaryGenre: (d.primaryGenre as string) || undefined,
    avatarImage: (d.avatarImage as string) || undefined,
    location: (d.location as string) || undefined,
    profileSetupCompleted: d.profileSetupCompleted === true,
    ...extra,
  };
};

/** GET /api/users/search?q=&location= */
export const searchUsers = async (opts: {
  q?: string;
  location?: string;
}): Promise<OnlineUserRow[]> => {
  const qb = repo().profiles.createQueryBuilder("p");
  if (opts.q && typeof opts.q === "string") {
    qb.andWhere(
      `(p.profile_data->>'artistName' ILIKE :q OR p.profile_data->>'primaryGenre' ILIKE :q)`,
      { q: `%${opts.q}%` },
    );
  }
  if (opts.location && typeof opts.location === "string") {
    qb.andWhere(`p.profile_data->>'location' ILIKE :loc`, {
      loc: `%${opts.location}%`,
    });
  }
  qb.orderBy(
    `(p.profile_data->>'eliteScore')::int`,
    "DESC",
    "NULLS LAST",
  ).take(20);
  const rows = await qb.getMany();
  return rows.map((r) => profileToOnlineUser(r));
};

/** GET /api/users/featured */
export const featuredUsers = async (): Promise<OnlineUserRow[]> => {
  const rows = await repo().profiles.createQueryBuilder("p")
    .where(`p.profile_data->>'profileSetupCompleted' = 'true'`)
    .andWhere(`p.profile_data->>'artistName' != 'Incognito'`)
    .orderBy("p.updated_at", "DESC")
    .take(10)
    .getMany();
  return rows.map((r) => profileToOnlineUser(r));
};

// ─── Friends ─────────────────────────────────────────────────────────────────

export interface FriendRow extends OnlineUserRow {
  status?: string;
}

/** GET /api/users/:userId/friends */
export const listFriends = async (userId: string): Promise<FriendRow[]> => {
  const qb = await AppDataSource.createQueryBuilder()
    .select([
      `u.user_id as "userId"`,
      `u.profile_data->>'artistName' as "artistName"`,
      `u.profile_data->>'primaryGenre' as "primaryGenre"`,
      `u.profile_data->>'avatarImage' as "avatarImage"`,
      `u.profile_data->>'location' as "location"`,
      `f.status as "status"`,
    ])
    .from("friends", "f")
    .innerJoin("user_profiles", "u", "f.friend_id = u.user_id")
    .where("f.user_id = :userId", { userId })
    .getRawMany();
  return qb.map((r) => ({
    userId: r.userId,
    artistName: r.artistName || undefined,
    primaryGenre: r.primaryGenre || undefined,
    avatarImage: r.avatarImage || undefined,
    location: r.location || undefined,
    status: r.status || undefined,
  }));
};

/** POST /api/users/:userId/friends/:friendId */
export const addFriend = async (
  userId: string,
  friendId: string,
): Promise<{ success: boolean }> => {
  if (userId === friendId) {
    throw new AppError(400, "Cannot friend yourself");
  }
  const existing = await repo().friends.findOneBy({ userId, friendId });
  if (!existing) {
    await repo().friends.save(
      repo().friends.create({ userId, friendId, status: "pending" }),
    );
  }
  return { success: true };
};

const FRIEND_STATUSES = ["pending", "accepted", "declined"] as const;

/** PATCH /api/users/:userId/friends/:friendId — { status } */
export const respondToFriendRequest = async (
  userId: string,
  friendId: string,
  status: string,
): Promise<{ success: boolean; message?: string }> => {
  if (!FRIEND_STATUSES.includes(status as (typeof FRIEND_STATUSES)[number])) {
    throw new AppError(
      400,
      "Invalid status. Must be pending, accepted, or declined.",
    );
  }

  if (status === "declined") {
    await AppDataSource.createQueryBuilder()
      .delete()
      .from("friends")
      .where(
        `(user_id = :a AND friend_id = :b) OR (user_id = :b AND friend_id = :a)`,
        { a: friendId, b: userId },
      )
      .execute();
    return { success: true, message: "Connection declined." };
  }

  await AppDataSource.createQueryBuilder()
    .update("friends")
    .set({ status })
    .where("user_id = :userId AND friend_id = :friendId", {
      userId: friendId,
      friendId: userId,
    })
    .execute();
  await AppDataSource.createQueryBuilder()
    .insert()
    .into("friends")
    .values({ user_id: userId, friend_id: friendId, status })
    .orUpdate(["status"], ["user_id", "friend_id"])
    .execute();
  return { success: true };
};

/** DELETE /api/users/:userId/friends/:friendId */
export const removeFriend = async (
  userId: string,
  friendId: string,
): Promise<{ success: boolean }> => {
  await AppDataSource.createQueryBuilder()
    .delete()
    .from("friends")
    .where(
      `(user_id = :a AND friend_id = :b) OR (user_id = :b AND friend_id = :a)`,
      { a: userId, b: friendId },
    )
    .execute();
  return { success: true };
};

// ─── Direct messages ─────────────────────────────────────────────────────────

/** GET /api/users/:userId/messages/:friendId — full 2-way thread. */
export const listMessageThread = async (
  userId: string,
  friendId: string,
): Promise<Array<Record<string, unknown>>> => {
  const qb = await AppDataSource.createQueryBuilder()
    .select([
      `m.from_user_id as "fromUserId"`,
      `m.to_user_id as "toUserId"`,
      `m.message as "message"`,
      `m.timestamp as "timestamp"`,
    ])
    .from("direct_messages", "m")
    .where(
      `(m.from_user_id = :a AND m.to_user_id = :b) OR (m.from_user_id = :b AND m.to_user_id = :a)`,
      { a: userId, b: friendId },
    )
    .orderBy("m.timestamp", "ASC")
    .limit(100)
    .getRawMany();
  return qb;
};

/** Insert a DM (socket + REST both route here). */
export const persistMessage = async (input: {
  fromUserId: string;
  toUserId: string;
  message: string;
}): Promise<DirectMessage> => {
  return repo().messages.save(repo().messages.create(input));
};

// ─── Challenges ──────────────────────────────────────────────────────────────

export interface ChallengeRow {
  id: number;
  fromUserId: string;
  fromUserName?: string | null;
  toUserId: string;
  gameId: string;
  gameName?: string | null;
  message?: string | null;
  status: string;
  timestamp: number;
}

const challengeToRow = (c: GameChallenge): ChallengeRow => ({
  id: c.id,
  fromUserId: c.fromUserId,
  fromUserName: c.fromUserName,
  toUserId: c.toUserId,
  gameId: c.gameId,
  gameName: c.gameTitle || c.gameId,
  message: c.message,
  status: c.status,
  timestamp: new Date(c.createdAt).getTime(),
});

const expireStaleChallenges = async (userId: string): Promise<void> => {
  await AppDataSource.createQueryBuilder()
    .update("game_challenges")
    .set({ status: "expired", updated_at: new Date() })
    .where(
      `status = 'pending' AND to_user_id = :userId AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
      { userId },
    )
    .execute();
};

/** GET /api/users/:userId/challenges?status= */
export const listChallenges = async (
  userId: string,
  status?: string,
): Promise<ChallengeRow[]> => {
  await expireStaleChallenges(userId);
  const qb = repo().challenges.createQueryBuilder("c")
    .where("(c.to_user_id = :userId OR c.from_user_id = :userId)", { userId })
    .orderBy("c.created_at", "DESC")
    .take(50);
  if (["pending", "accepted", "declined", "expired"].includes(status || "")) {
    qb.andWhere("c.status = :status", { status });
  }
  const rows = await qb.getMany();
  return rows.map(challengeToRow);
};

/** POST /api/users/:userId/challenges — { toUserId, gameId, gameName } */
export const createChallenge = async (
  fromUserId: string,
  fromUserName: string | undefined,
  input: { toUserId: string; gameId: string; gameName?: string },
): Promise<ChallengeRow> => {
  if (!input.toUserId || !input.gameId) {
    throw new AppError(400, "toUserId and gameId are required");
  }
  const gameTitle =
    typeof input.gameName === "string" && input.gameName.trim()
      ? input.gameName
      : input.gameId;
  const saved = await repo().challenges.save(
    repo().challenges.create({
      fromUserId,
      fromUserName: fromUserName || null,
      toUserId: input.toUserId,
      gameId: input.gameId,
      gameTitle,
      status: "pending",
    }),
  );
  return challengeToRow(saved);
};

/** POST /api/users/:userId/challenges/:challengeId/respond — { status } */
export const respondToChallenge = async (
  challengeId: number,
  status: string,
  userId?: string,
): Promise<ChallengeRow> => {
  if (!["accepted", "declined"].includes(status)) {
    throw new AppError(400, "status must be accepted or declined");
  }
  const challenge = await repo().challenges.findOneBy({ id: challengeId });
  if (!challenge) throw new AppError(404, "Challenge not found");
  // Only the challenge recipient may resolve it — anyone else gets a 403
  // even if they can name the challenge id.
  if (userId && challenge.toUserId !== userId) {
    throw new AppError(403, "Only the challenge recipient may respond");
  }
  challenge.status = status;
  challenge.respondedAt = new Date();
  await repo().challenges.save(challenge);
  return challengeToRow(challenge);
};

// ─── Notifications ───────────────────────────────────────────────────────────

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string;
  payload: unknown;
  read: boolean;
  timestamp: number;
}

const notificationToRow = (n: Notification): NotificationRow => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  payload: n.payload ?? {},
  read: n.isRead,
  timestamp: new Date(n.createdAt).getTime(),
});

/** GET /api/users/:userId/notifications?unreadOnly= */
export const listNotifications = async (
  userId: string,
  unreadOnly = false,
): Promise<NotificationRow[]> => {
  const rows = await repo().notifications.find({
    where: unreadOnly ? { userId, isRead: false } : { userId },
    order: { createdAt: "DESC" },
    take: 30,
  });
  return rows.map(notificationToRow);
};

/** POST /api/users/:userId/notifications/:notifId/read */
export const markNotificationRead = async (
  userId: string,
  notifId: number,
): Promise<{ success: boolean }> => {
  const result = await AppDataSource.createQueryBuilder()
    .update("notifications")
    .set({ is_read: true })
    .where("id = :id AND user_id = :userId", { id: notifId, userId })
    .execute();
  if (!result.affected) {
    throw new AppError(404, "Notification not found");
  }
  return { success: true };
};

/** Insert a notification row (used by socket + REST flows). */
export const persistNotification = async (input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: unknown;
}): Promise<NotificationRow> => {
  const saved = await repo().notifications.save(
    repo().notifications.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      isRead: false,
    }),
  );
  return notificationToRow(saved);
};

/** Assert the authenticated actor owns the route-scoped userId (or is admin). */
export const assertOwnershipOrAdmin = (
  actor: AuthUser,
  routeUserId: string,
): void => {
  if (actor.role === "admin") return;
  if (String(actor.userId) !== routeUserId) {
    throw new AppError(403, "Access denied. Strategic breach detected.");
  }
};

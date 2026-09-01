import { AppDataSource } from "@/database/data-source";
import {
  UserProfile,
  Friend,
  DirectMessage,
  GameChallenge,
  Notification,
  UserBlock,
  RoomMessage,
} from "@/entities";
import { AppError } from "@/lib";
import type { AuthUser } from "@/types";

const repo = () => ({
  profiles: AppDataSource.getRepository(UserProfile),
  friends: AppDataSource.getRepository(Friend),
  messages: AppDataSource.getRepository(DirectMessage),
  challenges: AppDataSource.getRepository(GameChallenge),
  notifications: AppDataSource.getRepository(Notification),
  blocks: AppDataSource.getRepository(UserBlock),
  roomMessages: AppDataSource.getRepository(RoomMessage),
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

// ─── Blocklist ───────────────────────────────────────────────────────────────
// Directional rows in `user_blocks`. Enforcement is MUTUAL: a block in either
// direction suppresses user-to-user delivery (DMs, challenges, voice signals,
// invites). A short-lived in-memory cache keeps socket hot-path lookups off
// the database; REST block/unblock invalidates it immediately.

const BLOCK_CACHE_TTL_MS = 30_000;
const blockCache = new Map<string, Set<string>>();
let blockCacheLoadedAt = 0;

/** Drop the in-memory block cache (called by block/unblock write paths). */
export const invalidateBlockCache = (): void => {
  blockCache.clear();
  blockCacheLoadedAt = 0;
};

/** Load all directional block rows into the cache (TTL-bounded). */
const loadBlockedPairs = async (): Promise<Map<string, Set<string>>> => {
  if (blockCacheLoadedAt && Date.now() - blockCacheLoadedAt < BLOCK_CACHE_TTL_MS) {
    return blockCache;
  }
  const rows = await AppDataSource.createQueryBuilder()
    .select([`b.user_id as "userId"`, `b.blocked_user_id as "blockedUserId"`])
    .from("user_blocks", "b")
    .getRawMany();
  blockCache.clear();
  for (const row of rows) {
    const set = blockCache.get(String(row.userId)) ?? new Set<string>();
    set.add(String(row.blockedUserId));
    blockCache.set(String(row.userId), set);
  }
  blockCacheLoadedAt = Date.now();
  return blockCache;
};

/** Does `userId` block `targetId`? (directional) */
export const isUserBlocked = async (
  userId: string,
  targetId: string,
): Promise<boolean> => {
  if (userId === targetId) return false;
  const cache = await loadBlockedPairs();
  return cache.get(userId)?.has(targetId) ?? false;
};

/** Mutual check: blocked in EITHER direction. */
export const isEitherBlocked = async (
  a: string,
  b: string,
): Promise<boolean> => {
  if (a === b) return false;
  const cache = await loadBlockedPairs();
  return (
    (cache.get(a)?.has(b) ?? false) || (cache.get(b)?.has(a) ?? false)
  );
};

/** PUT /api/users/:userId/blocks/:blockedUserId */
export const blockUser = async (
  userId: string,
  blockedUserId: string,
): Promise<{ success: boolean; blockedUserId: string }> => {
  if (userId === blockedUserId) {
    throw new AppError(400, "Cannot block yourself");
  }
  // Entity-property keys (not snake_case column names): TypeORM validates
  // raw insert values against the entity metadata, so column-name keys are
  // silently dropped and every column is emitted as DEFAULT (NOT NULL
  // violation). Property names map through the metadata to real columns.
  await repo().blocks
    .createQueryBuilder()
    .insert()
    .values({ userId, blockedUserId })
    .orIgnore()
    .execute();
  invalidateBlockCache();
  return { success: true, blockedUserId };
};

/** DELETE /api/users/:userId/blocks/:blockedUserId */
export const unblockUser = async (
  userId: string,
  blockedUserId: string,
): Promise<{ success: boolean; blockedUserId: string }> => {
  await AppDataSource.createQueryBuilder()
    .delete()
    .from("user_blocks")
    .where("user_id = :a AND blocked_user_id = :b", {
      a: userId,
      b: blockedUserId,
    })
    .execute();
  invalidateBlockCache();
  return { success: true, blockedUserId };
};

/** GET /api/users/:userId/blocks */
export const listBlockedUsers = async (
  userId: string,
): Promise<OnlineUserRow[]> => {
  const rows = await AppDataSource.createQueryBuilder()
    .select([
      `b.blocked_user_id as "userId"`,
      `u.profile_data->>'artistName' as "artistName"`,
      `u.profile_data->>'primaryGenre' as "primaryGenre"`,
      `u.profile_data->>'avatarImage' as "avatarImage"`,
      `u.profile_data->>'location' as "location"`,
    ])
    .from("user_blocks", "b")
    .innerJoin("user_profiles", "u", "b.blocked_user_id = u.user_id")
    .where("b.user_id = :userId", { userId })
    .orderBy("b.created_at", "DESC")
    .getRawMany();
  return rows.map((row) => ({
    userId: String(row.userId),
    artistName: row.artistName || undefined,
    primaryGenre: row.primaryGenre || undefined,
    avatarImage: row.avatarImage || undefined,
    location: row.location || undefined,
  }));
};

/** Strip users the actor has blocked from a discovery list. */
export const filterBlocked = async (
  userId: string,
  users: OnlineUserRow[],
): Promise<OnlineUserRow[]> => {
  const cache = await loadBlockedPairs();
  const myBlocks = cache.get(userId);
  if (!myBlocks || myBlocks.size === 0) return users;
  return users.filter((user) => !myBlocks.has(user.userId));
};

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
  actorUserId?: string;
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
  return filterBlocked(opts.actorUserId || "", rows.map((r) => profileToOnlineUser(r)));
};

/** GET /api/users/featured */
export const featuredUsers = async (
  actorUserId?: string,
): Promise<OnlineUserRow[]> => {
  const rows = await repo().profiles.createQueryBuilder("p")
    .where(`p.profile_data->>'profileSetupCompleted' = 'true'`)
    .andWhere(`p.profile_data->>'artistName' != 'Incognito'`)
    .orderBy("p.updated_at", "DESC")
    .take(10)
    .getMany();
  return filterBlocked(actorUserId || "", rows.map((r) => profileToOnlineUser(r)));
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
  return filterBlocked(
    userId,
    qb.map((r) => ({
      userId: r.userId,
      artistName: r.artistName || undefined,
      primaryGenre: r.primaryGenre || undefined,
      avatarImage: r.avatarImage || undefined,
      location: r.location || undefined,
      status: r.status || undefined,
    })),
  );
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
}

// Upsert the reverse row with ENTITY-PROPERTY keys (column-name keys would
// be dropped by TypeORM's metadata validation and inserted as DEFAULT).
const upsertFriend = async (params: {
  userId: string;
  friendId: string;
  status: string;
}): Promise<void> => {
  await AppDataSource.createQueryBuilder()
    .insert()
    .into("friends")
    .values({
      userId: params.userId,
      friendId: params.friendId,
      status: params.status,
    })
    // Insert values map via entity PROPERTY names; orUpdate arrays are
    // emitted verbatim, so they must be DATABASE column names.
    .orUpdate(["status"], ["user_id", "friend_id"])
    .execute();
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
  await upsertFriend({ userId, friendId, status });
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
    // Property keys — TypeORM throws on column-name keys (e.g. updated_at)
    // for entity-backed updates.
    .set({ status: "expired", updatedAt: new Date() })
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

/**
 * POST /api/users/:userId/challenges — { toUserId, gameId, gameName }
 *
 * Dedupe: a player may hold at most ONE pending challenge against a given
 * opponent for a given game. App-level check returns the existing record;
 * the partial unique index (migration 1786243200005) is the hard guard
 * against concurrent double-submits (socket + REST racing).
 */
export const createChallenge = async (
  fromUserId: string,
  fromUserName: string | undefined,
  input: { toUserId: string; gameId: string; gameName?: string },
): Promise<ChallengeRow> => {
  if (!input.toUserId || !input.gameId) {
    throw new AppError(400, "toUserId and gameId are required");
  }
  if (fromUserId === input.toUserId) {
    throw new AppError(400, "Cannot challenge yourself");
  }
  // Mutual blocklist: either direction blocks challenge delivery.
  if (await isEitherBlocked(fromUserId, input.toUserId)) {
    throw new AppError(403, "Cannot challenge a blocked user");
  }
  const gameTitle =
    typeof input.gameName === "string" && input.gameName.trim()
      ? input.gameName
      : input.gameId;
  const existing = await repo().challenges.createQueryBuilder("c")
    .where(
      `c.from_user_id = :from AND c.to_user_id = :to AND c.game_id = :game AND c.status = 'pending'`,
      { from: fromUserId, to: input.toUserId, game: input.gameId },
    )
    .getOne();
  if (existing) return challengeToRow(existing);
  try {
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
  } catch (err) {
    // Unique-violation race (socket + REST fired concurrently): return the
    // row the other writer won with instead of surfacing a 500.
    const winner = await repo().challenges.createQueryBuilder("c")
      .where(
        `c.from_user_id = :from AND c.to_user_id = :to AND c.game_id = :game AND c.status = 'pending'`,
        { from: fromUserId, to: input.toUserId, game: input.gameId },
      )
      .getOne();
    if (winner) return challengeToRow(winner);
    throw err;
  }
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

// ─── Room chat (persisted) ──────────────────────────────────────────────────

export interface RoomMessageRow {
  id: number;
  roomId: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

const roomMessageToRow = (m: RoomMessage): RoomMessageRow => ({
  id: m.id,
  roomId: m.roomId,
  userId: m.userId,
  userName: m.userName ?? m.userId,
  message: m.message,
  timestamp: new Date(m.createdAt).getTime(),
});

/** Persist a room-chat message (socket handler routes here). */
export const persistRoomMessage = async (input: {
  roomId: string;
  userId: string;
  userName?: string;
  message: string;
}): Promise<RoomMessageRow> => {
  const saved = await repo().roomMessages.save(
    repo().roomMessages.create({
      roomId: input.roomId,
      userId: input.userId,
      userName: input.userName ?? null,
      message: input.message,
    }),
  );
  return roomMessageToRow(saved);
};

/** Recent room history, oldest-first (cap 200). */
export const listRoomMessages = async (
  roomId: string,
  limit = 50,
): Promise<RoomMessageRow[]> => {
  const capped = Math.min(Math.max(Math.trunc(limit) || 50, 1), 200);
  const rows = await repo().roomMessages.find({
    where: { roomId },
    order: { createdAt: "DESC" },
    take: capped,
  });
  return rows.reverse().map(roomMessageToRow);
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
    // Property key (isRead) — see note in expireStaleChallenges.
    .set({ isRead: true })
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

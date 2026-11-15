import { AppDataSource } from "@/database/data-source";

jest.mock("@/entities", () => ({
  UserProfile: class UserProfile {},
  Friend: class Friend {},
  DirectMessage: class DirectMessage {},
  GameChallenge: class GameChallenge {},
  Notification: class Notification {},
  UserBlock: class UserBlock {},
  RoomMessage: class RoomMessage {},
}));

const mockRootQb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([]),
  getMany: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  orIgnore: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(),
    createQueryBuilder: jest.fn(() => mockRootQb),
  },
}));

const makeRepo = () => ({
  findOneBy: jest.fn(),
  find: jest.fn(),
  create: jest.fn((v: unknown) => v),
  save: jest.fn((v: unknown) => Promise.resolve(v)),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
    // Write paths (insert/update) used by blockUser / upsertFriend.
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: [], affected: 1 }),
  })),
});

const repos = {
  profiles: makeRepo(),
  friends: makeRepo(),
  messages: makeRepo(),
  challenges: makeRepo(),
  notifications: makeRepo(),
  blocks: makeRepo(),
  roomMessages: makeRepo(),
};
(AppDataSource.getRepository as jest.Mock).mockImplementation(
  (entity: unknown) => {
    const name = (entity as { name: string }).name;
    const map: Record<string, keyof typeof repos> = {
      UserProfile: "profiles",
      Friend: "friends",
      DirectMessage: "messages",
      GameChallenge: "challenges",
      Notification: "notifications",
      UserBlock: "blocks",
      RoomMessage: "roomMessages",
    };
    return repos[map[name] ?? "notifications"];
  },
);

import {
  addFriend,
  assertOwnershipOrAdmin,
  blockUser,
  clearFriendRequestNotifications,
  createChallenge,
  filterBlocked,
  getProfile,
  invalidateBlockCache,
  isEitherBlocked,
  isUserBlocked,
  listBlockedUsers,
  listChallenges,
  listFriends,
  respondToChallenge,
  listNotifications,
  listRoomMessages,
  markFriendRequestNotificationsRead,
  markNotificationRead,
  respondToFriendRequest,
  persistRoomMessage,
  saveProfile,
  searchUsers,
  unblockUser,
} from "./social.service";

/** Mock the block-cache loader rows returned by the shared query-builder chain. */
const setBlockRows = (
  rows: Array<{ userId: string; blockedUserId: string }>,
) => {
  (AppDataSource.createQueryBuilder as jest.Mock).mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  } as never);
};

describe("profile service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads a raw profile blob", async () => {
    repos.profiles.findOneBy.mockResolvedValue({
      profileData: { artistName: "Jeff" },
    });
    await expect(getProfile("user-1")).resolves.toEqual({ artistName: "Jeff" });
  });

  it("repairs a stale owner stamp so the row owner can still edit it", async () => {
    repos.profiles.findOneBy.mockResolvedValue({
      profileData: { id: "user-2", artistName: "Jeff" },
    });

    await expect(getProfile("user-1")).resolves.toEqual({
      id: "user-1",
      artistName: "Jeff",
    });
    // Repairing happens in the response, not a write on read.
    expect(repos.profiles.save).not.toHaveBeenCalled();
  });

  it("leaves a matching or missing stamp untouched", async () => {
    repos.profiles.findOneBy.mockResolvedValueOnce({
      profileData: { id: "user-1", artistName: "Jeff" },
    });
    await expect(getProfile("user-1")).resolves.toEqual({
      id: "user-1",
      artistName: "Jeff",
    });

    repos.profiles.findOneBy.mockResolvedValueOnce({
      profileData: { artistName: "No Stamp" },
    });
    await expect(getProfile("user-1")).resolves.toEqual({ artistName: "No Stamp" });
  });

  it("throws 404 when the profile is missing", async () => {
    repos.profiles.findOneBy.mockResolvedValue(null);
    await expect(getProfile("nope")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("upserts a profile", async () => {
    repos.profiles.findOneBy.mockResolvedValue(null);
    await saveProfile({ userId: "u1", profileData: { artistName: "X" } });
    expect(repos.profiles.save).toHaveBeenCalled();
  });
});

describe("challenge service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateBlockCache();
  });

  it("creates a challenge with the resolved game title", async () => {
    repos.challenges.save.mockResolvedValue({
      id: 1,
      fromUserId: "u1",
      fromUserName: "Jeff",
      toUserId: "u2",
      gameId: "pacman",
      gameTitle: "PAC-MAN",
      message: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      respondedAt: null,
    });
    const record = await createChallenge("u1", "Jeff", {
      toUserId: "u2",
      gameId: "pacman",
      gameName: "PAC-MAN",
    });
    expect(record.gameName).toBe("PAC-MAN");
    expect(record.timestamp).toBeGreaterThan(0);
  });

  it("normalizes challenge ids and trims the stored message/title", async () => {
    repos.challenges.save.mockImplementation(async (value: any) => ({
      ...value,
      id: 55,
      createdAt: new Date(),
    }));
    const record = await createChallenge("u1", "Jeff", {
      toUserId: " u2 ",
      gameId: " pacman ",
      gameName: " PAC-MAN ",
      message: "  ready?  ",
    });
    expect(record.toUserId).toBe("u2");
    expect(record.gameId).toBe("pacman");
    expect(repos.challenges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: "u2",
        gameId: "pacman",
        gameTitle: "PAC-MAN",
        message: "ready?",
      }),
    );
  });

  it("rejects challenges without a target", async () => {
    await expect(
      createChallenge("u1", "Jeff", { toUserId: "", gameId: "pacman" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects oversized challenge fields before database access", async () => {
    await expect(
      createChallenge("u1", "Jeff", {
        toUserId: "u2",
        gameId: "g".repeat(256),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      createChallenge("u1", "Jeff", {
        toUserId: "u2",
        gameId: "pacman",
        message: "x".repeat(2001),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repos.challenges.save).not.toHaveBeenCalled();
  });

  it("rejects self-challenges", async () => {
    await expect(
      createChallenge("u1", "Jeff", { toUserId: "u1", gameId: "pacman" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("expires stale challenges with the updatedAt property key", async () => {
    // Regression guard: TypeORM 1.x throws on column-name keys in
    // update().set() (Property "updated_at" not found) → GET /challenges 500.
    await listChallenges("u1");
    expect(mockRootQb.update).toHaveBeenCalledWith("game_challenges");
    expect(mockRootQb.set).toHaveBeenCalledWith({
      status: "expired",
      updatedAt: expect.any(Date),
    });
  });

  it("returns the existing pending challenge instead of double-writing", async () => {
    const existing = {
      id: 9,
      fromUserId: "u1",
      fromUserName: "Jeff",
      toUserId: "u2",
      gameId: "pacman",
      gameTitle: "PAC-MAN",
      message: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      respondedAt: null,
    };
    (repos.challenges.createQueryBuilder as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(existing),
    });
    const record = await createChallenge("u1", "Jeff", {
      toUserId: "u2",
      gameId: "pacman",
      gameName: "PAC-MAN",
    });
    expect(record.id).toBe(9);
    expect(repos.challenges.save).not.toHaveBeenCalled();
  });

  it("recovers the winner row when a unique-violation race loses", async () => {
    repos.challenges.save.mockRejectedValueOnce(new Error("duplicate key"));
    const winner = {
      id: 12,
      fromUserId: "u1",
      fromUserName: "Jeff",
      toUserId: "u2",
      gameId: "pacman",
      gameTitle: "PAC-MAN",
      message: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
      respondedAt: null,
    };
    (repos.challenges.createQueryBuilder as jest.Mock).mockReturnValue({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(winner),
    });
    const record = await createChallenge("u1", "Jeff", {
      toUserId: "u2",
      gameId: "pacman",
      gameName: "PAC-MAN",
    });
    expect(record.id).toBe(12);
  });

  it("rejects an already resolved challenge and does not save it again", async () => {
    repos.challenges.findOneBy.mockResolvedValue({
      id: 41,
      fromUserId: "u2",
      toUserId: "u1",
      gameId: "pacman",
      status: "declined",
      createdAt: new Date(),
    });
    await expect(
      respondToChallenge(41, "accepted", "u1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repos.challenges.save).not.toHaveBeenCalled();
  });

  it("updates a pending challenge with a conditional atomic write", async () => {
    const challenge = {
      id: 42,
      fromUserId: "u2",
      toUserId: "u1",
      gameId: "pacman",
      status: "pending",
      createdAt: new Date(),
    };
    repos.challenges.findOneBy.mockResolvedValue(challenge);
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    (repos.challenges.createQueryBuilder as jest.Mock).mockReturnValue(builder);
    const record = await respondToChallenge(42, "accepted", "u1");
    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        respondedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(builder.where).toHaveBeenCalledWith(
      "id = :challengeId AND to_user_id = :userId AND status = 'pending'",
      { challengeId: 42, userId: "u1" },
    );
    expect(record.status).toBe("accepted");
    expect(repos.challenges.save).not.toHaveBeenCalled();
  });

  it("rejects challenges against a blocked player (mutual)", async () => {
    setBlockRows([{ userId: "u2", blockedUserId: "u1" }]);
    await expect(
      createChallenge("u1", "Jeff", { toUserId: "u2", gameId: "pacman" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns conflict if an atomic response loses a concurrent race", async () => {
    const pending = {
      id: 43,
      fromUserId: "u2",
      toUserId: "u1",
      gameId: "pacman",
      status: "pending",
      createdAt: new Date(),
    };
    repos.challenges.findOneBy
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ...pending, status: "declined" });
    const builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    (repos.challenges.createQueryBuilder as jest.Mock).mockReturnValue(builder);
    await expect(
      respondToChallenge(43, "accepted", "u1"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects a response when a block was placed after the challenge", async () => {
    // Challenge exists (u2 challenged u1), but u2 blocked u1 AFTER sending —
    // the accept must not be able to drag both sides into a shared lobby.
    repos.challenges.findOneBy.mockResolvedValue({
      id: 42,
      fromUserId: "u2",
      toUserId: "u1",
      gameId: "pacman",
    });
    setBlockRows([{ userId: "u2", blockedUserId: "u1" }]);
    await expect(
      respondToChallenge(42, "accepted", "u1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.challenges.save).not.toHaveBeenCalled();
  });
});

describe("blocklist service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateBlockCache();
  });

  it("rejects self-blocking", async () => {
    await expect(blockUser("u1", "u1")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("inserts the block row with ENTITY-PROPERTY keys", async () => {
    // Regression guard: TypeORM 1.x silently drops column-name keys in
    // insert().values() (emitting DEFAULT → NOT NULL violation, HTTP 500).
    // The query builder must receive { userId, blockedUserId }.
    const builder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    (repos.blocks.createQueryBuilder as jest.Mock).mockReturnValue(builder);
    await blockUser("u1", "u2");
    expect(repos.blocks.createQueryBuilder).toHaveBeenCalled();
    expect(builder.values).toHaveBeenCalledWith({
      userId: "u1",
      blockedUserId: "u2",
    });
    expect(builder.orIgnore).toHaveBeenCalled();
    expect(builder.execute).toHaveBeenCalled();
  });

  it("clears pending requests and their notifications when blocking", async () => {
    const builder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    (repos.blocks.createQueryBuilder as jest.Mock).mockReturnValue(builder);

    await blockUser("u1", "u2");

    expect(mockRootQb.delete).toHaveBeenCalledTimes(2);
    expect(mockRootQb.from).toHaveBeenCalledWith("friends");
    expect(mockRootQb.where).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      { userId: "u1", blockedUserId: "u2" },
    );
    expect(mockRootQb.from).toHaveBeenCalledWith("notifications");
    expect(mockRootQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("payload->>'fromUserId'"),
      { userId: "u1", otherUserId: "u2" },
    );
  });

  it("deletes a block row on unblock", async () => {
    await expect(unblockUser("u1", "u2")).resolves.toMatchObject({
      success: true,
      blockedUserId: "u2",
    });
  });

  it("maps blocked rows to online-user shape", async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: "u2",
          artistName: "Rival",
          primaryGenre: "Hip Hop",
          avatarImage: null,
          location: null,
          fallbackName: null,
        },
      ]),
    };
    (AppDataSource.createQueryBuilder as jest.Mock).mockReturnValueOnce(
      builder as never,
    );
    const rows = await listBlockedUsers("u1");
    expect(rows).toEqual([
      { userId: "u2", artistName: "Rival", primaryGenre: "Hip Hop" },
    ]);
    // Regression guard (prod bug): the list joined user_profiles with INNER
    // JOIN, so blocking a user with no saved profile produced a silent empty
    // list despite a successful PUT. Profiles must be LEFT JOINed and the
    // account name selected as a display fallback.
    expect(builder.leftJoin).toHaveBeenCalledWith(
      "user_profiles",
      "u",
      "b.blocked_user_id = u.user_id",
    );
    expect(builder.leftJoin).toHaveBeenCalledWith(
      "users",
      "usr",
      "b.blocked_user_id = usr.id::text",
    );
    expect(builder.innerJoin).not.toHaveBeenCalled();
  });

  it("keeps a block visible when the blocked user has no profile (fallback name)", async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: "u9",
          artistName: null,
          primaryGenre: null,
          avatarImage: null,
          location: null,
          fallbackName: "Cheap Spam Bot",
        },
      ]),
    };
    (AppDataSource.createQueryBuilder as jest.Mock).mockReturnValueOnce(
      builder as never,
    );
    const rows = await listBlockedUsers("u1");
    expect(rows[0]).toEqual({
      userId: "u9",
      artistName: "Cheap Spam Bot",
      primaryGenre: undefined,
      avatarImage: undefined,
      location: undefined,
    });
  });

  it("lists friends and incoming requests, keeping profile-less friends with a fallback name", async () => {
    const builder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: "u2",
          artistName: null,
          primaryGenre: null,
          avatarImage: null,
          location: null,
          fallbackName: "Friend No-Profile",
          status: "accepted",
        },
      ]),
    };
    const incomingBuilder = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: "u5",
          artistName: "Requester",
          primaryGenre: "Soul",
          avatarImage: null,
          location: null,
          fallbackName: null,
          status: "pending",
        },
      ]),
    };
    (AppDataSource.createQueryBuilder as jest.Mock)
      .mockReturnValueOnce(builder as never)
      .mockReturnValueOnce(incomingBuilder as never);
    setBlockRows([]); // block cache consulted by filterBlocked inside listFriends
    const rows = await listFriends("u1");
    expect(rows).toEqual([
      {
        userId: "u2",
        artistName: "Friend No-Profile",
        primaryGenre: undefined,
        avatarImage: undefined,
        location: undefined,
        status: "accepted",
      },
      {
        userId: "u5",
        artistName: "Requester",
        primaryGenre: "Soul",
        avatarImage: undefined,
        location: undefined,
        status: "pending",
        direction: "incoming",
      },
    ]);
    expect(builder.leftJoin).toHaveBeenCalledWith(
      "user_profiles",
      "u",
      "f.friend_id = u.user_id",
    );
    expect(incomingBuilder.leftJoin).toHaveBeenCalledWith(
      "user_profiles",
      "u",
      "f.user_id = u.user_id",
    );
    expect(builder.innerJoin).not.toHaveBeenCalled();
    // Regression guard: the id must come from the friends row / users fallback
    // (COALESCE), never from the profile join alone — profile-less friends
    // would otherwise surface with userId: null.
    expect(builder.select.mock.calls[0][0] as string[]).toContain(
      `COALESCE(u.user_id, usr.id::text) as "userId"`,
    );
  });

  it("isEitherBlocked resolves mutual direction", async () => {
    setBlockRows([{ userId: "u2", blockedUserId: "u1" }]);
    await expect(isEitherBlocked("u1", "u2")).resolves.toBe(true);
    await expect(isUserBlocked("u2", "u1")).resolves.toBe(true);
  });

  it("filterBlocked strips the actor's blocks from discovery", async () => {
    setBlockRows([{ userId: "u1", blockedUserId: "u2" }]);
    const result = await filterBlocked("u1", [
      { userId: "u2" },
      { userId: "u3" },
    ]);
    expect(result.map((u) => u.userId)).toEqual(["u3"]);
  });

  it("filterBlocked also hides users who blocked the actor", async () => {
    invalidateBlockCache();
    setBlockRows([{ userId: "u2", blockedUserId: "u1" }]);

    const result = await filterBlocked("u1", [
      { userId: "u2" },
      { userId: "u3" },
    ]);

    expect(result.map((u) => u.userId)).toEqual(["u3"]);
  });

  it("searchUsers excludes discovery opt-outs and protects hidden location details", async () => {
    const builder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      // The hidden-profile row is filtered by SQL; this mock only returns the
      // rows the query would yield, and the clause assertions below prove the
      // hidden filter is part of the query.
      getMany: jest.fn().mockResolvedValue([
        {
          userId: "u4",
          profileData: {
            artistName: "Kai",
            primaryGenre: "Soul",
            avatarImage: "avatar2",
            location: "Private city",
            eliteScore: 42,
            squadCount: 4,
            settings: { security: { shareProfileInDiscovery: true, hideSensitiveProfileDetails: true } },
          },
        },
      ]),
    };
    repos.profiles.createQueryBuilder = jest.fn(() => builder);

    const results = await searchUsers({ actorUserId: "u1", location: "Private" });

    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining("allowCollaboratorDiscovery"));
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining("shareProfileInDiscovery"));
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining("hideSensitiveProfileDetails"), { loc: "%Private%" });
    expect(results).toEqual([
      {
        userId: "u4",
        artistName: "Kai",
        primaryGenre: "Soul",
        avatarImage: "avatar2",
        location: undefined,
        eliteScore: 42,
        squadCount: 4,
        profileSetupCompleted: false,
      },
    ]);
  });

  it("searchUsers hides blocked users from results", async () => {
    setBlockRows([{ userId: "u1", blockedUserId: "u2" }]);
    repos.profiles.createQueryBuilder = jest.fn(() => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { userId: "u2", profileData: {} },
        { userId: "u3", profileData: {} },
      ]),
    }));
    const results = await searchUsers({ actorUserId: "u1" });
    expect(results.map((u) => u.userId)).toEqual(["u3"]);
  });
});

describe("friend request service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repos.friends.findOneBy.mockReset();
    // Block rows are cached globally for 30s; tests that assert the block
    // guard must not leak those rows into the next case.
    invalidateBlockCache();
  });

  it("creates a pending request owned by the sender", async () => {
    repos.friends.findOneBy
      .mockResolvedValueOnce(null) // caller has no row yet
      .mockResolvedValueOnce(null); // no reverse request

    const result = await addFriend("sender", "recipient");

    expect(result).toEqual({ success: true, requested: true });
    expect(repos.friends.create).toHaveBeenCalledWith({
      userId: "sender",
      friendId: "recipient",
      status: "pending",
    });
    expect(repos.friends.save).toHaveBeenCalledWith({
      userId: "sender",
      friendId: "recipient",
      status: "pending",
    });
  });

  it("accepts a request as its recipient and writes both friendship rows", async () => {
    const pending = {
      userId: "sender",
      friendId: "recipient",
      status: "pending",
    };
    repos.friends.findOneBy.mockResolvedValueOnce(pending);

    await respondToFriendRequest("recipient", "sender", "accepted");

    // The pending row is addressed TO the caller, not owned by them.
    expect(repos.friends.findOneBy).toHaveBeenCalledWith({
      userId: "sender",
      friendId: "recipient",
    });
    expect(pending.status).toBe("accepted");
    expect(repos.friends.save).toHaveBeenCalledWith(pending);
    // The recipient's own row is created so both sides list the friendship.
    expect(mockRootQb.values).toHaveBeenCalledWith({
      userId: "recipient",
      friendId: "sender",
      status: "accepted",
    });
  });

  it("rejects accepting your own outgoing request", async () => {
    // Only the sender's row exists; there is no request addressed to them.
    repos.friends.findOneBy.mockResolvedValueOnce(null);

    await expect(
      respondToFriendRequest("sender", "recipient", "accepted"),
    ).rejects.toThrow("No pending friend request");
    expect(repos.friends.save).not.toHaveBeenCalled();
  });

  it("declines by deleting both directions of the request", async () => {
    repos.friends.findOneBy.mockResolvedValueOnce({
      userId: "sender",
      friendId: "recipient",
      status: "pending",
    });

    await respondToFriendRequest("recipient", "sender", "declined");

    expect(mockRootQb.delete).toHaveBeenCalled();
    expect(mockRootQb.from).toHaveBeenCalledWith("friends");
    expect(mockRootQb.where).toHaveBeenCalledWith(
      expect.stringContaining("user_id = :a AND friend_id = :b"),
      { a: "sender", b: "recipient" },
    );
    expect(repos.friends.save).not.toHaveBeenCalled();
  });

  it("rejects a friend request when the sender blocked the recipient", async () => {
    invalidateBlockCache();
    setBlockRows([{ userId: "sender", blockedUserId: "recipient" }]);

    await expect(addFriend("sender", "recipient")).rejects.toThrow(
      "Cannot send a friend request to a blocked player",
    );
    expect(repos.friends.findOneBy).not.toHaveBeenCalled();
    expect(repos.friends.save).not.toHaveBeenCalled();
  });

  it("rejects a friend request when the recipient blocked the sender", async () => {
    invalidateBlockCache();
    setBlockRows([{ userId: "recipient", blockedUserId: "sender" }]);

    await expect(addFriend("sender", "recipient")).rejects.toThrow(
      "Cannot send a friend request to a blocked player",
    );
    expect(repos.friends.save).not.toHaveBeenCalled();
  });

  it("accepts automatically when both users request each other", async () => {
    const reverse = {
      userId: "recipient",
      friendId: "sender",
      status: "pending",
    };
    repos.friends.findOneBy
      .mockResolvedValueOnce(null) // caller has no row
      .mockResolvedValueOnce(reverse); // the other user already asked

    const result = await addFriend("sender", "recipient");

    expect(result).toEqual({ success: true, accepted: true });
    expect(reverse.status).toBe("accepted");
    expect(repos.friends.save).toHaveBeenCalledWith(reverse);
    expect(mockRootQb.values).toHaveBeenCalledWith({
      userId: "sender",
      friendId: "recipient",
      status: "accepted",
    });
  });
});

describe("room chat service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("persists a room message and maps the row", async () => {
    const saved = await persistRoomMessage({
      roomId: "lobby-1",
      userId: "u1",
      userName: "Jeff",
      message: "yo",
    });
    expect(saved.userName).toBe("Jeff");
    expect(saved.message).toBe("yo");
    expect(repos.roomMessages.save).toHaveBeenCalled();
  });

  it("lists history oldest-first with a cap", async () => {
    repos.roomMessages.find.mockResolvedValue([
      { id: 2, createdAt: new Date(2000), message: "b" },
      { id: 1, createdAt: new Date(1000), message: "a" },
    ]);
    const rows = await listRoomMessages("lobby-1", 50);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe("notification service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("filters unread only", async () => {
    repos.notifications.find.mockResolvedValue([]);
    await listNotifications("u1", true);
    expect(repos.notifications.find).toHaveBeenCalledWith({
      where: { userId: "u1", isRead: false },
      order: { createdAt: "DESC" },
      take: 30,
    });
  });

  it("marks unread friend-request notifications for the list owner", async () => {
    await expect(markFriendRequestNotificationsRead("u1")).resolves.toEqual({
      success: true,
      updated: 1,
    });

    expect(mockRootQb.update).toHaveBeenCalledWith("notifications");
    expect(mockRootQb.set).toHaveBeenCalledWith({ isRead: true });
    expect(mockRootQb.where).toHaveBeenCalledWith(
      expect.stringContaining("type = 'friend_request'"),
      { userId: "u1" },
    );
    expect(mockRootQb.where).toHaveBeenCalledWith(
      expect.stringContaining("is_read = false"),
      { userId: "u1" },
    );
  });

  it("clears friend-request notifications in both directions", async () => {
    await expect(
      clearFriendRequestNotifications("u1", "u2"),
    ).resolves.toEqual({ success: true });

    expect(mockRootQb.delete).toHaveBeenCalled();
    expect(mockRootQb.from).toHaveBeenCalledWith("notifications");
    expect(mockRootQb.where).toHaveBeenCalledWith("type = 'friend_request'");
    expect(mockRootQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("payload->>'fromUserId'"),
      { userId: "u1", otherUserId: "u2" },
    );
  });

  it("marks a notification read with the isRead property key", async () => {
    // Regression guard: column-name key (is_read) throws under TypeORM 1.x.
    mockRootQb.execute.mockResolvedValueOnce({ affected: 1 });
    await markNotificationRead("u1", 42);
    expect(mockRootQb.update).toHaveBeenCalledWith("notifications");
    expect(mockRootQb.set).toHaveBeenCalledWith({ isRead: true });
  });
});

describe("assertOwnershipOrAdmin", () => {
  it("allows the owner", () => {
    expect(() =>
      assertOwnershipOrAdmin({ userId: 5, role: "user" }, "5"),
    ).not.toThrow();
  });

  it("allows admins", () => {
    expect(() =>
      assertOwnershipOrAdmin({ userId: 1, role: "admin" }, "999"),
    ).not.toThrow();
  });

  it("rejects non-owners", () => {
    expect(() =>
      assertOwnershipOrAdmin({ userId: 5, role: "user" }, "6"),
    ).toThrow();
  });
});

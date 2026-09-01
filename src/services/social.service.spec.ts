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
  assertOwnershipOrAdmin,
  blockUser,
  createChallenge,
  filterBlocked,
  getProfile,
  invalidateBlockCache,
  isEitherBlocked,
  isUserBlocked,
  listBlockedUsers,
  listChallenges,
  listNotifications,
  listRoomMessages,
  markNotificationRead,
  persistRoomMessage,
  saveProfile,
  searchUsers,
  unblockUser,
} from "./social.service";

/** Mock the block-cache loader rows returned by the shared query-builder chain. */
const setBlockRows = (rows: Array<{ userId: string; blockedUserId: string }>) => {
  (AppDataSource.createQueryBuilder as jest.Mock).mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  } as never);
};

describe("profile service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads a raw profile blob", async () => {
    repos.profiles.findOneBy.mockResolvedValue({ profileData: { artistName: "Jeff" } });
    await expect(getProfile("user-1")).resolves.toEqual({ artistName: "Jeff" });
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

  it("rejects challenges without a target", async () => {
    await expect(
      createChallenge("u1", "Jeff", { toUserId: "", gameId: "pacman" }),
    ).rejects.toMatchObject({ statusCode: 400 });
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

  it("rejects challenges against a blocked player (mutual)", async () => {
    setBlockRows([{ userId: "u2", blockedUserId: "u1" }]);
    await expect(
      createChallenge("u1", "Jeff", { toUserId: "u2", gameId: "pacman" }),
    ).rejects.toMatchObject({ statusCode: 403 });
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
    expect(builder.values).toHaveBeenCalledWith({ userId: "u1", blockedUserId: "u2" });
    expect(builder.orIgnore).toHaveBeenCalled();
    expect(builder.execute).toHaveBeenCalled();
  });

  it("deletes a block row on unblock", async () => {
    await expect(unblockUser("u1", "u2")).resolves.toMatchObject({
      success: true,
      blockedUserId: "u2",
    });
  });

  it("maps blocked rows to online-user shape", async () => {
    (AppDataSource.createQueryBuilder as jest.Mock).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          userId: "u2",
          artistName: "Rival",
          primaryGenre: "Hip Hop",
          avatarImage: null,
          location: null,
        },
      ]),
    } as never);
    const rows = await listBlockedUsers("u1");
    expect(rows).toEqual([
      { userId: "u2", artistName: "Rival", primaryGenre: "Hip Hop" },
    ]);
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

import { AppDataSource } from "@/database/data-source";

jest.mock("@/entities", () => ({
  UserProfile: class UserProfile {},
  Friend: class Friend {},
  DirectMessage: class DirectMessage {},
  GameChallenge: class GameChallenge {},
  Notification: class Notification {},
}));

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
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
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
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
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
  })),
});

const repos = {
  profiles: makeRepo(),
  friends: makeRepo(),
  messages: makeRepo(),
  challenges: makeRepo(),
  notifications: makeRepo(),
};
(AppDataSource.getRepository as jest.Mock).mockImplementation(
  (entity: unknown) =>
    repos[
      (entity as { name: string }).name === "UserProfile"
        ? "profiles"
        : (entity as { name: string }).name === "Friend"
          ? "friends"
          : (entity as { name: string }).name === "DirectMessage"
            ? "messages"
            : (entity as { name: string }).name === "GameChallenge"
              ? "challenges"
              : "notifications"
    ],
);

import {
  assertOwnershipOrAdmin,
  createChallenge,
  getProfile,
  listChallenges,
  listNotifications,
  saveProfile,
} from "./social.service";

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
  beforeEach(() => jest.clearAllMocks());

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

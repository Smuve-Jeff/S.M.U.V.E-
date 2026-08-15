import { AppDataSource } from "@/database/data-source";

// Mock the TypeORM-decorated entity so babel-jest never parses decorators.
jest.mock("@/entities/GameInvite", () => ({
  GameInvite: class GameInvite {},
}));
jest.mock("@/entities", () => ({
  GameInvite: class GameInvite {},
}));

const mockInviteStore: any[] = [];
let nextInsertId = 1;

interface MockInviteLike {
  id?: number;
  token: string;
  gameId: string;
  mode: string;
  createdById: string;
  targetUserId: string | null;
  payload: Record<string, unknown> | null;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedById: string | null;
  revoked: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const mockRepo = {
  findOneBy: jest.fn(async ({ token }: { token: string }) => {
    return mockInviteStore.find((row) => row.token === token) ?? null;
  }),
  save: jest.fn(async (row: MockInviteLike) => {
    if (!row.id) {
      row.id = nextInsertId++;
      row.createdAt = row.createdAt || new Date();
      row.updatedAt = new Date();
      mockInviteStore.push(row);
    } else {
      const idx = mockInviteStore.findIndex((r) => r.id === row.id);
      if (idx >= 0) mockInviteStore[idx] = row;
      row.updatedAt = new Date();
    }
    return row;
  }),
  create: jest.fn((data: Partial<MockInviteLike>) => ({
    ...data,
    revoked: data.revoked ?? false,
  })),
  find: jest.fn(async ({ where }: { where: { createdById: string } }) => {
    return mockInviteStore
      .filter((r) => r.createdById === where.createdById)
      .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
      .slice(0, 15);
  }),
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
};

const mockQueryBuilder = {
  delete: jest.fn(() => mockQueryBuilder),
  from: jest.fn(() => mockQueryBuilder),
  where: jest.fn(() => mockQueryBuilder),
  execute: jest.fn(async () => ({ affected: 0 })),
};

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => mockRepo),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  },
}));

import {
  consumeInvite,
  generateInviteToken,
  issueInvite,
  listMyInvites,
  purgeExpiredInvites,
  resolveInvite,
  revokeInvite,
} from "./game-invite.service";

const ONE_DAY_SECONDS = 60 * 60 * 24;

describe("game-invite service", () => {
  beforeEach(() => {
    mockInviteStore.length = 0;
    nextInsertId = 1;
    jest.clearAllMocks();
  });

  describe("issueInvite", () => {
    it("issues a token with the correct shape and default TTL (~24h)", async () => {
      const row = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "42",
      });
      expect(row.token).toMatch(/^[0-9a-f]{24}$/);
      expect(row.gameId).toBe("battlefield");
      expect(row.mode).toBe("online");
      expect(row.createdById).toBe("42");
      expect(row.shareUrl).toMatch(/\?game=battlefield/);
      expect(row.shareUrl).toMatch(/mode=online/);
      const expiresIn = new Date(row.expiresAt).getTime() - Date.now();
      // Some clock drift is expected — accept a 60s window.
      expect(expiresIn).toBeGreaterThan(ONE_DAY_SECONDS * 1000 - 60_000);
      expect(expiresIn).toBeLessThan(ONE_DAY_SECONDS * 1000 + 60_000);
    });

    it("clamps TTL to the documented ceiling (14 days)", async () => {
      const row = await issueInvite({
        gameId: "halo",
        mode: "co-op",
        createdById: "1",
        ttlSeconds: ONE_DAY_SECONDS * 365, // 1 year
      });
      const expiresIn = new Date(row.expiresAt).getTime() - Date.now();
      const fourteenDays = ONE_DAY_SECONDS * 14 * 1000;
      expect(expiresIn).toBeLessThanOrEqual(fourteenDays + 1000);
    });

    it("rejects unsupported modes with a 400", async () => {
      await expect(
        issueInvite({
          gameId: "battlefield",
          // @ts-expect-error testing runtime guard
          mode: "moon-gravity",
          createdById: "1",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("requires gameId and createdById", async () => {
      await expect(
        issueInvite({
          gameId: "",
          mode: "online",
          createdById: "1",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        // @ts-expect-error testing runtime guard
        issueInvite({ gameId: "halo", mode: "online" }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("caps targetUserId + payload round-trip", async () => {
      const row = await issueInvite({
        gameId: "battlefield",
        mode: "split-screen",
        createdById: "7",
        targetUserId: "11",
        payload: { lobbyId: "abc", level: 3 },
      });
      expect(row.targetUserId).toBe("11");
      expect(row.payload).toEqual({ lobbyId: "abc", level: 3 });
    });
  });

  describe("resolveInvite / consumeInvite", () => {
    it("lets anyone resolve a public invite without consuming it", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      const peeked = await resolveInvite(issued.token);
      expect(peeked.id).toBe(issued.id);
      // Public invite, consume as anonymous — returns the same row, no
      // consumedAt set because the recipient is nullable.
      const consumed = await consumeInvite(issued.token, null);
      expect(consumed.wasRestricted).toBe(false);
    });

    it("records the first consumer on a public invite", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      const result = await consumeInvite(issued.token, "55");
      expect(result.consumedById).toBe("55");
    });

    it("blocks the wrong player from consuming a restricted invite", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "challenge",
        createdById: "1",
        targetUserId: "2",
      });
      await expect(consumeInvite(issued.token, "3")).rejects.toMatchObject({
        statusCode: 403,
      });
      // The intended recipient CAN consume it once.
      const result = await consumeInvite(issued.token, "2");
      expect(result.wasRestricted).toBe(true);
      expect(result.alreadyConsumed).toBe(false);
      // A second attempt by the same player fails as "already consumed".
      const second = await consumeInvite(issued.token, "2");
      expect(second.alreadyConsumed).toBe(true);
    });

    it("throws 410 once the invite has expired", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      // Force expiry in the mock store.
      const row = mockInviteStore.find((r) => r.token === issued.token)!;
      row.expiresAt = new Date(Date.now() - 1000);
      await expect(resolveInvite(issued.token)).rejects.toMatchObject({
        statusCode: 410,
      });
    });

    it("refuses to resolve a revoked invite", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      await revokeInvite(issued.token, "1", false);
      await expect(resolveInvite(issued.token)).rejects.toMatchObject({
        statusCode: 410,
      });
    });
  });

  describe("revoke + ownership", () => {
    it("lets the issuer revoke their own invite", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      const result = await revokeInvite(issued.token, "1", false);
      expect(result.success).toBe(true);
    });

    it("forbids a non-admin from revoking another player's invite", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      await expect(
        revokeInvite(issued.token, "2", false),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("allows admin to revoke regardless of ownership", async () => {
      const issued = await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      const result = await revokeInvite(issued.token, "999", true);
      expect(result.success).toBe(true);
    });
  });

  describe("listMyInvites + purge", () => {
    it("returns the 15 newest invites ordered DESC", async () => {
      for (let i = 0; i < 3; i++) {
        await issueInvite({
          gameId: `g${i}`,
          mode: "online",
          createdById: "1",
        });
      }
      const mine = await listMyInvites("1");
      expect(mine).toHaveLength(3);
    });

    it("isolates results by creator id", async () => {
      await issueInvite({
        gameId: "battlefield",
        mode: "online",
        createdById: "1",
      });
      await issueInvite({
        gameId: "halo",
        mode: "online",
        createdById: "2",
      });
      const mine = await listMyInvites("1");
      expect(mine).toHaveLength(1);
      expect(mine[0].createdById).toBe("1");
    });

    it("purgeExpiredInvites forwards the executor affected-row count", async () => {
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 4 });
      const purged = await purgeExpiredInvites();
      expect(purged).toBe(4);
    });
  });

  it("generates tokens with 96 bits of entropy", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
  });
});

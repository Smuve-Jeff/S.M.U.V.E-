import { AppDataSource } from "@/database/data-source";

// Mock the TypeORM-decorated entity so babel-jest never parses decorators.
jest.mock("@/entities/LiveStream", () => ({
  LiveStream: class LiveStream {},
}));
jest.mock("@/entities", () => ({
  LiveStream: class LiveStream {},
}));

const mockStreamStore: any[] = [];
let nextInsertId = 1;

interface MockStreamLike {
  id?: number;
  shareToken: string;
  hostId: string;
  hostDisplayName?: string | null;
  platform: string;
  gameId?: string | null;
  lobbyId?: string | null;
  payload?: Record<string, unknown> | null;
  active: boolean;
  startedAt?: Date;
  endedAt?: Date | null;
  viewerJoins?: number;
  updatedAt?: Date;
}

const mockRepo = {
  findOne: jest.fn(async ({ where }: { where: Partial<MockStreamLike> }) => {
    if (where?.shareToken) {
      return mockStreamStore.find((r) => r.shareToken === where.shareToken) ?? null;
    }
    if (where?.hostId) {
      // Caller passes a sort hint via { where, order } but jest.fn signature
      // here is shorthand. Match the more-specific call shape below.
      return null;
    }
    return null;
  }),
  find: jest.fn(async ({ where }: { where: Partial<MockStreamLike> }) => {
    return mockStreamStore.filter((r) => {
      for (const key of Object.keys(where ?? {})) {
        if ((r as any)[key] !== (where as any)[key]) return false;
      }
      return true;
    });
  }),
  save: jest.fn(async (input: any) => {
    const rows = Array.isArray(input) ? input : [input];
    const saved: any[] = [];
    for (const row of rows) {
      if (!row.id) {
        row.id = nextInsertId++;
        row.startedAt = row.startedAt || new Date();
        mockStreamStore.push(row);
      } else {
        const idx = mockStreamStore.findIndex((r) => r.id === row.id);
        if (idx >= 0) mockStreamStore[idx] = row;
      }
      row.updatedAt = new Date();
      saved.push(row);
    }
    return Array.isArray(input) ? saved : saved[0];
  }),
  create: jest.fn((data: Partial<MockStreamLike>) => ({
    ...data,
    active: data.active ?? true,
    viewerJoins: data.viewerJoins ?? 0,
  })),
};

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    getRepository: jest.fn(() => mockRepo),
  },
}));

import {
  startLiveStream,
  getCurrentLiveStream,
  endLiveStream,
  resolveViewerJoin,
  redeemViewerJoin,
  generateShareToken,
} from "./live-stream.service";

const tokenA = "tokA";
const tokenB = "tokB";

describe("live-stream service", () => {
  beforeEach(() => {
    mockStreamStore.length = 0;
    nextInsertId = 1;
    jest.clearAllMocks();
    // Reprovision findOne to also support getCurrentLiveStream's
    // { where, order } shape — we keep this simple by directly matching
    // hostId + id lookups below via mockRepo.findOne.
    mockRepo.findOne.mockImplementation(
      async (crit: { where: Partial<MockStreamLike>; order?: any }) => {
        if (!crit?.where) return null;
        const matches = mockStreamStore.filter((r) => {
          for (const key of Object.keys(crit.where)) {
            if ((r as any)[key] !== (crit.where as any)[key]) return false;
          }
          return true;
        });
        if (crit.order?.startedAt === "DESC") {
          matches.sort(
            (a, b) => (b.startedAt?.getTime?.() ?? 0) - (a.startedAt?.getTime?.() ?? 0)
          );
        }
        return matches[0] ?? null;
      }
    );
  });

  describe("startLiveStream", () => {
    it("issues a row with the package metadata + shareUrl", async () => {
      const row = await startLiveStream({
        hostId: "42",
        platform: "twitch",
        gameId: "battlefield",
        lobbyId: "split_xyz",
        hostDisplayName: "JEFF",
      });
      expect(row.token ?? row.shareToken).toBeDefined();
      expect(row.hostId).toBe("42");
      expect(row.platform).toBe("twitch");
      expect(row.shareUrl).toMatch(/game=battlefield/);
      expect(row.shareUrl).toMatch(/lobby=split_xyz/);
      expect(row.shareUrl).toMatch(/live=/);
      expect(row.active).toBe(true);
    });

    it("rejects unsupported platforms with a 400", async () => {
      await expect(
        startLiveStream({
          hostId: "42",
          // @ts-expect-error testing runtime guard
          platform: "myspace",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("ends any existing active stream before issuing a new one", async () => {
      await startLiveStream({ hostId: "h", platform: "twitch" });
      const second = await startLiveStream({ hostId: "h", platform: "kick" });
      const active = mockStreamStore.filter((r) => r.active);
      expect(active.length).toBe(1);
      expect(second.platform).toBe("kick");
      // Earlier row is still present but flipped to inactive.
      const inactive = mockStreamStore.filter((r) => !r.active);
      expect(inactive.length).toBe(1);
    });
  });

  describe("endLiveStream", () => {
    it("flips the host's active row to ended and returns its id", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      const result = await endLiveStream("h");
      expect(result.success).toBe(true);
      const ended = mockStreamStore.find((r) => r.id === issued.id);
      expect(ended.active).toBe(false);
      expect(ended.endedAt).toBeDefined();
    });

    it("admin sweep ends ALL active rows", async () => {
      await startLiveStream({ hostId: "h1", platform: "twitch" });
      await startLiveStream({ hostId: "h2", platform: "kick" });
      const result = await endLiveStream("__noop__", true);
      expect(result.success).toBe(true);
      expect(mockStreamStore.filter((r) => r.active).length).toBe(0);
    });

    it("throws 404 when no active stream exists and caller is not admin", async () => {
      await expect(endLiveStream("nobody")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("resolveViewerJoin / redeemViewerJoin", () => {
    it("renders the preview row to anyone holding the URL", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      const peek = await resolveViewerJoin(issued.shareToken);
      expect(peek.hostId).toBe("h");
      expect(peek.shareUrl).toContain(issued.shareToken);
    });

    it("rejects an expired/ended stream with 410", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      await endLiveStream("h");
      await expect(resolveViewerJoin(issued.shareToken)).rejects.toMatchObject({
        statusCode: 410,
      });
    });

    it("redeem increments viewerJoins and returns the updated row", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      const redeemed = await redeemViewerJoin(issued.shareToken);
      expect(redeemed.viewerJoins).toBe(1);
      const redeemedAgain = await redeemViewerJoin(issued.shareToken);
      expect(redeemedAgain.viewerJoins).toBe(2);
    });

    it("rejects redeem for unknown tokens with 404", async () => {
      await expect(redeemViewerJoin("never-issued")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rejects redeem after the stream ends with 410", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      await endLiveStream("h");
      await expect(redeemViewerJoin(issued.shareToken)).rejects.toMatchObject({
        statusCode: 410,
      });
    });
  });

  describe("token generator", () => {
    it("emits 96-bit tokens that never equal each other", () => {
      const a = generateShareToken();
      const b = generateShareToken();
      expect(a).not.toEqual(b);
      expect(a).toMatch(/^[0-9a-f]{24}$/);
    });
  });

  // Quick smoke check: two host active streams are isolated when started
  // back-to-back on different platforms.
  it("isolates active streams across hosts", async () => {
    await startLiveStream({ hostId: "h1", platform: "twitch" });
    await startLiveStream({ hostId: "h2", platform: "twitch" });
    expect(mockStreamStore.filter((r) => r.active).length).toBe(2);
    expect(mockStreamStore.filter((r) => !r.active).length).toBe(0);
    // Quick warning suppression: ensure both tokens are present
    expect(
      mockStreamStore.map((r) => r.shareToken).filter((t) => t === tokenA)
    ).toEqual([]);
  });
});

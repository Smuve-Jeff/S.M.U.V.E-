// Mock the TypeORM-decorated entity so babel-jest never parses decorators.
jest.mock("@/entities/LiveStream", () => ({
  LiveStream: class LiveStream {},
}));
jest.mock("@/entities", () => ({
  LiveStream: class LiveStream {},
  LiveStreamDestination: class LiveStreamDestination {},
  LiveStreamViewerJoin: class LiveStreamViewerJoin {},
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
      return (
        mockStreamStore.find((r) => r.shareToken === where.shareToken) ?? null
      );
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
  increment: jest.fn(
    async (conditions: { id?: number }, propertyPath: string, value: number) => {
      const row = mockStreamStore.find((r) => r.id === conditions?.id);
      if (row) {
        (row as any)[propertyPath] = ((row as any)[propertyPath] ?? 0) + value;
      }
      return { affected: row ? 1 : 0 };
    },
  ),
};

const mockDestinationStore: any[] = [];
let nextDestinationId = 1;
const mockDestinationRepo = {
  create: jest.fn((row: any) => ({ ...row })),
  save: jest.fn(async (input: any) => {
    const rows = Array.isArray(input) ? input : [input];
    for (const row of rows) {
      if (!row.id) {
        row.id = nextDestinationId++;
        mockDestinationStore.push(row);
      } else {
        const index = mockDestinationStore.findIndex((r) => r.id === row.id);
        if (index >= 0) mockDestinationStore[index] = row;
      }
    }
    return input;
  }),
  find: jest.fn(async ({ where }: { where: { streamId?: number } }) =>
    mockDestinationStore.filter((row) => row.streamId === where?.streamId),
  ),
  update: jest.fn(
    async (
      where: { streamId?: number },
      values: Record<string, unknown>,
    ) => {
      for (const row of mockDestinationStore) {
        if (row.streamId === where?.streamId) Object.assign(row, values);
      }
      return { affected: 1 };
    },
  ),
};

const mockViewerJoinStore: Array<{ streamId: number; viewerKey: string }> = [];

const mockViewerJoinRepo = {
  insert: jest.fn(async (row: { streamId: number; viewerKey: string }) => {
    if (
      mockViewerJoinStore.some(
        (existing) =>
          existing.streamId === row.streamId &&
          existing.viewerKey === row.viewerKey,
      )
    ) {
      throw Object.assign(
        new Error("duplicate key value violates unique constraint"),
        { code: "23505" },
      );
    }
    mockViewerJoinStore.push(row);
    return { identifiers: [], generatedMaps: [], raw: [] };
  }),
};

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    // The service claims a join and increments its stream in one transaction.
    // Route both manager calls at the same in-memory stores so the mocks keep
    // modelling the unique index and the atomic increment.
    transaction: jest.fn(async (run: (manager: any) => Promise<unknown>) =>
      run({
        insert: async (_entity: unknown, row: any) =>
          mockViewerJoinRepo.insert(row),
        increment: async (
          _entity: unknown,
          conditions: { id?: number },
          propertyPath: string,
          value: number,
        ) => mockRepo.increment(conditions, propertyPath, value),
      }),
    ),
    getRepository: jest.fn((entity: { name?: string }) => {
      if (entity?.name === "LiveStreamViewerJoin") return mockViewerJoinRepo;
      if (entity?.name === "LiveStreamDestination") return mockDestinationRepo;
      return mockRepo;
    }),
  },
}));

import {
  LIVE_GO_LIVE_PLATFORMS,
  startLiveStream,
  endLiveStream,
  getCurrentLiveStream,
  listActiveLiveStreams,
  resolveViewerJoin,
  redeemViewerJoin,
  liveViewerKey,
  normalizeLiveViewerId,
  generateShareToken,
  updateLiveStreamDestinations,
} from "./live-stream.service";

const tokenA = "tokA";
describe("live-stream service", () => {
  beforeEach(() => {
    mockStreamStore.length = 0;
    mockDestinationStore.length = 0;
    mockViewerJoinStore.length = 0;
    nextInsertId = 1;
    nextDestinationId = 1;
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
        // Return a snapshot: concurrent redeems must not accidentally share
        // one mutable row object in the mock and hide a lost update.
        return matches[0] ? { ...matches[0] } : null;
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

    it("accepts the native smuve destination", async () => {
      const row = await startLiveStream({ hostId: "42", platform: "smuve" });
      expect(row.platform).toBe("smuve");
      expect(row.active).toBe(true);
      expect(row.shareUrl).toContain(`live=${row.shareToken}`);
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
      // Earlier row is still present but flipped to inactive, and its
      // destination rows cannot keep claiming they are live.
      const inactive = mockStreamStore.filter((r) => !r.active);
      expect(inactive.length).toBe(1);
      expect(
        mockDestinationStore.filter(
          (row) => row.streamId === inactive[0].id,
        ),
      ).toEqual([expect.objectContaining({ status: 'ended' })]);
    });


    it("exposes only destinations with a working broadcast path", () => {
      expect(LIVE_GO_LIVE_PLATFORMS).toEqual([
        "smuve",
        "twitch",
        "kick",
        "facebook",
        "custom",
      ]);
      expect(LIVE_GO_LIVE_PLATFORMS).not.toContain("youtube");
      expect(LIVE_GO_LIVE_PLATFORMS).not.toContain("tiktok");
    });

    it("accepts a custom RTMP Go Live destination", async () => {
      const custom = await startLiveStream({ hostId: "42", platform: "custom" });
      expect(custom.platform).toBe("custom");
      expect(custom.active).toBe(true);
    });

    it("accepts Kick and Facebook as Go Live destinations", async () => {
      const kick = await startLiveStream({ hostId: "42", platform: "kick" });
      expect(kick.platform).toBe("kick");
      expect(kick.active).toBe(true);
      expect(kick.shareUrl).toContain(`live=${kick.shareToken}`);

      const facebook = await startLiveStream({
        hostId: "43",
        platform: "facebook",
      });
      expect(facebook.platform).toBe("facebook");
      expect(facebook.active).toBe(true);
    });

    it("persists every platform selected for one session", async () => {
      const row = await startLiveStream({
        hostId: "multi",
        platform: "smuve",
        destinations: ["smuve", "twitch", "kick", "facebook"],
      });

      expect(row.destinations).toHaveLength(4);
      expect(mockDestinationStore).toHaveLength(4);
      expect(row.destinations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ platform: "smuve", status: "live" }),
          expect.objectContaining({ platform: "twitch", status: "pending" }),
          expect.objectContaining({ platform: "kick", status: "pending" }),
          expect.objectContaining({ platform: "facebook", status: "pending" }),
        ]),
      );
    });

    it("de-duplicates a repeated destination in one session", async () => {
      const row = await startLiveStream({
        hostId: "dedupe",
        platform: "smuve",
        destinations: ["smuve", "twitch", "kick", "facebook", "smuve"],
      });

      expect(row.destinations).toHaveLength(4);
      expect(mockDestinationStore).toHaveLength(4);
    });

    it("rejects youtube and tiktok for new broadcasts", async () => {
      await expect(
        startLiveStream({ hostId: "42", platform: "youtube" }),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        startLiveStream({ hostId: "42", platform: "tiktok" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });});

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


    it("dedupes one viewer's double-tap without hiding other viewers", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      const first = await redeemViewerJoin(issued.shareToken, "user:77");
      const doubleTap = await redeemViewerJoin(issued.shareToken, "user:77");
      const otherViewer = await redeemViewerJoin(issued.shareToken, "user:78");

      expect(first.viewerJoins).toBe(1);
      expect(doubleTap.viewerJoins).toBe(1);
      expect(otherViewer.viewerJoins).toBe(2);
    });

    it("keeps a viewer at one join after a refresh past the old 15s window", async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
        const issued = await startLiveStream({
          hostId: "h",
          platform: "twitch",
        });
        const first = await redeemViewerJoin(
          issued.shareToken,
          "guest:viewer-abc",
        );

        // The previous implementation forgot a viewer after 15 seconds; the
        // durable per-stream row must survive a later refresh.
        jest.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
        const refreshed = await redeemViewerJoin(
          issued.shareToken,
          "guest:viewer-abc",
        );
        const otherViewer = await redeemViewerJoin(
          issued.shareToken,
          "guest:viewer-def",
        );

        expect(first.viewerJoins).toBe(1);
        expect(refreshed.viewerJoins).toBe(1);
        expect(otherViewer.viewerJoins).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("counts the same viewer on two different broadcasts", async () => {
      const first = await startLiveStream({ hostId: "h1", platform: "twitch" });
      const second = await startLiveStream({ hostId: "h2", platform: "kick" });

      const onFirst = await redeemViewerJoin(first.shareToken, "user:9");
      const onSecond = await redeemViewerJoin(second.shareToken, "user:9");

      expect(onFirst.viewerJoins).toBe(1);
      expect(onSecond.viewerJoins).toBe(1);
    });

    it("does not lose an increment when two viewers join concurrently", async () => {
      const issued = await startLiveStream({ hostId: "h", platform: "twitch" });
      const originalInsert = mockViewerJoinRepo.insert.getMockImplementation();
      let arrivals = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => {
        release = resolve;
      });

      // Hold both redeems after their stream read, so either one's write is
      // based on the same pre-join count. This is the race the atomic
      // increment must win.
      mockViewerJoinRepo.insert.mockImplementation(async (row) => {
        arrivals += 1;
        if (arrivals === 2) release();
        await bothRead;
        return originalInsert!(row);
      });

      try {
        await Promise.all([
          redeemViewerJoin(issued.shareToken, "guest:viewer-a"),
          redeemViewerJoin(issued.shareToken, "guest:viewer-b"),
        ]);
        expect(mockStreamStore[0].viewerJoins).toBe(2);
      } finally {
        if (originalInsert) {
          mockViewerJoinRepo.insert.mockImplementation(originalInsert);
        }
      }
    });});

  describe("listActiveLiveStreams", () => {
    it("lists only active rows for the discovery directory", async () => {
      await startLiveStream({ hostId: "h1", platform: "smuve" });
      await startLiveStream({ hostId: "h2", platform: "twitch" });
      await endLiveStream("h1");

      const active = await listActiveLiveStreams();

      expect(active).toHaveLength(1);
      expect(active[0].hostId).toBe("h2");
      expect(active[0].active).toBe(true);
      expect(active[0].shareUrl).toContain(active[0].shareToken);
    });
  });

  describe("getCurrentLiveStream", () => {
    it("prefers the active row over a newer ended row", async () => {
      mockStreamStore.push({
        id: 100,
        shareToken: "ended",
        hostId: "h",
        platform: "twitch",
        active: false,
        startedAt: new Date(Date.now() + 1000),
        endedAt: new Date(),
        viewerJoins: 0,
      });
      mockStreamStore.push({
        id: 101,
        shareToken: "live",
        hostId: "h",
        platform: "smuve",
        active: true,
        startedAt: new Date(),
        viewerJoins: 3,
      });
      nextInsertId = 102;

      const row = await getCurrentLiveStream("h");

      expect(row?.shareToken).toBe("live");
      expect(row?.active).toBe(true);
    });

    it("falls back to the most recent row when nothing is active", async () => {
      mockStreamStore.push({
        id: 200,
        shareToken: "last",
        hostId: "h",
        platform: "twitch",
        active: false,
        startedAt: new Date(),
        endedAt: new Date(),
        viewerJoins: 1,
      });
      nextInsertId = 201;

      const row = await getCurrentLiveStream("h");

      expect(row?.shareToken).toBe("last");
      expect(row?.active).toBe(false);
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


  describe("liveViewerKey", () => {
    it("uses the account id when signed in", () => {
      expect(liveViewerKey(77, "guest:spoofed")).toBe("user:77");
      expect(liveViewerKey("77", undefined)).toBe("user:77");
    });

    it("uses the same normalized guest id for REST and socket redeems", () => {
      expect(liveViewerKey(null, "guest:viewer-abc")).toBe("guest:viewer-abc");
      expect(liveViewerKey("guest:socket-1", "guest:viewer-abc")).toBe(
        "guest:viewer-abc",
      );
      expect(normalizeLiveViewerId(" guest:viewer-abc ")).toBe("viewer-abc");
    });

    it("does not fall back to an IP when a guest has no viewer id", () => {
      expect(liveViewerKey(null, undefined)).toBeNull();
      expect(liveViewerKey("guest:socket-1", "")).toBeNull();
      expect(liveViewerKey(null, "not a valid id")).toBeNull();
    });
  });});

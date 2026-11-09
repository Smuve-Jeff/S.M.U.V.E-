import {
  AI_IMAGE_QUOTA_LIMIT,
  AI_VIDEO_QUOTA_LIMIT,
  aiQuotaGuard,
  buildStatus,
  quotaWindowFor,
  quotaStatus,
  recordAiUsage,
} from "./ai-quota.service";

jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const findOneBy = jest.fn();
const query = jest.fn();

const mockedRepo = () => ({ findOneBy, query });

const { AppDataSource } = require("@/database/data-source");

beforeEach(() => {
  jest.clearAllMocks();
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockedRepo());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("quotaWindowFor", () => {
  it("pins a timestamp to the start of its 24-hour window", () => {
    const { windowStart, resetsAt } = quotaWindowFor(
      Date.UTC(2026, 10, 9, 15, 30),
    );
    expect(windowStart).toBe(Date.UTC(2026, 10, 9, 0, 0));
    expect(resetsAt).toBe(Date.UTC(2026, 10, 10, 0, 0));
  });

  it("rolls cleanly at the exact boundary", () => {
    const boundary = Date.UTC(2026, 10, 10, 0, 0);
    expect(quotaWindowFor(boundary - 1).windowStart).toBe(
      Date.UTC(2026, 10, 9, 0, 0),
    );
    expect(quotaWindowFor(boundary).windowStart).toBe(boundary);
  });
});

describe("buildStatus", () => {
  it("reports used, limits, remaining and the reset time", () => {
    const status = buildStatus({ image: 7, video: 3 }, Date.UTC(2026, 10, 9, 15));
    expect(status.image).toEqual({
      used: 7,
      limit: AI_IMAGE_QUOTA_LIMIT,
      remaining: AI_IMAGE_QUOTA_LIMIT - 7,
      resetsAt: new Date(Date.UTC(2026, 10, 10, 0, 0)).toISOString(),
    });
    expect(status.video.used).toBe(3);
  });

  it("never reports negative remaining and clamps the counts at zero", () => {
    const status = buildStatus({ image: -4, video: 999 }, Date.UTC(2026, 10, 9));
    expect(status.image).toEqual({
      used: 0,
      limit: AI_IMAGE_QUOTA_LIMIT,
      remaining: AI_IMAGE_QUOTA_LIMIT,
      resetsAt: expect.any(String),
    });
    expect(status.video.remaining).toBe(0);
  });
});

describe("quotaStatus", () => {
  it("starts fresh when no ledger row exists", async () => {
    findOneBy.mockResolvedValue(null);
    const status = await quotaStatus(42);
    expect(status.image.used).toBe(0);
    expect(status.video.used).toBe(0);
  });

  it("reads today's row and ignores yesterday's", async () => {
    findOneBy.mockResolvedValue({
      userId: 42,
      windowStart: new Date(quotaWindowFor(Date.now()).windowStart),
      imageCount: 5,
      videoCount: 2,
    });
    expect((await quotaStatus(42)).image.used).toBe(5);

    findOneBy.mockResolvedValue({
      userId: 42,
      windowStart: new Date(Date.UTC(2026, 0, 1)),
      imageCount: 5,
      videoCount: 2,
    });
    expect((await quotaStatus(42)).video.used).toBe(0);
  });

  it("fails open when the database is unreachable", async () => {
    findOneBy.mockRejectedValue(new Error("db down"));
    const status = await quotaStatus(42);
    expect(status.image.used).toBe(0);
  });
});

describe("recordAiUsage", () => {
  it("increments atomically through a single upsert", async () => {
    query.mockResolvedValue(undefined);
    await recordAiUsage(42, "video");

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT");
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([42, expect.any(Date), 0, 1]),
    );
  });

  it("records images against the image counter", async () => {
    query.mockResolvedValue(undefined);
    await recordAiUsage(42, "image");
    expect(query.mock.calls[0][1]).toEqual(
      expect.arrayContaining([42, expect.any(Date), 1, 0]),
    );
  });

  it("survives a ledger write failure", async () => {
    query.mockRejectedValue(new Error("db down"));
    await expect(recordAiUsage(42, "image")).resolves.toBeUndefined();
  });
});

describe("aiQuotaGuard", () => {
  const response = () => {
    const handlers: Record<string, Function> = {};
    return {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
      on(event: string, cb: Function) {
        handlers[event] = cb;
      },
      emit(event: string) {
        handlers[event]?.();
      },
    } as any;
  };

  it("refuses the call once the account's daily budget is spent", async () => {
    findOneBy.mockResolvedValue({
      userId: 42,
      windowStart: new Date(quotaWindowFor(Date.now()).windowStart),
      imageCount: AI_IMAGE_QUOTA_LIMIT,
      videoCount: 0,
    });
    const next = jest.fn();
    const res = response();

    await aiQuotaGuard("image")({ user: { userId: 42 } }, res, next);

    expect(res.statusCode).toBe(429);
    expect(res.body.quota.image.remaining).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets the call through and ledgers one unit on success", async () => {
    findOneBy.mockResolvedValue(null);
    query.mockResolvedValue(undefined);
    const next = jest.fn();
    const res = response();

    await aiQuotaGuard("video")({ user: { userId: 42 } }, res, next);

    expect(next).toHaveBeenCalled();
    res.emit("finish");
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("ledgers nothing when the call failed", async () => {
    findOneBy.mockResolvedValue(null);
    const next = jest.fn();
    const res = response();
    res.statusCode = 503;

    await aiQuotaGuard("video")({ user: { userId: 42 } }, res, next);
    res.emit("finish");
    await Promise.resolve();

    expect(query).not.toHaveBeenCalled();
  });

  it("never blocks unauthenticated plumbing", async () => {
    const next = jest.fn();
    await aiQuotaGuard("image")({ user: undefined }, response(), next);
    expect(next).toHaveBeenCalled();
    expect(findOneBy).not.toHaveBeenCalled();
  });
});

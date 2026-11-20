// Entity decorators are not needed for these service-level validation tests.
jest.mock("@/entities/StreamingAccount", () => ({
  StreamingAccount: class StreamingAccount {},
}));
jest.mock("@/entities/StreamingDestination", () => ({
  StreamingDestination: class StreamingDestination {},
}));

jest.mock("@/lib/secret-box", () => ({
  sealSecret: jest.fn((value: string) => `sealed:${value}`),
  openSecret: jest.fn((value: string) => value.replace(/^sealed:/, "")),
}));

jest.mock("@/services/streaming-oauth.service", () => ({
  accessTokenForAccount: jest.fn(),
}));

jest.mock("@/services/broadcast-recordings.service", () => ({
  markBroadcastSessionEnded: jest.fn(),
  rememberBroadcastSession: jest.fn(),
}));

jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock("@/config/env", () => ({
  MEDIA_RELAY_URL: "https://relay.test",
  MEDIA_RELAY_TOKEN: "relay-token",
  TWITCH_CLIENT_ID: "",
  TWITCH_RTMP_URL: "rtmp://live.twitch.tv/app",
}));

import { AppDataSource } from "@/database/data-source";
import {
  clearManualDestination,
  destinationOverview,
  saveManualDestination,
  splitFacebookIngestUrl,
  startIngestSession,
  stopIngestSession,
} from "./broadcast-ingest.service";

const mockRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(async (row: any) => row),
  create: jest.fn((row: any) => row),
  update: jest.fn(),
  delete: jest.fn(),
};

describe("Facebook live ingest URL", () => {
  it("splits the ingest URL into the base and the stream key", () => {
    expect(
      splitFacebookIngestUrl(
        "rtmps://live-api-s.facebook.com:443/rtmp/FB-1234567890-abcdef",
      ),
    ).toEqual({
      rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp",
      streamKey: "FB-1234567890-abcdef",
    });
  });

  it("refuses anything that is not a complete RTMP ingest URL", () => {
    expect(splitFacebookIngestUrl("https://graph.facebook.com/v27.0/x")).toBeNull();
    expect(splitFacebookIngestUrl("rtmps://live-api-s.facebook.com:443/rtmp")).toBeNull();
    expect(splitFacebookIngestUrl("rtmps://host/rtmp/")).toBeNull();
  });
});

describe("broadcast ingest manual destinations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
    mockRepo.findOne.mockResolvedValue(null);
  });

  it("stores a sealed Facebook destination", async () => {
    mockRepo.create.mockImplementation((row: any) => row);
    mockRepo.save.mockImplementation(async (row: any) => row);

    const result = await saveManualDestination("7", "facebook", {
      rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      streamKey: "FACEBOOK_KEY_123",
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        platform: "facebook",
        rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
        streamKey: "sealed:FACEBOOK_KEY_123",
      }),
    );
    expect(result).toMatchObject({
      platform: "facebook",
      ready: true,
      detail: expect.stringContaining("FACEBOOK"),
    });
  });

  it("updates a destination the host already saved", async () => {
    mockRepo.findOne.mockResolvedValue({ id: 12 });

    await saveManualDestination(7, "facebook", {
      rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      streamKey: "FACEBOOK_KEY_456",
    });

    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 12 },
      expect.objectContaining({
        platform: "facebook",
        streamKey: "sealed:FACEBOOK_KEY_456",
      }),
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("rejects a non-RTMP Facebook URL", async () => {
    await expect(
      saveManualDestination(7, "facebook", {
        rtmpUrl: "https://example.test/live",
        streamKey: "FACEBOOK_KEY_123",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("rejects a Facebook stream key with invalid characters", async () => {
    await expect(
      saveManualDestination(7, "facebook", {
        rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
        streamKey: "bad key!",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("does not accept a manual key for Twitch", async () => {
    await expect(
      saveManualDestination(7, "twitch", {
        rtmpUrl: "rtmps://live.twitch.tv/app",
        streamKey: "TWITCH_KEY_123",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("reports Facebook readiness from the saved destination", async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
      });

    const result = await destinationOverview(7);
    const facebook = result.platforms.find((row) => row.platform === "facebook");

    expect(facebook).toMatchObject({
      ready: true,
      detail: expect.stringContaining("FACEBOOK"),
    });
  });

  it("stores a labelled, sealed custom RTMP destination", async () => {
    mockRepo.create.mockImplementation((row: any) => row);
    mockRepo.save.mockImplementation(async (row: any) => row);

    const result = await saveManualDestination("7", "custom", {
      label: "TikTok",
      rtmpUrl: "rtmps://ingest.example.com/live",
      streamKey: "TIKTOK_KEY_123",
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        platform: "custom",
        label: "TikTok",
        rtmpUrl: "rtmps://ingest.example.com/live",
        streamKey: "sealed:TIKTOK_KEY_123",
      }),
    );
    expect(result).toMatchObject({
      platform: "custom",
      ready: true,
      label: "TikTok",
      detail: expect.stringContaining("TikTok"),
    });
  });

  it("stores a second labelled custom slot independently", async () => {
    mockRepo.create.mockImplementation((row: any) => row);
    mockRepo.save.mockImplementation(async (row: any) => row);

    const result = await saveManualDestination(7, "custom2", {
      label: "Instagram",
      rtmpUrl: "rtmps://instagram.example.com/live",
      streamKey: "INSTAGRAM_KEY_123",
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "custom2",
        label: "Instagram",
        streamKey: "sealed:INSTAGRAM_KEY_123",
      }),
    );
    expect(result).toMatchObject({
      platform: "custom2",
      label: "Instagram",
    });
  });

  it("rejects a custom destination without a label", async () => {
    await expect(
      saveManualDestination(7, "custom", {
        rtmpUrl: "rtmps://ingest.example.com/live",
        streamKey: "TIKTOK_KEY_123",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it("reports every saved custom slot in one overview", async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        label: "TikTok",
        rtmpUrl: "rtmps://tiktok.example.com/live",
      })
      .mockResolvedValueOnce({
        label: "Instagram",
        rtmpUrl: "rtmps://instagram.example.com/live",
      })
      .mockResolvedValueOnce({
        label: "X",
        rtmpUrl: "rtmps://x.example.com/live",
      })
      .mockResolvedValueOnce({
        label: "LinkedIn",
        rtmpUrl: "rtmps://linkedin.example.com/live",
      });

    const result = await destinationOverview(7);
    const custom = result.platforms.filter((row) =>
      String(row.platform).startsWith("custom"),
    );

    expect(custom).toEqual([
      expect.objectContaining({ platform: "custom", label: "TikTok", ready: true }),
      expect.objectContaining({ platform: "custom2", label: "Instagram", ready: true }),
      expect.objectContaining({ platform: "custom3", label: "X", ready: true }),
      expect.objectContaining({ platform: "custom4", label: "LinkedIn", ready: true }),
    ]);
  });

  it("reports a saved custom destination with its host label", async () => {
    mockRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        label: "Instagram",
        rtmpUrl: "rtmps://ingest.example.com/live",
      });

    const result = await destinationOverview(7);
    const custom = result.platforms.find((row) => row.platform === "custom");

    expect(custom).toMatchObject({
      ready: true,
      label: "Instagram",
      detail: expect.stringContaining("INSTAGRAM"),
    });
  });

  it("clears the Facebook destination by platform", async () => {
    await clearManualDestination(7, "facebook");

    expect(mockRepo.delete).toHaveBeenCalledWith({
      userId: 7,
      platform: "facebook",
    });
  });
});

describe("broadcast ingest multi-destination sessions", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
    mockRepo.findOne.mockImplementation(async ({ where }: any) => ({
      id: where.platform === "kick" ? 1 : 2,
      userId: 7,
      platform: where.platform,
      rtmpUrl:
        where.platform === "kick"
          ? "rtmps://kick.example:443/app"
          : "rtmps://facebook.example:443/rtmp",
      streamKey: `sealed:${where.platform.toUpperCase()}_KEY_123`,
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves every provider and opens one relay fan-out session", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "relay-1",
        whipUrl: "https://relay.test/relay-1/whip",
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await startIngestSession(7, ["kick", "facebook"]);

    expect(session).toMatchObject({
      platform: "kick",
      platforms: ["kick", "facebook"],
      relayId: "relay-1",
      whipUrl: "https://relay.test/relay-1/whip",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.destinations).toEqual([
      {
        rtmpUrl: "rtmps://kick.example:443/app",
        streamKey: "KICK_KEY_123",
      },
      {
        rtmpUrl: "rtmps://facebook.example:443/rtmp",
        streamKey: "FACEBOOK_KEY_123",
      },
    ]);
  });

  it("creates a Live Video on the linked Page and ends it on stop", async () => {
    mockRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.platform === "facebook"
        ? {
            id: 2,
            userId: 7,
            platform: "facebook",
            displayName: "S.M.U.V.E PAGE",
            pageId: "page-123",
            pageToken: "sealed:PAGE_TOKEN_123",
          }
        : null,
    );
    const fetchMock = jest.fn(async (input: unknown) => {
      const target = String(input);
      if (target.includes("/page-123/live_videos")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "video-9",
            secure_stream_url:
              "rtmps://live-api-s.facebook.com:443/rtmp/FB-1234567890-abc",
          }),
        };
      }
      if (target.includes("/video-9")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "relay-fb",
          whipUrl: "https://relay.test/relay-fb/whip",
        }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await startIngestSession(7, ["facebook"]);

    const relayCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "https://relay.test/sessions",
    )!;
    const body = JSON.parse(
      (relayCall[1] as RequestInit).body as string,
    );
    expect(body.destinations).toEqual([
      {
        rtmpUrl: "rtmps://live-api-s.facebook.com:443/rtmp",
        streamKey: "FB-1234567890-abc",
      },
    ]);

    await stopIngestSession(session.relayId);

    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes("/video-9")),
    ).toBe(true);
  });

  it("resolves a custom destination by its stored label", async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 3,
      userId: 7,
      platform: "custom",
      label: "X",
      rtmpUrl: "rtmps://ingest.example.com/live",
      streamKey: "sealed:CUSTOM_KEY_123",
    });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "relay-custom",
        whipUrl: "https://relay.test/relay-custom/whip",
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await startIngestSession(7, ["custom"]);

    expect(session).toMatchObject({
      platform: "custom",
      platforms: ["custom"],
      relayId: "relay-custom",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.destinations).toEqual([
      {
        rtmpUrl: "rtmps://ingest.example.com/live",
        streamKey: "CUSTOM_KEY_123",
      },
    ]);
  });

  it("fans out to all four labelled custom slots", async () => {
    mockRepo.findOne.mockImplementation(async ({ where }: any) => ({
      id: where.platform,
      userId: 7,
      platform: where.platform,
      label: where.platform,
      rtmpUrl: `rtmps://${where.platform}.example.com/live`,
      streamKey: `sealed:${where.platform.toUpperCase()}_KEY_123`,
    }));
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "relay-four",
        whipUrl: "https://relay.test/relay-four/whip",
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await startIngestSession(7, [
      "custom",
      "custom2",
      "custom3",
      "custom4",
    ]);

    expect(session.platforms).toEqual([
      "custom",
      "custom2",
      "custom3",
      "custom4",
    ]);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.destinations).toHaveLength(4);
    expect(body.destinations[3]).toEqual({
      rtmpUrl: "rtmps://custom4.example.com/live",
      streamKey: "CUSTOM4_KEY_123",
    });
  });

  it("rejects an empty provider set before calling the relay", async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(startIngestSession(7, [])).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

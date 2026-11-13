import { getIceConfig, getIceServers } from "./turn.service";

const originalFetch = global.fetch;

const jsonResponse = (body: unknown, status = 201) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const cloudflareBody = {
  iceServers: [
    {
      urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"],
    },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
      ],
      username: "ephemeral-user",
      credential: "ephemeral-pass",
    },
  ],
};

describe("getIceServers", () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = [
    "STUN_URLS",
    "TURN_URLS",
    "TURN_USERNAME",
    "TURN_CREDENTIAL",
    "CLOUDFLARE_TURN_KEY_ID",
    "CLOUDFLARE_TURN_API_TOKEN",
    "TURN_TTL_SECONDS",
  ];

  beforeEach(() => {
    envKeys.forEach((key) => {
      saved[key] = process.env[key];
      delete process.env[key];
    });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns public STUN when nothing else is configured", async () => {
    const servers = await getIceServers();
    expect(servers).toEqual([
      {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
      },
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("adds statically configured TURN credentials as a fallback", async () => {
    process.env.TURN_URLS =
      "turn:turn.example.com:3478, turns:turn.example.com:5349";
    process.env.TURN_USERNAME = "static-user";
    process.env.TURN_CREDENTIAL = "static-pass";

    const servers = await getIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({
      urls: ["turn:turn.example.com:3478", "turns:turn.example.com:5349"],
      username: "static-user",
      credential: "static-pass",
    });
  });

  it("reports no relay when only STUN is available", async () => {
    const config = await getIceConfig();
    expect(config.iceServers).toHaveLength(1);
    expect(config.turn).toEqual({
      configured: false,
      managed: false,
      available: false,
      source: "none",
    });
  });

  it("reports static TURN as the active relay source", async () => {
    process.env.TURN_URLS = "turn:turn.example.com:3478";
    process.env.TURN_USERNAME = "static-user";
    process.env.TURN_CREDENTIAL = "static-pass";
    const config = await getIceConfig();
    expect(config.turn).toEqual({
      configured: true,
      managed: false,
      available: true,
      source: "static",
    });
  });

  it("reports managed Cloudflare TURN as ready", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key-health";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-secret";
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(cloudflareBody));

    const config = await getIceConfig();
    expect(config.turn).toEqual({
      configured: true,
      managed: true,
      available: true,
      source: "cloudflare",
    });
  });

  it("requests Cloudflare credentials and caches them", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key-cache";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-secret";
    process.env.TURN_TTL_SECONDS = "7200";
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(cloudflareBody));

    const first = await getIceServers();
    const second = await getIceServers();

    expect(first).toEqual(cloudflareBody.iceServers);
    expect(second).toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      "https://rtc.live.cloudflare.com/v1/turn/keys/key-cache/credentials/generate-ice-servers",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer turn-secret");
    expect(JSON.parse(init.body)).toEqual({ ttl: 7200 });
  });

  it("clamps an oversized credential TTL", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key-clamp";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-secret";
    process.env.TURN_TTL_SECONDS = "9999999";
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(cloudflareBody));

    await getIceServers();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ ttl: 172800 });
  });

  it("falls back to STUN when Cloudflare rejects the key", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key-forbidden";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-secret";
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 403));
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const servers = await getIceServers();

    expect(servers).toEqual([
      {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[turn] managed TURN credentials unavailable:",
      "credential request failed (403)",
    );
  });

  it("serves the last good credentials if Cloudflare later fails", async () => {
    process.env.CLOUDFLARE_TURN_KEY_ID = "key-sticky";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "turn-secret";
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce(jsonResponse(cloudflareBody));
    const first = await getIceServers();

    // Force the cached entry to look expired, then fail the refresh.
    const later = Date.now() + 7_200_000;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(later);
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const second = await getIceServers();
    expect(second).toBe(first);
    nowSpy.mockRestore();
  });
});

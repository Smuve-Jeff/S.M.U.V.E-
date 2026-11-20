// TypeORM entities need the metadata polyfill before the service pulls in the
// data source; these tests only exercise the pure authorize-URL builder.
import "reflect-metadata";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";

// No connection is opened by these tests, and the entity registry is not needed
// to build a URL: mock the data source the same way the other server specs do.
jest.mock("@/database/data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

/**
 * The authorize URL is the one piece of the OAuth connector that can be proved
 * without a provider or a database: it must carry the exact callback, the right
 * scopes, and for Kick a PKCE pair whose challenge matches the verifier the
 * callback will send back.
 */
describe("streaming account authorize URLs", () => {
  const env = process.env;

  beforeAll(() => {
    process.env = {
      ...env,
      API_PUBLIC_URL: "https://api.smuve.example",
      JWT_SECRET: "test-secret-for-streaming-oauth",
      KICK_CLIENT_ID: "kick-id",
      KICK_CLIENT_SECRET: "kick-secret",
      FACEBOOK_CLIENT_ID: "meta-id",
      FACEBOOK_CLIENT_SECRET: "meta-secret",
    };
    jest.resetModules();
  });

  afterAll(() => {
    process.env = env;
    jest.resetModules();
  });

  const load = () => import("./streaming-oauth.service");

  it("mints a Kick authorize URL with the callback and a matching PKCE pair", async () => {
    const { createAuthorizeUrl } = await load();

    const url = new URL(createAuthorizeUrl(7, "kick"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://id.kick.com/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("kick-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.smuve.example/api/stream-accounts/kick/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "user:read channel:read streamkey:read",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    const challenge = url.searchParams.get("code_challenge") ?? "";
    const state = url.searchParams.get("state") ?? "";
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).not.toBe("");

    const claim = jwt.verify(state, "test-secret-for-streaming-oauth", {
      audience: "stream-account-oauth",
    }) as { uid?: string; platform?: string; verifier?: string };
    expect(claim.uid).toBe("7");
    expect(claim.platform).toBe("kick");
    expect(
      createHash("sha256").update(claim.verifier ?? "").digest("base64url"),
    ).toBe(challenge);
  });

  it("mints a Facebook authorize URL on the current Graph version", async () => {
    const { createAuthorizeUrl } = await load();

    const url = new URL(createAuthorizeUrl(9, "facebook"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.facebook.com/v27.0/dialog/oauth",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.smuve.example/api/stream-accounts/facebook/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "public_profile pages_show_list pages_read_engagement publish_video",
    );
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("state")).not.toBe("");
  });

  it("fills the Kick destination from the channel grant", async () => {
    const { createAuthorizeUrl, completeStreamingAuthorization } = await load();
    const state = new URL(createAuthorizeUrl(7, "kick")).searchParams.get(
      "state",
    )!;
    const repo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
      update: jest.fn(),
    };
    const { AppDataSource } = await import("@/database/data-source");
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(repo);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async (input: unknown) => {
      const target = String(input);
      if (target.includes("id.kick.com/oauth/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "kick-token",
            refresh_token: "kick-refresh",
            expires_in: 7200,
            scope: "user:read channel:read streamkey:read",
          }),
        };
      }
      if (target.includes("/public/v1/users")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ user_id: 42, name: "DJ KICK" }],
          }),
        };
      }
      if (target.includes("/public/v1/channels")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                stream: {
                  url: "rtmps://kick.example:443/app",
                  key: "KICK_KEY_1234",
                },
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected fetch ${target}`);
    }) as unknown as typeof fetch;

    try {
      const connection = await completeStreamingAuthorization(
        "kick",
        "code-1",
        state,
      );

      expect(connection.displayName).toBe("DJ KICK");
      const destination = repo.save.mock.calls
        .map(([row]) => row as Record<string, unknown>)
        .find((row) => row.platform === "kick" && typeof row.rtmpUrl === "string");
      expect(destination).toMatchObject({
        platform: "kick",
        label: "KICK",
        rtmpUrl: "rtmps://kick.example:443/app",
      });
      expect(destination?.streamKey).not.toBe("KICK_KEY_1234");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lists the Facebook Pages a linked account can publish to", async () => {
    const { listFacebookPages } = await load();
    const { sealSecret } = await import("@/lib/secret-box");
    const repo = {
      findOne: jest.fn(async () => ({
        id: 3,
        userId: 7,
        platform: "facebook",
        pageId: "page-b",
        displayName: "Page B",
        accessToken: sealSecret("user-token"),
        refreshToken: null,
        expiresAt: null,
      })),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const { AppDataSource } = await import("@/database/data-source");
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(repo);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "page-a", name: "Page A", access_token: "tok-a" },
          { id: "page-b", name: "Page B", access_token: "tok-b" },
        ],
      }),
    })) as unknown as typeof fetch;

    try {
      await expect(listFacebookPages(7)).resolves.toEqual([
        { id: "page-a", name: "Page A", selected: false },
        { id: "page-b", name: "Page B", selected: true },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("moves the Facebook grant to a Page it actually manages", async () => {
    const { selectFacebookPage } = await load();
    const { sealSecret, openSecret } = await import("@/lib/secret-box");
    const repo = {
      findOne: jest.fn(async () => ({
        id: 3,
        userId: 7,
        platform: "facebook",
        pageId: "page-b",
        displayName: "Page B",
        accessToken: sealSecret("user-token"),
        refreshToken: null,
        expiresAt: null,
      })),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const { AppDataSource } = await import("@/database/data-source");
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(repo);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "page-a", name: "Page A", access_token: "tok-a" },
          { id: "page-b", name: "Page B", access_token: "tok-b" },
        ],
      }),
    })) as unknown as typeof fetch;

    try {
      const pages = await selectFacebookPage(7, "page-a");

      expect(repo.update).toHaveBeenCalledWith(
        { id: 3 },
        expect.objectContaining({ pageId: "page-a", displayName: "Page A" }),
      );
      const values = repo.update.mock.calls[0][1] as { pageToken: string };
      expect(openSecret(values.pageToken)).toBe("tok-a");
      expect(pages.find((page) => page.selected)?.id).toBe("page-a");

      await expect(
        selectFacebookPage(7, "someone-elses-page"),
      ).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still refuses a platform with no OAuth implementation", async () => {
    const { createAuthorizeUrl } = await load();

    expect(() => createAuthorizeUrl(1, "tiktok")).toThrow(
      /not a supported streaming account/i,
    );
  });
});

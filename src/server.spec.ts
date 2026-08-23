import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createUnifiedApp } from "./server";

// The server jest project compiles with babel and no decorator support, so
// every TypeORM-backed service is replaced at its module boundary (literal
// paths only — babel-plugin-jest-hoist cannot hoist dynamic specifiers).
// Routing tests exercise the unified static/API split, not persistence.
jest.mock("@/services", () => ({
  // auth/user/profile/ai/upload/product/project/social/studio surfaces
  loginUser: jest.fn(),
  registerUser: jest.fn(),
  getUserById: jest.fn(),
  deleteUser: jest.fn(),
  listUsers: jest.fn(),
  updateUser: jest.fn(),
  getProfile: jest.fn(),
  saveProfile: jest.fn(),
  analyzePrompt: jest.fn(),
  uploadToStorage: jest.fn(),
  createProduct: jest.fn(),
  deleteProduct: jest.fn(),
  getProductById: jest.fn(),
  listProducts: jest.fn(),
  updateProduct: jest.fn(),
  createConnectorJob: jest.fn(),
  listConnectorJobs: jest.fn(),
  listProjects: jest.fn(),
  loadArtistIdentity: jest.fn(),
  loadProject: jest.fn(),
  saveArtistIdentity: jest.fn(),
  saveProject: jest.fn(),
  addFriend: jest.fn(),
  assertOwnershipOrAdmin: jest.fn(),
  createChallenge: jest.fn(async () => ({ id: 1, gameName: "GAME" })),
  featuredUsers: jest.fn(async () => []),
  listChallenges: jest.fn(async () => []),
  listFriends: jest.fn(async () => []),
  listMessageThread: jest.fn(async () => []),
  listNotifications: jest.fn(async () => []),
  markNotificationRead: jest.fn(async () => undefined),
  removeFriend: jest.fn(async () => undefined),
  respondToChallenge: jest.fn(async () => ({ id: 1 })),
  respondToFriendRequest: jest.fn(async () => undefined),
  searchUsers: jest.fn(async () => []),
  listRemixLineageForProject: jest.fn(async () => []),
  listSessionsForProject: jest.fn(async () => []),
  // socket handler surface (never invoked in routing tests)
  createStudioSession: jest.fn(async () => ({ id: "sess_1" })),
  upsertSessionMember: jest.fn(async () => undefined),
  hasStudioPermission: jest.fn(async () => true),
  persistMessage: jest.fn(async () => ({})),
  persistNotification: jest.fn(async () => ({})),
  activateSessionMember: jest.fn(async () => undefined),
  buildSessionSyncPayload: jest.fn(async () => ({})),
}));

jest.mock("@/services/studio-collab.service", () => ({
  getStudioMember: jest.fn(async () => ({ status: "active" })),
}));

jest.mock("@/services/game-invite.service", () => ({
  InviteMode: { Direct: "direct", Lobby: "lobby" },
  ALLOWED_MODES: ["direct", "lobby"],
  issueInvite: jest.fn(),
  listMyInvites: jest.fn(async () => []),
  resolveInvite: jest.fn(),
  consumeInvite: jest.fn(),
  revokeInvite: jest.fn(),
}));

jest.mock("@/services/live-stream.service", () => ({
  LiveStreamPlatform: { Twitch: "twitch", YouTube: "youtube" },
  startLiveStream: jest.fn(async () => ({ id: 1, shareToken: "tok_test" })),
  getCurrentLiveStream: jest.fn(async () => null),
  endLiveStream: jest.fn(async () => undefined),
  resolveViewerJoin: jest.fn(),
  redeemViewerJoin: jest.fn(),
}));

jest.mock("@/database/data-source", () => ({
  AppDataSource: {
    initialize: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
    query: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => {
      throw new Error("not used in routing tests");
    }),
  },
}));

/** Boot the unified app on an ephemeral port and return a base URL closer. */
async function listen(browserDir: string): Promise<[string, () => void]> {
  const app = createUnifiedApp({ browserDir });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  return [`http://127.0.0.1:${port}`, close];
}

/** Minimal compiled Angular output fixture (index.html + one asset). */
async function makeBrowserDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "smuve-browser-"));
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    "<!doctype html><html><body>SMUVE_SPA_SHELL</body></html>",
    "utf8"
  );
  await writeFile(path.join(dir, "main.js"), "console.log('bundle')", "utf8");
  await writeFile(path.join(dir, "assets", "favicon.png"), "png", "utf8");
  return dir;
}

describe("createUnifiedApp", () => {
  let base = "";
  let close = () => {};

  beforeAll(async () => {
    [base, close] = await listen(await makeBrowserDir());
  });

  afterAll(() => close());

  it("serves real static assets directly", async () => {
    const res = await fetch(`${base}/main.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("console.log('bundle')");
  });

  it("falls back to the SPA shell for client-side routes", async () => {
    for (const route of ["/", "/login", "/hub/nested/deep-link"]) {
      const res = await fetch(`${base}${route}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("SMUVE_SPA_SHELL");
      expect(res.headers.get("content-type")).toContain("text/html");
    }
  });

  it("never serves the SPA shell for /api paths — API keeps its JSON 404", async () => {
    for (const route of ["/api/does-not-exist", "/api"]) {
      const res = await fetch(`${base}${route}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = (await res.json()) as { error?: string };
      expect(body.error).toMatch(/Route not found/);
    }
  });

  it("routes known API endpoints to the Express app (health is DB-gated, not SPA)", async () => {
    const res = await fetch(`${base}/api/health`);
    // The test environment has no live database; what matters is that the
    // response comes from the API layer (JSON), not the static fallback.
    expect([200, 503]).toContain(res.status);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

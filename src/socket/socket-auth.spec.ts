import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import { setupSocketIO } from "./index";

// The socket server only touches the database inside handlers (presence sync,
// studio collab) — never during the connection/auth handshake — so a stub
// data-source is enough to exercise the real handshake flow.
jest.mock("@/database/data-source", () => {
  const chain = {
    select: jest.fn(() => chain),
    from: jest.fn(() => chain),
    innerJoin: jest.fn(() => chain),
    leftJoin: jest.fn(() => chain),
    where: jest.fn(() => chain),
    andWhere: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    take: jest.fn(() => chain),
    update: jest.fn(() => chain),
    set: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    into: jest.fn(() => chain),
    values: jest.fn(() => chain),
    orUpdate: jest.fn(() => chain),
    execute: jest.fn(async () => ({ affected: 1 })),
    getRawMany: jest.fn(async () => []),
    getMany: jest.fn(async () => []),
  };
  return { AppDataSource: { createQueryBuilder: jest.fn(() => chain) } };
});

jest.mock("@/services", () => ({
  createChallenge: jest.fn(async () => ({ id: 1, gameName: "GAME" })),
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

jest.mock("@/services/live-stream.service", () => ({
  startLiveStream: jest.fn(async (input: any) => ({
    id: 1,
    shareToken: "tok_test",
    hostId: input.hostId,
    hostDisplayName: input.hostDisplayName ?? null,
    platform: input.platform,
    gameId: input.gameId ?? null,
    lobbyId: input.lobbyId ?? null,
    payload: input.payload ?? null,
    active: true,
    startedAt: new Date().toISOString(),
    endedAt: null,
    viewerJoins: 0,
    shareUrl: `https://smuvejeffpresents.com/tha-spot?game=${input.gameId ?? ""}&live=tok_test`,
  })),
  getCurrentLiveStream: jest.fn(async () => null),
  endLiveStream: jest.fn(async () => ({ success: true, streamId: null })),
  resolveViewerJoin: jest.fn(async (token: string) => ({
    id: 1,
    shareToken: token,
    hostId: "h",
    hostDisplayName: null,
    platform: "twitch",
    gameId: "g",
    lobbyId: null,
    payload: {},
    active: true,
    startedAt: new Date().toISOString(),
    endedAt: null,
    viewerJoins: 0,
    shareUrl: "https://smuvejeffpresents.com/tha-spot",
  })),
  redeemViewerJoin: jest.fn(async (token: string) => ({
    id: 1,
    shareToken: token,
    hostId: "h",
    hostDisplayName: null,
    platform: "twitch",
    gameId: "g",
    lobbyId: null,
    payload: {},
    active: true,
    startedAt: new Date().toISOString(),
    endedAt: null,
    viewerJoins: 1,
    shareUrl: "https://smuvejeffpresents.com/tha-spot",
  })),
  findStreamByToken: jest.fn(async () => null),
}));

jest.mock("@/services/game-invite.service", () => ({
  issueInvite: jest.fn(async (input: any) => ({
    id: 1,
    token: "tok_test",
    gameId: input.gameId,
    mode: input.mode,
    createdById: input.createdById,
    targetUserId: input.targetUserId ?? null,
    payload: input.payload ?? null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    consumedAt: null,
    consumedById: null,
    revoked: false,
    shareUrl: `https://smuvejeffpresents.com/tha-spot?game=${input.gameId}&mode=${input.mode}&invite=tok_test`,
  })),
  consumeInvite: jest.fn(async (token: string, userId: string | null) => ({
    id: 1,
    token,
    gameId: "g",
    mode: "online",
    createdById: "host",
    targetUserId: null,
    payload: {},
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    consumedAt: new Date().toISOString(),
    consumedById: userId,
    revoked: false,
    shareUrl: "https://smuvejeffpresents.com/tha-spot",
    wasRestricted: false,
    alreadyConsumed: false,
  })),
  resolveInvite: jest.fn(async (token: string) => ({
    id: 1,
    token,
    gameId: "g",
    mode: "online",
    createdById: "host",
    targetUserId: null,
    payload: {},
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    consumedAt: null,
    consumedById: null,
    revoked: false,
    shareUrl: "https://smuvejeffpresents.com/tha-spot",
  })),
}));

jest.setTimeout(15000);

describe("socket.io handshake + JWT auth", () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    setupSocketIO(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const url = () => `http://localhost:${port}`;

  it("accepts a client that presents a valid JWT", (done) => {
    const token = jwt.sign({ userId: 42, role: "user" }, process.env.JWT_SECRET!);
    const client = ioClient(url(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    const timer = setTimeout(() => {
      client.close();
      done(new Error("connect timeout — valid token was rejected"));
    }, 5000);

    client.on("connect", () => {
      clearTimeout(timer);
      client.close();
      done();
    });
    client.on("connect_error", (err) => {
      clearTimeout(timer);
      client.close();
      done(new Error(`connect_error: ${err.message}`));
    });
  });

  it("rejects a client that presents no token", (done) => {
    const client = ioClient(url(), {
      auth: {},
      transports: ["websocket", "polling"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.close();
      done(new Error("socket was not rejected without a token"));
    }, 5000);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      done(err);
    };

    client.on("connect", () =>
      finish(new Error("unexpectedly connected without a token"))
    );
    client.on("connect_error", () => finish());
    client.on("disconnect", () => finish());
  });

  it("rejects a client that presents a garbage token", (done) => {
    const client = ioClient(url(), {
      auth: { token: "garbage.token.here" },
      transports: ["websocket", "polling"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.close();
      done(new Error("socket was not rejected with a garbage token"));
    }, 5000);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      done(err);
    };

    client.on("connect", () =>
      finish(new Error("unexpectedly connected with a garbage token"))
    );
    client.on("connect_error", () => finish());
    client.on("disconnect", () => finish());
  });

  it("keeps a user present while any of their sockets is still connected", (done) => {
    // Social + matchmaking clients each hold their own socket for the same
    // user. Losing one must not delete presence while the other is alive.
    const token = jwt.sign({ userId: 7, role: "user" }, process.env.JWT_SECRET!);
    const opts = { auth: { token }, transports: ["websocket", "polling"] };
    const clientA = ioClient(url(), opts);
    const clientB = ioClient(url(), opts);
    let aReady = false;
    let bReady = false;

    const startPresence = () => {
      if (!aReady || !bReady) return;
      clientA.emit("register_presence", {
        userId: "7",
        metadata: { artistName: "SOCKET_A" },
      });
      clientB.emit("register_presence", {
        userId: "7",
        metadata: { artistName: "SOCKET_B" },
      });
      // Let the broadcasts land, then drop socket A.
      setTimeout(() => {
        clientA.close();
        let sawStaleOffline = false;
        const onUsers = (users: unknown[]) => {
          if (
            Array.isArray(users) &&
            !users.some((u) => (u as { userId?: unknown }).userId === "7")
          ) {
            sawStaleOffline = true;
          }
        };
        clientB.on("users_online", onUsers);
        // If presence was wrongly deleted on A's disconnect, the server
        // broadcasts users_online WITHOUT user 7 within this window.
        setTimeout(() => {
          clientB.off("users_online", onUsers);
          clientB.close();
          done(
            sawStaleOffline
              ? new Error(
                  "presence was dropped while another socket for the user remained connected"
                )
              : undefined
          );
        }, 1000);
      }, 300);
    };

    const failFast = (label: string) => {
      done(
        new Error(
          `${label} failed to connect — cannot verify presence retention`
        )
      );
    };

    clientA.on("connect", () => {
      aReady = true;
      startPresence();
    });
    clientA.on("connect_error", () => failFast("client A"));
    clientB.on("connect", () => {
      bReady = true;
      startPresence();
    });
    clientB.on("connect_error", () => failFast("client B"));
  });
});

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import {
  isEitherBlocked,
  listRoomMessages,
  persistRoomMessage,
} from "@/services";
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
  isEitherBlocked: jest.fn(async () => false),
  isUserBlocked: jest.fn(async () => false),
  listRoomMessages: jest.fn(async () => []),
  persistRoomMessage: jest.fn(async (input: any) => ({
    id: 1,
    roomId: input.roomId,
    userId: input.userId,
    userName: input.userName || input.userId,
    message: input.message,
    timestamp: Date.now(),
  })),
  invalidateBlockCache: jest.fn(() => undefined),
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

  it("delivers persisted room history on join_room", (done) => {
    const token = jwt.sign({ userId: 90, role: "user" }, process.env.JWT_SECRET!);
    const client = ioClient(url(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    const timer = setTimeout(() => {
      client.close();
      done(new Error("room_history timeout"));
    }, 5000);
    jest.mocked(listRoomMessages).mockResolvedValueOnce([
      {
        id: 5,
        roomId: "lobby-x",
        userId: "u2",
        userName: "Rival",
        message: "gg",
        timestamp: 1234,
      },
    ]);
    client.on("connect", () => {
      client.emit("join_room", "lobby-x");
    });
    client.on("room_history", (data: any) => {
      clearTimeout(timer);
      client.close();
      expect(data.roomId).toBe("lobby-x");
      expect(data.messages[0].message).toBe("gg");
      expect(jest.mocked(listRoomMessages)).toHaveBeenCalledWith("lobby-x", 50);
      done();
    });
    client.on("connect_error", (err) => {
      clearTimeout(timer);
      client.close();
      done(new Error(`connect_error: ${err.message}`));
    });
  });

  it("persists + broadcasts room messages with the server row id", (done) => {
    const token = jwt.sign({ userId: 91, role: "user" }, process.env.JWT_SECRET!);
    const clientA = ioClient(url(), { auth: { token }, transports: ["websocket", "polling"] });
    const clientB = ioClient(url(), { auth: { token }, transports: ["websocket", "polling"] });
    const timer = setTimeout(() => {
      clientA.close();
      clientB.close();
      done(new Error("room message timeout"));
    }, 5000);
    let aJoined = false;
    let bJoined = false;
    const maybeSend = () => {
      if (!aJoined || !bJoined) return;
      // Both clients are confirmed in the room (history is emitted AFTER the
      // server joins the socket to the room) — safe to send.
      jest.mocked(persistRoomMessage).mockResolvedValueOnce({
        id: 42,
        roomId: "lobby-y",
        userId: "91",
        userName: "91",
        message: "yo lobby",
        timestamp: 5678,
      });
      clientA.emit("send_room_message", { roomId: "lobby-y", message: "yo lobby" });
    };
    clientA.on("connect", () => clientA.emit("join_room", "lobby-y"));
    clientB.on("connect", () => clientB.emit("join_room", "lobby-y"));
    clientA.on("room_history", () => {
      aJoined = true;
      maybeSend();
    });
    clientB.on("room_history", () => {
      bJoined = true;
      maybeSend();
    });
    clientB.on("room_message", (data: any) => {
      clearTimeout(timer);
      clientA.close();
      clientB.close();
      expect(jest.mocked(persistRoomMessage)).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: "lobby-y", message: "yo lobby", userId: "91" }),
      );
      expect(data.id).toBe(42);
      expect(data.message).toBe("yo lobby");
      done();
    });
  });

  it("broadcasts the authoritative lobby_list when a party is created", (done) => {
    const tokenA = jwt.sign({ userId: 101, role: "user" }, process.env.JWT_SECRET!);
    const tokenB = jwt.sign({ userId: 102, role: "user" }, process.env.JWT_SECRET!);
    const clientA = ioClient(url(), { auth: { token: tokenA }, transports: ["websocket", "polling"] });
    const clientB = ioClient(url(), { auth: { token: tokenB }, transports: ["websocket", "polling"] });
    const timer = setTimeout(() => {
      clientA.close();
      clientB.close();
      done(new Error("lobby_list timeout"));
    }, 5000);
    clientB.on("lobby_list", (lobbies: any[]) => {
      if (!Array.isArray(lobbies) || lobbies.length === 0) return; // initial empty directory
      clearTimeout(timer);
      clientA.close();
      clientB.close();
      const lobby = lobbies.find((l) => l.partyId === "party-abc");
      expect(lobby).toBeDefined();
      expect(lobby.gameId).toBe("pacman");
      expect(lobby.memberCount).toBe(1);
      expect(lobby.leaderId).toBe("101");
      done();
    });
    clientA.on("connect", () => {
      clientA.emit("create_party", { partyId: "party-abc", gameId: "pacman" });
    });
  });

  it("drops DM delivery when either party is blocked", (done) => {
    const tokenA = jwt.sign({ userId: 111, role: "user" }, process.env.JWT_SECRET!);
    const tokenB = jwt.sign({ userId: 112, role: "user" }, process.env.JWT_SECRET!);
    const clientA = ioClient(url(), { auth: { token: tokenA }, transports: ["websocket", "polling"] });
    const clientB = ioClient(url(), { auth: { token: tokenB }, transports: ["websocket", "polling"] });
    const timer = setTimeout(() => {
      clientA.close();
      clientB.close();
      done(new Error("blocked DM was not dropped"));
    }, 5000);
    let aConnected = false;
    let bConnected = false;
    const maybeSend = () => {
      if (!aConnected || !bConnected) return;
      jest.mocked(isEitherBlocked).mockResolvedValueOnce(true);
      clientA.emit("send_message", { toUserId: "112", message: "hi" });
      // Give the (blocked) handler time to resolve, then assert no delivery
      // and no persistence.
      setTimeout(() => {
        clearTimeout(timer);
        clientA.close();
        clientB.close();
        const { persistMessage } = jest.requireMock("@/services") as {
          persistMessage: jest.Mock;
        };
        expect(persistMessage).not.toHaveBeenCalled();
        done();
      }, 800);
    };
    clientA.on("connect", () => {
      aConnected = true;
      maybeSend();
    });
    clientB.on("connect", () => {
      bConnected = true;
      maybeSend();
    });
    clientB.on("private_message", () => {
      clearTimeout(timer);
      clientA.close();
      clientB.close();
      done(new Error("blocked DM reached the recipient"));
    });
  });

  it("rate-limits typing so bursts are dropped", (done) => {
    const tokenA = jwt.sign({ userId: 121, role: "user" }, process.env.JWT_SECRET!);
    const tokenB = jwt.sign({ userId: 122, role: "user" }, process.env.JWT_SECRET!);
    // Websocket-only: events sent in one synchronous burst are processed
    // back-to-back, so the sliding window is deterministic.
    const clientA = ioClient(url(), { auth: { token: tokenA }, transports: ["websocket"] });
    const clientB = ioClient(url(), { auth: { token: tokenB }, transports: ["websocket"] });
    const received: string[] = [];
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clientA.close();
      clientB.close();
      done(err);
    };
    const timer = setTimeout(() => finish(new Error("typing rate-limit test timed out")), 7000);
    let aConnected = false;
    let bConnected = false;
    const maybeBurst = () => {
      if (!aConnected || !bConnected) return;
      for (let i = 0; i < 4; i++) {
        clientA.emit("typing", { toUserId: "122", isTyping: true });
      }
    };
    clientA.on("connect", () => {
      aConnected = true;
      maybeBurst();
    });
    clientB.on("connect", () => {
      bConnected = true;
      maybeBurst();
    });
    clientB.on("user_typing", (data: any) => {
      received.push(String(data.isTyping));
      // Budget is 3/1s; after the burst (plus generous slack for delivery),
      // exactly 3 must have arrived — the 4th is dropped server-side.
      if (received.length >= 3) {
        setTimeout(() => {
          clearTimeout(timer);
          if (received.length !== 3) {
            finish(new Error(`rate limit failed — expected 3 deliveries, got ${received.length}`));
            return;
          }
          // After the window passes, a fresh event is delivered again.
          setTimeout(() => {
            clientA.emit("typing", { toUserId: "122", isTyping: false });
            setTimeout(() => {
              finish(received.length === 4 ? undefined : new Error("rate limit did not reset after window"));
            }, 500);
          }, 1100);
        }, 1500);
      }
    });
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

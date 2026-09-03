import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import {
  isEitherBlocked,
  listRoomMessages,
  persistRoomMessage,
} from "@/services";
import { endLiveStream } from "@/services/live-stream.service";
import { provisionChallengeLobby, setupSocketIO } from "./index";

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

  it("rejects a full lobby with party_join_failed", (done) => {
    const mk = (id: number) =>
      ioClient(url(), {
        auth: { token: jwt.sign({ userId: id, role: "user" }, process.env.JWT_SECRET!) },
        transports: ["websocket", "polling"],
      });
    const clients = [mk(201), mk(202), mk(203), mk(204), mk(205)];
    const failures: { partyId: string; reason: string }[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      clients.forEach((c) => c.close());
      done(new Error("full-lobby rejection never arrived"));
    }, 8000);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clients.forEach((c) => c.close());
      done(err);
    };
    clients.forEach((c) => {
      c.on("party_join_failed", (data: { partyId: string; reason: string }) => {
        failures.push(data);
        // Exactly one joiner must be rejected, with the full reason.
        setTimeout(() => {
          if (failures.length === 1 && failures[0].reason === "lobby_full") {
            finish();
          } else {
            finish(
              new Error(
                `expected exactly one lobby_full rejection, got ${JSON.stringify(failures)}`,
              ),
            );
          }
        }, 800);
      });
    });
    let connected = 0;
    clients.forEach((c, idx) => {
      c.on("connect", () => {
        connected++;
        if (connected === clients.length) {
          // Create first, THEN join — so no joiner can hit lobby_not_found.
          clients[0].emit("create_party", { partyId: "party-full", gameId: "pacman" });
          setTimeout(() => {
            for (let i = 1; i < clients.length; i++) {
              clients[i].emit("join_party", { partyId: "party-full" });
            }
          }, 300);
        }
      });
    });
  });

  it("removes a user from their previous lobby when they join a new one", (done) => {
    const tokenA = jwt.sign({ userId: 211, role: "user" }, process.env.JWT_SECRET!);
    const tokenB = jwt.sign({ userId: 212, role: "user" }, process.env.JWT_SECRET!);
    const clientA = ioClient(url(), { auth: { token: tokenA }, transports: ["websocket", "polling"] });
    const clientB = ioClient(url(), { auth: { token: tokenB }, transports: ["websocket", "polling"] });
    let aReady = false;
    let bReady = false;
    const timer = setTimeout(() => {
      clientA.close();
      clientB.close();
      done(new Error("lobby switch test timed out"));
    }, 8000);
    const maybeStart = () => {
      if (!aReady || !bReady) return;
      // Strict sequencing: create → join → (B confirmed in room) → switch.
      clientA.emit("create_party", { partyId: "party-old", gameId: "pacman" });
      setTimeout(() => {
        clientB.emit("join_party", { partyId: "party-old" });
      }, 300);
    };
    clientA.on("connect", () => {
      aReady = true;
      maybeStart();
    });
    clientB.on("connect", () => {
      bReady = true;
      maybeStart();
    });
    // B hears its own join broadcast — proof it is inside party-old.
    clientB.on("user_joined_party", (data: { userId: string }) => {
      if (data.userId !== "212") return;
      // Switching lobbies must eject B from party-old first.
      clientB.emit("create_party", { partyId: "party-second", gameId: "pacman" });
    });
    clientA.on("user_left_party", (data: { userId: string }) => {
      if (data.userId !== "212") return;
      clearTimeout(timer);
      clientA.close();
      clientB.close();
      done();
    });
  });

  it("keeps third-party devices out of a split-screen pair", (done) => {
    const mk = (id: number) =>
      ioClient(url(), {
        auth: { token: jwt.sign({ userId: id, role: "user" }, process.env.JWT_SECRET!) },
        transports: ["websocket", "polling"],
      });
    const host = mk(221);
    const guest = mk(222);
    const third = mk(223);
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      host.close();
      guest.close();
      third.close();
      done(err);
    };
    const timer = setTimeout(
      () => finish(new Error("split-screen pair-capacity test timed out")),
      8000,
    );
    // Fully sequential: host registers → guest registers → pair ready →
    // third device tries to steal the guest slot → rejected → legit
    // host→guest snapshot still flows while the impostor path stays dead.
    host.on("connect", () => {
      setTimeout(() => {
        host.emit("split_screen_register", { lobbyId: "split-cap", role: "host" });
      }, 100);
    });
    host.on("split_screen_role_assigned", () => {
      setTimeout(() => {
        guest.emit("split_screen_register", { lobbyId: "split-cap", role: "guest" });
      }, 100);
    });
    guest.on("split_screen_ready", () => {
      setTimeout(() => {
        third.emit("split_screen_register", { lobbyId: "split-cap", role: "guest" });
        third.emit("split_screen_sync", {
          lobbyId: "split-cap",
          snapshot: { score: 999, ts: Date.now() },
        });
      }, 100);
    });
    third.on("split_screen_pair_full", () => {
      // Third device rejected — the legit host→guest path must still work.
      host.emit("split_screen_sync", {
        lobbyId: "split-cap",
        snapshot: { score: 10, ts: Date.now() },
      });
    });
    guest.on(
      "split_screen_snapshot",
      (data: { fromUserId: string; snapshot: { score?: number } }) => {
        if (data.fromUserId === "223") {
          finish(new Error("impostor snapshot reached the guest"));
          return;
        }
        if (data.fromUserId === "221" && data.snapshot.score === 10) {
          setTimeout(() => finish(), 400);
        }
      },
    );
  });

  it("bootstraps a late-joining split-screen guest with the cached peer snapshot", (done) => {
    const tokenHost = jwt.sign({ userId: 221, role: "user" }, process.env.JWT_SECRET!);
    const tokenGuest = jwt.sign({ userId: 222, role: "user" }, process.env.JWT_SECRET!);
    const host = ioClient(url(), { auth: { token: tokenHost }, transports: ["websocket"] });
    const guest = ioClient(url(), { auth: { token: tokenGuest }, transports: ["websocket"] });
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      host.close();
      guest.close();
      done(err);
    };
    const timer = setTimeout(
      () => finish(new Error("split-screen late-join bootstrap test timed out")),
      8000,
    );
    host.on("connect", () => {
      setTimeout(() => {
        host.emit("split_screen_register", { lobbyId: "split-latejoin", role: "host" });
      }, 100);
    });
    host.on("split_screen_role_assigned", () => {
      // Host plays solo BEFORE any guest exists: the server must cache this
      // frame and replay it to the guest as soon as they register.
      host.emit("split_screen_sync", {
        lobbyId: "split-latejoin",
        snapshot: { level: "LV_03", score: 42, turn: "host", ts: Date.now() },
      });
      setTimeout(() => {
        guest.emit("split_screen_register", { lobbyId: "split-latejoin", role: "guest" });
      }, 250);
    });
    guest.on(
      "split_screen_snapshot",
      (data: {
        fromUserId: string;
        lobbyId: string;
        snapshot: { score?: number; level?: string };
      }) => {
        try {
          expect(data.lobbyId).toBe("split-latejoin");
          expect(data.fromUserId).toBe("221");
          expect(data.snapshot.score).toBe(42);
          expect(data.snapshot.level).toBe("LV_03");
          finish();
        } catch (e) {
          finish(e as Error);
        }
      },
    );
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

  it("ends the host live stream when their last socket disconnects", (done) => {
    const token = jwt.sign({ userId: 777, role: "user" }, process.env.JWT_SECRET!);
    const client = ioClient(url(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let poll: ReturnType<typeof setInterval>;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      client.close();
      done(err);
    };
    timer = setTimeout(
      () => finish(new Error("disconnect never triggered endLiveStream for a live host")),
      5000,
    );
    // Filter by unique host id so earlier tests on the shared mock do not count.
    poll = setInterval(() => {
      const calls = jest
        .mocked(endLiveStream)
        .mock.calls.filter(([hostId]) => hostId === "777");
      if (calls.length > 0) finish();
    }, 100);
    client.on("connect", () => {
      client.emit("live_stream_start", { platform: "twitch" });
      // Let the server mark presence live, then hard-drop the only socket.
      setTimeout(() => client.close(), 300);
    });
    client.on("connect_error", () => finish(new Error("connect_error")));
  });
});

describe("resolved-match lobby provisioning + in-match relays", () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  const clients: ReturnType<typeof mkServer>[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    setupSocketIO(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(() => {
    // A failed assertion must not leak open sockets into the afterAll close.
    clients.forEach((c) => c.close());
    clients.length = 0;
  });

  afterAll(async () => {
    clients.forEach((c) => c.close());
    clients.length = 0;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  const url = () => `http://localhost:${port}`;
  const mkServer = (id: number) =>
    ioClient(url(), {
      auth: {
        token: jwt.sign({ userId: id, role: "user" }, process['env'].JWT_SECRET!),
      },
      transports: ["websocket", "polling"],
    });
  const mk = (id: number) => {
    const c = mkServer(id);
    clients.push(c);
    return c;
  };

  const connect = (client: ReturnType<typeof mkServer>) =>
    new Promise<void>((resolve, reject) => {
      client.on("connect", () => resolve());
      client.on("connect_error", () =>
        reject(new Error("test client failed to connect"))
      );
    });

  const waitFor = (fn: () => boolean, ms = 7000) =>
    new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (fn()) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - start > ms) {
          clearInterval(iv);
          reject(new Error("waitFor timed out"));
        }
      }, 40);
    });

  it("provisions ONE shared lobby for an accepted challenge that both players join", async () => {
    const challenger = mk(301);
    const opponent = mk(302);
    const lobbyList: any[] = [];
    const readyEvents: any[] = [];
    const joins: string[] = [];
    challenger.on("lobby_list", (l: any) => {
      if (Array.isArray(l)) lobbyList.push(...l);
    });
    opponent.on("lobby_list", (l: any) => {
      if (Array.isArray(l)) lobbyList.push(...l);
    });
    const onReady = (d: any) => readyEvents.push(d);
    challenger.on("challenge_lobby_ready", onReady);
    opponent.on("challenge_lobby_ready", onReady);
    challenger.on("user_joined_party", (d: any) => joins.push(d.userId));
    opponent.on("user_joined_party", (d: any) => joins.push(d.userId));

    await Promise.all([connect(challenger), connect(opponent)]);

    // Simulate the REST accept path: accept provisions the room, and a
    // concurrent duplicate accept must converge on the SAME room.
    const partyId1 = provisionChallengeLobby({
      id: 777,
      fromUserId: "301",
      toUserId: "302",
      gameId: "tekken-3-elite",
    });
    const partyId2 = provisionChallengeLobby({
      id: 777,
      fromUserId: "301",
      toUserId: "302",
      gameId: "tekken-3-elite",
    });
    expect(partyId1).toBeTruthy();
    expect(partyId2).toBe(partyId1);

    await waitFor(() => readyEvents.length >= 2);
    expect(readyEvents.every((r) => r.partyId === partyId1)).toBe(true);
    expect(readyEvents[0].challengerId).toBe("301");
    expect(readyEvents[0].opponentId).toBe("302");

    // Both players join the room the way the client does.
    challenger.emit("join_party", { partyId: partyId1 });
    opponent.emit("join_party", { partyId: partyId1 });
    await waitFor(() => joins.length >= 2);
    expect(joins).toContain("301");
    expect(joins).toContain("302");

    // The lobby directory advertises the resolved pair.
    const entry = lobbyList.filter((l: any) => l.partyId === partyId1).pop();
    expect(entry?.memberCount).toBe(2);
    expect(entry?.gameId).toBe("tekken-3-elite");
  });

  it("relays game state + lobby chat to the pair and spectators but never outsiders", async () => {
    const a = mk(311);
    const b = mk(312);
    const third = mk(313);
    const spect = mk(314);
    await Promise.all([connect(a), connect(b), connect(third), connect(spect)]);

    const partyId =
      provisionChallengeLobby({
        id: 878,
        fromUserId: "311",
        toUserId: "312",
        gameId: "mortal-kombat-2-elite",
      })!;
    a.emit("join_party", { partyId });
    b.emit("join_party", { partyId });

    const bStates: any[] = [];
    const spectStates: any[] = [];
    const bChat: any[] = [];
    b.on("game_state_update", (u: any) => bStates.push(u));
    spect.on("game_state_update", (u: any) => spectStates.push(u));
    b.on("lobby_chat_message", (m: any) => bChat.push(m));

    // Let room joins settle before scoring.
    await new Promise((r) => setTimeout(r, 300));

    a.emit("game_state_update", { lobbyId: partyId, score: 42 });
    a.emit("lobby_chat_message", {
      lobbyId: partyId,
      text: "GG",
      id: "m1",
      timestamp: Date.now(),
    });
    await waitFor(() => bStates.length >= 1 && bChat.length >= 1);

    // Spectator joins, THEN live frames flow to them.
    spect.emit("join_spectate", { lobbyId: partyId });
    await new Promise((r) => setTimeout(r, 300));
    a.emit("game_state_update", { lobbyId: partyId, score: 43 });
    // A non-member who knows the lobbyId cannot inject state or chat.
    third.emit("game_state_update", { lobbyId: partyId, score: 99999 });
    third.emit("lobby_chat_message", {
      lobbyId: partyId,
      text: "injection",
      id: "bad",
    });

    await waitFor(() => spectStates.length >= 1);
    expect(bStates[0].score).toBe(42);
    expect(bStates[0].fromUserId).toBe("311");
    expect(bStates.some((u) => u.score === 43)).toBe(true);
    expect(spectStates.some((u) => u.score === 43)).toBe(true);
    expect(bStates.some((u) => u.score === 99999)).toBe(false);
    expect(spectStates.some((u) => u.score === 99999)).toBe(false);
    expect(bChat[0].text).toBe("GG");
    expect(bChat[0].fromUserId).toBe("311");
    expect(bChat.some((m) => m.text === "injection")).toBe(false);
    // The sender never sees its own packet echoed back.
    const aEchoes: any[] = [];
    a.on("game_state_update", (u: any) => aEchoes.push(u));
    await new Promise((r) => setTimeout(r, 200));
    expect(aEchoes.some((u) => u.score === 42 || u.score === 43)).toBe(false);
  });

  it("ends the whole resolved lobby when either player leaves or disconnects", async () => {
    const a = mk(321);
    const b = mk(322);
    await Promise.all([connect(a), connect(b)]);

    const partyId =
      provisionChallengeLobby({
        id: 979,
        fromUserId: "321",
        toUserId: "322",
        gameId: "rocket-league",
      })!;
    a.emit("join_party", { partyId });
    b.emit("join_party", { partyId });

    const ended: any[] = [];
    let blobs: any[] = [];
    b.on("party_ended", (d: any) => ended.push(d));
    b.on("lobby_list", (l: any) => {
      if (Array.isArray(l)) blobs = l;
    });

    await new Promise((r) => setTimeout(r, 300));

    // Voluntary leave ends the match for both sides.
    a.emit("leave_party", { partyId });
    await waitFor(() => ended.length >= 1);
    expect(ended[0].partyId).toBe(partyId);
    expect(ended[0].reason).toBe("player_left");
    await waitFor(() => !blobs.some((l: any) => l.partyId === partyId));

    // A fresh pair: disconnecting one side also tears the room down.
    const c = mk(331);
    const d = mk(332);
    await Promise.all([connect(c), connect(d)]);
    const partyId2 =
      provisionChallengeLobby({
        id: 980,
        fromUserId: "331",
        toUserId: "332",
        gameId: "rocket-league",
      })!;
    c.emit("join_party", { partyId: partyId2 });
    d.emit("join_party", { partyId: partyId2 });
    const ended2: any[] = [];
    d.on("party_ended", (ev: any) => ended2.push(ev));
    await new Promise((r) => setTimeout(r, 300));

    c.close(); // hard disconnect, no leave_party
    await waitFor(() => ended2.length >= 1);
    expect(ended2[0].partyId).toBe(partyId2);
    expect(ended2[0].reason).toBe("disconnected");
  });
});
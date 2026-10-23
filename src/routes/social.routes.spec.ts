import express from "express";
import type { AddressInfo } from "node:net";
import socialRoutes from "./social.routes";
import * as services from "@/services";
import * as socket from "@/socket";

jest.mock("@/middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = (globalThis as any).__socialRouteActor;
    next();
  },
}));

jest.mock("@/services", () => ({
  addFriend: jest.fn(),
  assertOwnershipOrAdmin: jest.fn((actor: any, routeUserId: string) => {
    if (actor.role !== "admin" && String(actor.userId) !== routeUserId) {
      throw Object.assign(new Error("Access denied"), { statusCode: 403 });
    }
  }),
  blockUser: jest.fn(),
  createChallenge: jest.fn(),
  featuredUsers: jest.fn(),
  listBlockedUsers: jest.fn(),
  listChallenges: jest.fn(),
  listFriends: jest.fn(),
  listMessageThread: jest.fn(),
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  persistNotification: jest.fn(),
  removeFriend: jest.fn(),
  respondToChallenge: jest.fn(),
  respondToFriendRequest: jest.fn(),
  searchUsers: jest.fn(),
  unblockUser: jest.fn(),
}));

jest.mock("@/socket", () => ({
  emitChallengeCreated: jest.fn(),
  emitChallengeResponse: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/users", socialRoutes);
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

describe("social challenge HTTP routes", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
  });

  it("creates a challenge and notifies the recipient only for a new row", async () => {
    const created = {
      id: 41,
      fromUserId: "7",
      fromUserName: "Player Seven",
      toUserId: "12",
      gameId: "pacman",
      gameName: "PAC-MAN",
      message: "Ready?",
      status: "pending",
      timestamp: 123,
      isNew: true,
    };
    (services.createChallenge as jest.Mock).mockResolvedValue(created);
    (services.persistNotification as jest.Mock).mockResolvedValue({ id: 1 });

    const response = await fetch(`${baseUrl}/api/users/7/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toUserId: "12",
        gameId: "pacman",
        gameName: "PAC-MAN",
        message: "Ready?",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: 41, isNew: true });
    expect(services.createChallenge).toHaveBeenCalledWith("7", undefined, {
      toUserId: "12",
      gameId: "pacman",
      gameName: "PAC-MAN",
      message: "Ready?",
    });
    expect(services.persistNotification).toHaveBeenCalledWith({
      userId: "12",
      type: "challenge_incoming",
      title: "🎮 Game Challenge",
      body: "Player Seven challenged you to PAC-MAN",
      payload: {
        challengeId: 41,
        fromUserId: "7",
        gameId: "pacman",
        gameTitle: "PAC-MAN",
      },
    });
    expect(socket.emitChallengeCreated).toHaveBeenCalledWith({
      ...created,
      fromUserId: "7",
    });
  });

  it("returns 200 and avoids duplicate notification/broadcast for an existing challenge", async () => {
    (services.createChallenge as jest.Mock).mockResolvedValue({
      id: 41,
      toUserId: "12",
      gameId: "pacman",
      gameName: "PAC-MAN",
      isNew: false,
    });

    const response = await fetch(`${baseUrl}/api/users/7/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toUserId: "12", gameId: "pacman" }),
    });

    expect(response.status).toBe(200);
    expect(services.persistNotification).not.toHaveBeenCalled();
    expect(socket.emitChallengeCreated).not.toHaveBeenCalled();
  });

  it("passes the route user as the challenge responder and emits the saved response", async () => {
    (globalThis as any).__socialRouteActor = { userId: 12, role: "user" };
    const updated = { id: 41, fromUserId: "7", toUserId: "12", status: "accepted" };
    (services.respondToChallenge as jest.Mock).mockResolvedValue(updated);

    const response = await fetch(`${baseUrl}/api/users/12/challenges/41/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "accepted" });
    expect(services.respondToChallenge).toHaveBeenCalledWith(41, "accepted", "12");
    expect(socket.emitChallengeResponse).toHaveBeenCalledWith(updated);
  });

  it("returns forbidden when the authenticated route owner is not the challenge recipient", async () => {
    (globalThis as any).__socialRouteActor = { userId: 99, role: "user" };
    (services.respondToChallenge as jest.Mock).mockRejectedValue(
      Object.assign(new Error("Only the challenge recipient may respond"), {
        statusCode: 403,
      }),
    );

    const response = await fetch(`${baseUrl}/api/users/99/challenges/41/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the challenge recipient may respond",
    });
    expect(services.respondToChallenge).toHaveBeenCalledWith(41, "accepted", "99");
    expect(socket.emitChallengeResponse).not.toHaveBeenCalled();
  });

  it("rejects challenge routes outside the authenticated user's ownership", async () => {
    const response = await fetch(`${baseUrl}/api/users/8/challenges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toUserId: "12", gameId: "pacman" }),
    });

    expect(response.status).toBe(403);
    expect(services.createChallenge).not.toHaveBeenCalled();
  });
});

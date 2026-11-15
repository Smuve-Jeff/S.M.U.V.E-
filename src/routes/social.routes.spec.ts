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
  clearFriendRequestNotifications: jest.fn(),
  createChallenge: jest.fn(),
  featuredUsers: jest.fn(),
  listBlockedUsers: jest.fn(),
  listChallenges: jest.fn(),
  listFriends: jest.fn(),
  listMessageThread: jest.fn(),
  listNotifications: jest.fn(),
  markFriendRequestNotificationsRead: jest.fn(),
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
  emitFriendRequestReceived: jest.fn(),
  emitFriendRequestResolved: jest.fn(),
  emitFriendRequestsRead: jest.fn(),
  refreshOnlinePresence: jest.fn(),
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

  it("clears pending requests when a block is placed", async () => {
    (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
    (services.blockUser as jest.Mock).mockResolvedValue({
      success: true,
      blockedUserId: "12",
    });

    const response = await fetch(`${baseUrl}/api/users/7/blocks/12`, {
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(services.blockUser).toHaveBeenCalledWith("7", "12");
    expect(services.clearFriendRequestNotifications).toHaveBeenCalledWith(
      "7",
      "12",
    );
    expect(socket.emitFriendRequestResolved).toHaveBeenCalledWith("7", "12");
    expect(socket.refreshOnlinePresence).toHaveBeenCalled();
  });

  it("refreshes personalized presence when a block is removed", async () => {
    (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
    (services.unblockUser as jest.Mock).mockResolvedValue({
      success: true,
      blockedUserId: "12",
    });

    const response = await fetch(`${baseUrl}/api/users/7/blocks/12`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(services.unblockUser).toHaveBeenCalledWith("7", "12");
    expect(socket.refreshOnlinePresence).toHaveBeenCalled();
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

  describe("friend request routes", () => {
    it("accepts a pending request for its recipient", async () => {
      (globalThis as any).__socialRouteActor = { userId: 12, role: "user" };
      (services.respondToFriendRequest as jest.Mock).mockResolvedValue({
        success: true,
      });

      const response = await fetch(`${baseUrl}/api/users/12/friends/7`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(services.respondToFriendRequest).toHaveBeenCalledWith(
        "12",
        "7",
        "accepted",
      );
      expect(services.clearFriendRequestNotifications).toHaveBeenCalledWith(
        "12",
        "7",
      );
      expect(socket.emitFriendRequestResolved).toHaveBeenCalledWith("12", "7");
    });

    it("notifies the recipient when a new friend request is created", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.addFriend as jest.Mock).mockResolvedValue({
        success: true,
        requested: true,
      });

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        requested: true,
      });
      expect(services.addFriend).toHaveBeenCalledWith("7", "12");
      expect(services.persistNotification).toHaveBeenCalledWith({
        userId: "12",
        type: "friend_request",
        title: "New friend request",
        body: "A player wants to connect with you. Open NET to respond.",
        payload: { fromUserId: "7" },
      });
      expect(socket.emitFriendRequestReceived).toHaveBeenCalledWith({
        toUserId: "12",
        fromUserId: "7",
      });
    });

    it("does not notify for a duplicate or mutual-accept request", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.addFriend as jest.Mock).mockResolvedValue({ success: true });

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(200);
      expect(services.persistNotification).not.toHaveBeenCalled();
      expect(socket.emitFriendRequestReceived).not.toHaveBeenCalled();
      expect(services.clearFriendRequestNotifications).not.toHaveBeenCalled();
    });

    it("clears stale notifications when mutual requests auto-accept", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.addFriend as jest.Mock).mockResolvedValue({
        success: true,
        accepted: true,
      });

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(200);
      expect(services.clearFriendRequestNotifications).toHaveBeenCalledWith(
        "7",
        "12",
      );
      expect(socket.emitFriendRequestResolved).toHaveBeenCalledWith("7", "12");
      expect(services.persistNotification).not.toHaveBeenCalled();
    });

    it("marks friend-request notifications read and clears loaded inboxes", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.listFriends as jest.Mock).mockResolvedValue([]);
      (services.markFriendRequestNotificationsRead as jest.Mock).mockResolvedValue({
        success: true,
        updated: 2,
      });

      const response = await fetch(`${baseUrl}/api/users/7/friends`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([]);
      expect(services.listFriends).toHaveBeenCalledWith("7");
      expect(services.markFriendRequestNotificationsRead).toHaveBeenCalledWith(
        "7",
      );
      expect(socket.emitFriendRequestsRead).toHaveBeenCalledWith("7");
    });

    it("does not emit a read event when nothing was unread", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.listFriends as jest.Mock).mockResolvedValue([]);
      (services.markFriendRequestNotificationsRead as jest.Mock).mockResolvedValue({
        success: true,
        updated: 0,
      });

      const response = await fetch(`${baseUrl}/api/users/7/friends`);

      expect(response.status).toBe(200);
      expect(socket.emitFriendRequestsRead).not.toHaveBeenCalled();
    });

    it("declines a pending request for its recipient", async () => {
      (globalThis as any).__socialRouteActor = { userId: 12, role: "user" };
      (services.respondToFriendRequest as jest.Mock).mockResolvedValue({
        success: true,
        message: "Connection declined.",
      });

      const response = await fetch(`${baseUrl}/api/users/12/friends/7`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "declined" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        message: "Connection declined.",
      });
      expect(services.respondToFriendRequest).toHaveBeenCalledWith(
        "12",
        "7",
        "declined",
      );
      expect(services.clearFriendRequestNotifications).toHaveBeenCalledWith(
        "12",
        "7",
      );
      expect(socket.emitFriendRequestResolved).toHaveBeenCalledWith("12", "7");
    });

    it("returns 404 when accepting your own outgoing request", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.respondToFriendRequest as jest.Mock).mockRejectedValue(
        Object.assign(new Error("No pending friend request"), {
          statusCode: 404,
        }),
      );

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "No pending friend request",
      });
      expect(services.respondToFriendRequest).toHaveBeenCalledWith(
        "7",
        "12",
        "accepted",
      );
    });

    it("cancels a friend request or friendship with DELETE", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.removeFriend as jest.Mock).mockResolvedValue({ success: true });

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(services.removeFriend).toHaveBeenCalledWith("7", "12");
      expect(services.clearFriendRequestNotifications).toHaveBeenCalledWith(
        "7",
        "12",
      );
      expect(socket.emitFriendRequestResolved).toHaveBeenCalledWith("7", "12");
    });

    it("returns 403 when either user has blocked the other", async () => {
      (globalThis as any).__socialRouteActor = { userId: 7, role: "user" };
      (services.addFriend as jest.Mock).mockRejectedValue(
        Object.assign(
          new Error("Cannot send a friend request to a blocked player"),
          { statusCode: 403 },
        ),
      );

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Cannot send a friend request to a blocked player",
      });
      expect(services.addFriend).toHaveBeenCalledWith("7", "12");
    });

    it("rejects friend routes outside the authenticated user's ownership", async () => {
      (globalThis as any).__socialRouteActor = { userId: 99, role: "user" };

      const response = await fetch(`${baseUrl}/api/users/7/friends/12`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });

      expect(response.status).toBe(403);
      expect(services.respondToFriendRequest).not.toHaveBeenCalled();
    });
  });
});

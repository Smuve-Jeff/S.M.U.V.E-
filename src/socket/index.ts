import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import {
  activateSessionMember,
  buildSessionSyncPayload,
  createChallenge,
  createStudioSession,
  hasStudioPermission,
  isEitherBlocked,
  listRoomMessages,
  persistMessage,
  persistNotification,
  persistRoomMessage,
  upsertSessionMember,
} from "@/services";
import { getStudioMember } from "@/services/studio-collab.service";
import {
  issueInvite as issueInviteRecord,
  consumeInvite as consumeInviteRecord,
  resolveInvite as resolveInviteRecord,
} from "@/services/game-invite.service";
import {
  endLiveStream,
  findStreamByToken,
  resolveViewerJoin,
  redeemViewerJoin,
  startLiveStream,
} from "@/services/live-stream.service";
import type { InviteMode } from "@/services/game-invite.service";
import type { AuthUser } from "@/types";

interface PresenceMeta {
  artistName?: string;
  primaryGenre?: string;
  avatarImage?: string;
  location?: string;
  profileSetupCompleted?: boolean;
  eliteScore?: number;
  squadCount?: number;
  [key: string]: unknown;
}

interface PartyMember {
  userId: string;
  artistName?: string;
}

interface Party {
  leaderId: string;
  members: PartyMember[];
  gameId: string;
}

interface QueueEntry {
  userId: string;
  socketId: string;
  timestamp: number;
}

const getStudioRoom = (sessionId: string) => `session:${sessionId}`;
const getPartyRoom = (partyId: string) => `party:${partyId}`;
const MAX_CHAT_MESSAGE_LENGTH = 2000;

// ── Per-user rate limiting (shared across ALL of a user's sockets so
// opening N sockets cannot multiply the budget) ──
const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
  send_message: { windowMs: 5_000, max: 8 },
  send_room_message: { windowMs: 5_000, max: 10 },
  send_party_message: { windowMs: 5_000, max: 10 },
  typing: { windowMs: 1_000, max: 3 },
  voice_signal: { windowMs: 1_000, max: 15 },
  challenge_player: { windowMs: 10_000, max: 5 },
  neural_sync_request: { windowMs: 10_000, max: 5 },
  neural_sync_approve: { windowMs: 10_000, max: 5 },
  invite_to_party: { windowMs: 10_000, max: 10 },
  invite_to_studio_session: { windowMs: 10_000, max: 10 },
  send_async_packet: { windowMs: 10_000, max: 10 },
  create_party: { windowMs: 10_000, max: 5 },
  queue_for_match: { windowMs: 10_000, max: 5 },
  split_screen_sync: { windowMs: 1_000, max: 30 },
  game_state_update: { windowMs: 1_000, max: 30 },
  replay_snapshot: { windowMs: 1_000, max: 30 },
  party_started: { windowMs: 10_000, max: 5 },
  join_spectate: { windowMs: 10_000, max: 10 },
  spectator_reaction: { windowMs: 10_000, max: 30 },
};

/** Lobbies are capped so joiners get accurate "full" feedback instead of a silently overflowing room. */
const PARTY_MAX_PLAYERS = 4;
const rateBuckets = new Map<string, Record<string, number[]>>();

/** Sliding-window check; returns true when the user exceeded their budget. */
const isRateLimited = (userId: string, event: string): boolean => {
  const limit = RATE_LIMITS[event];
  if (!limit) return false;
  const now = Date.now();
  let userBuckets = rateBuckets.get(userId);
  if (!userBuckets) {
    userBuckets = {};
    rateBuckets.set(userId, userBuckets);
  }
  const hits = (userBuckets[event] ?? []).filter(
    (t) => now - t < limit.windowMs,
  );
  if (hits.length >= limit.max) {
    userBuckets[event] = hits;
    return true;
  }
  hits.push(now);
  userBuckets[event] = hits;
  return false;
};

function normalizeChatMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message ? message.slice(0, MAX_CHAT_MESSAGE_LENGTH) : null;
}

function validSocketId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/**
 * Module-scoped reference to the active Socket.io server. HTTP routes push
 * realtime events to users through this handle (e.g. challenge responses).
 */
let ioServer: Server | null = null;

// ── Shared party/lobby registry (module scope) ────────────────────────────
// Lives beside ioServer so HTTP routes (challenge accept) can provision a
// real lobby room for a resolved match. Inside setupSocketIO the per-socket
// handlers mutate the SAME map, so parties created by either path share one
// source of truth for the lobby directory / game-state relay.
let parties = new Map<string, Party>();
/** challenge id -> partyId for lobbies provisioned on challenge accept. */
let challengeLobbyByChallengeId = new Map<string, string>();
/** partyId -> kind for lobbies provisioned by the queue matcher or the
 * challenge-accept path. These are 2-player resolved matches: the whole
 * lobby ends the moment either player leaves or disconnects. */
let resolvedMatchLobbies = new Map<string, "challenge" | "matchmaking">();
/** Resolves an artist name outside the per-connection closure (HTTP-triggered
 * provisioning still shows real names in the lobby directory). */
let resolvePresenceMeta: (userId: string) => { artistName?: string } = () => ({});

/**
 * Authoritative lobby directory broadcast at module scope so lobbies
 * provisioned by HTTP routes enter the same directory as socket-created ones.
 */
const broadcastLobbyDirectory = (): void => {
  if (!ioServer) return;
  const lobbies = Array.from(parties.entries()).map(([partyId, party]) => ({
    partyId,
    gameId: party.gameId,
    leaderId: party.leaderId,
    leaderName:
      resolvePresenceMeta(party.leaderId).artistName || party.leaderId,
    memberCount: party.members.length,
    maxPlayers: PARTY_MAX_PLAYERS,
    status: "open",
    members: party.members,
  }));
  ioServer.emit("lobby_list", lobbies);
};

/** Notify both sides of a resolved challenge which room to join. */
const emitChallengeLobbyReady = (args: {
  challengerId: string;
  opponentId: string;
  partyId: string;
  gameId: string;
  challengeId: string;
}): void => {
  if (!ioServer) return;
  const payload = {
    partyId: args.partyId,
    gameId: args.gameId,
    challengeId: args.challengeId,
    challengerId: args.challengerId,
    opponentId: args.opponentId,
  };
  ioServer.to(args.challengerId).emit("challenge_lobby_ready", payload);
  ioServer.to(args.opponentId).emit("challenge_lobby_ready", payload);
};

/**
 * Provision a 2-player lobby room for an ACCEPTED challenge. Idempotent per
 * challenge id so concurrent accept paths (REST + socket) converge on one
 * room. Returns the partyId (null when no socket server is up yet).
 */
export const provisionChallengeLobby = (challenge: {
  id: number;
  fromUserId: string;
  toUserId: string;
  gameId: string;
}): string | null => {
  if (!ioServer) return null;
  const challengeId = String(challenge.id);
  const existing = challengeLobbyByChallengeId.get(challengeId);
  if (existing) {
    emitChallengeLobbyReady({
      challengerId: challenge.fromUserId,
      opponentId: challenge.toUserId,
      partyId: existing,
      gameId: challenge.gameId,
      challengeId,
    });
    return existing;
  }
  const partyId = `party_${randomUUID()}`;
  parties.set(partyId, {
    leaderId: challenge.fromUserId,
    gameId: challenge.gameId,
    members: [
      {
        userId: challenge.fromUserId,
        artistName:
          resolvePresenceMeta(challenge.fromUserId).artistName ||
          challenge.fromUserId,
      },
      {
        userId: challenge.toUserId,
        artistName:
          resolvePresenceMeta(challenge.toUserId).artistName ||
          challenge.toUserId,
      },
    ],
  });
  challengeLobbyByChallengeId.set(challengeId, partyId);
  resolvedMatchLobbies.set(partyId, "challenge");
  emitChallengeLobbyReady({
    challengerId: challenge.fromUserId,
    opponentId: challenge.toUserId,
    partyId,
    gameId: challenge.gameId,
    challengeId,
  });
  broadcastLobbyDirectory();
  return partyId;
};

/**
 * End a resolved challenge/matchmaking lobby. A 2-player match cannot
 * continue with one side gone, so the whole room is torn down and the
 * surviving player is told the match ended. Registry entries are dropped
 * so the next challenge/match is never served a stale room.
 */
export const endResolvedMatchLobby = (
  partyId: string,
  reason: "player_left" | "player_vacated" | "disconnected",
): void => {
  const party = parties.get(partyId);
  if (!party || !resolvedMatchLobbies.has(partyId)) return;
  parties.delete(partyId);
  resolvedMatchLobbies.delete(partyId);
  challengeLobbyByChallengeId.forEach((pid, challengeId) => {
    if (pid === partyId) challengeLobbyByChallengeId.delete(challengeId);
  });
  ioServer?.to(getPartyRoom(partyId)).emit("party_ended", { partyId, reason });
};

/**
 * Emit a challenge-response update to both the challenger and the recipient
 * so their inboxes/outgoing-challenge state converge in realtime. When the
 * response ACCEPTS, a real 2-player lobby room is provisioned so both sides
 * land in the SAME match (score sync, lobby chat, spectate discovery).
 */
export const emitChallengeResponse = (challenge: {
  id: number;
  fromUserId: string;
  toUserId: string;
  gameId: string;
  status: string;
  timestamp: number;
}): void => {
  if (!ioServer) return;
  const payload: Record<string, unknown> = {
    id: challenge.id,
    fromUserId: challenge.fromUserId,
    toUserId: challenge.toUserId,
    gameId: challenge.gameId,
    status: challenge.status,
    timestamp: challenge.timestamp,
  };
  if (challenge.status === "accepted") {
    const partyId = provisionChallengeLobby(challenge);
    if (partyId) payload.partyId = partyId;
  }
  ioServer.to(challenge.fromUserId).emit("challenge_response", payload);
  ioServer.to(challenge.toUserId).emit("challenge_response", payload);
};

/*
 * Socket.io social + studio-collaboration server, ported from the legacy
 * server/ backend. Attach to the same HTTP server as the REST API.
 */
export const setupSocketIO = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        "https://smuvejeffpresents.com",
        "https://www.smuvejeffpresents.com",
        "http://localhost:4200",
      ],
      methods: ["GET", "POST"],
    },
  });
  // Keep the module-level handle in sync so HTTP routes can emit to users.
  ioServer = io;
  // Fresh module-level party registry per server boot — re-invoking
  // setupSocketIO (tests) must never inherit stale lobbies from a prior run.
  parties.clear();
  challengeLobbyByChallengeId.clear();
  resolvedMatchLobbies.clear();

  const presence = new Map<string, { socketId: string; metadata: PresenceMeta }>();
  // Every live socket per user. A user may hold multiple sockets (social +
  // matchmaking), so presence must survive the loss of any ONE of them.
  const socketIdsByUser = new Map<string, Set<string>>();
  const rooms = new Map<string, Set<string>>();
  const matchmakingQueues = new Map<string, QueueEntry[]>();
  // Split-screen peer registry lives at SERVER scope — a per-connection map
  // (the old bug) meant host and guest each saw their own private registry
  // and cross-device pairing never actually converged.
  const splitScreenPeers = new Map<
    string,
    { hostId: string; guestId: string }
  >();

  const getSender = (socket: {
    handshake: { auth?: Record<string, unknown>; headers?: Record<string, unknown> };
  }): AuthUser | null => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        String(
          (socket.handshake.headers?.authorization as string | undefined) || "",
        ).split(" ")[1];
      if (!token) return null;
      const payload = jwt.verify(token, JWT_SECRET) as {
        userId?: unknown;
        role?: unknown;
      };
      if (!payload?.userId) return null;
      return { userId: Number(payload.userId), role: String(payload.role ?? "user") };
    } catch {
      return null;
    }
  };

  const broadcastOnlineUsers = () => {
    const users = Array.from(presence.entries()).map(([userId, data]) => ({
      userId,
      ...data.metadata,
      online: true,
    }));
    io.emit("users_online", users);
  };

  /**
   * Authoritative lobby directory. The server owns party/lobby state, so
   * every create/join/leave/launch re-broadcasts the full list and clients
   * REPLACE their local accumulation (no client-side ghost lobbies).
   */
  const broadcastLobbyList = () => broadcastLobbyDirectory();

  const syncInbox = async (userId: string) => {
    try {
      await AppDataSource.createQueryBuilder()
        .update("game_challenges")
        // Property keys — TypeORM throws on column-name keys (e.g. updated_at)
        // for entity-backed updates.
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          `status = 'pending' AND to_user_id = :userId AND created_at < (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
          { userId },
        )
        .execute();
      const chalRows = await AppDataSource.createQueryBuilder()
        .select([
          `c.id as "id"`,
          `c.from_user_id as "fromUserId"`,
          `c.from_user_name as "fromUserName"`,
          `c.to_user_id as "toUserId"`,
          `c.game_id as "gameId"`,
          `c.game_title as "gameTitle"`,
          `c.message as "message"`,
          `c.status as "status"`,
          `EXTRACT(EPOCH FROM c.created_at)::bigint * 1000 as "timestamp"`,
        ])
        .from("game_challenges", "c")
        .where(
          `(c.to_user_id = :userId OR c.from_user_id = :userId) AND c.created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days')`,
          { userId },
        )
        .orderBy("c.created_at", "DESC")
        .limit(50)
        .getRawMany();
      const challenges = chalRows.map((r) => ({
        id: Number(r.id),
        fromUserId: r.fromUserId,
        fromUserName: r.fromUserName,
        toUserId: r.toUserId,
        gameId: r.gameId,
        gameName: r.gameTitle || r.gameId,
        message: r.message,
        status: r.status,
        timestamp: Number(r.timestamp),
      }));
      io.to(userId).emit("challenge_inbox_sync", challenges);

      const notifRows = await AppDataSource.createQueryBuilder()
        .select([
          `n.id as "id"`,
          `n.type as "type"`,
          `n.title as "title"`,
          `n.body as "body"`,
          `n.payload as "payload"`,
          `n.is_read as "isRead"`,
          `EXTRACT(EPOCH FROM n.created_at)::bigint * 1000 as "timestamp"`,
        ])
        .from("notifications", "n")
        .where("n.user_id = :userId", { userId })
        .orderBy("n.created_at", "DESC")
        .limit(30)
        .getRawMany();
      const notifications = notifRows.map((r) => ({
        id: Number(r.id),
        type: r.type,
        title: r.title,
        body: r.body,
        payload: r.payload ?? {},
        read: r.isRead,
        timestamp: Number(r.timestamp),
      }));
      io.to(userId).emit("notification_sync", notifications);
    } catch (err) {
      console.error("Auto-sync error on register_presence:", err);
    }
  };

  const getSenderMeta = (userId: string): PresenceMeta =>
    presence.get(userId)?.metadata || {};
  // Give the module-level directory/provisioning code access to names.
  resolvePresenceMeta = (userId: string) => getSenderMeta(userId);

  // Authenticate the handshake in middleware so an unauthenticated or
  // garbage-token client is rejected with `connect_error` instead of
  // briefly connecting and then being disconnected from the connection
  // handler. The verified identity is stashed on the socket for reuse.
  io.use((socket, next) => {
    const user = getSender(socket);
    if (!user) {
      next(new Error("unauthorized"));
      return;
    }
    (socket as unknown as { authUser?: AuthUser }).authUser = user;
    next();
  });

  io.on("connection", (socket) => {
    const user = (socket as unknown as { authUser?: AuthUser }).authUser;
    if (!user) {
      socket.disconnect();
      return;
    }
    const userId = String(user.userId);
    socket.join(userId);
    const userSockets = socketIdsByUser.get(userId) ?? new Set<string>();
    userSockets.add(socket.id);
    socketIdsByUser.set(userId, userSockets);
    // Give every fresh client the authoritative lobby directory immediately
    // so discovery never depends on receiving a future mutation event.
    broadcastLobbyList();

    // ── Presence ──
    socket.on("register_presence", (data: { metadata?: PresenceMeta } = {}) => {
      presence.set(userId, { socketId: socket.id, metadata: data.metadata || {} });
      broadcastOnlineUsers();
      void syncInbox(userId);
    });

    socket.on("update_status", (data: { metadata?: PresenceMeta } = {}) => {
      const current = presence.get(userId);
      if (current) {
        current.metadata = { ...current.metadata, ...(data.metadata || {}) };
        broadcastOnlineUsers();
      }
    });

    // ── Rooms ──
    socket.on("join_room", async (roomId: string) => {
      if (!validSocketId(roomId)) return;
      for (const [joinedRoomId, members] of rooms) {
        if (members.delete(userId)) socket.leave(joinedRoomId);
        if (members.size === 0) rooms.delete(joinedRoomId);
      }
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId)!.add(userId);
      socket.join(roomId);
      // Deliver persisted history to the joining client only.
      try {
        const history = await listRoomMessages(roomId, 50);
        io.to(userId).emit("room_history", { roomId, messages: history });
      } catch (err) {
        console.error("Room history load error:", err);
      }
    });

    socket.on("request_room_history", async (data: { roomId?: string } = {}) => {
      const { roomId } = data;
      if (!validSocketId(roomId)) return;
      try {
        const history = await listRoomMessages(roomId, 50);
        io.to(userId).emit("room_history", { roomId, messages: history });
      } catch (err) {
        console.error("Room history load error:", err);
      }
    });

    socket.on("send_room_message", async (data: { roomId?: string; message?: string; fromUserName?: string } = {}) => {
      const { roomId, fromUserName } = data;
      const message = normalizeChatMessage(data.message);
      if (!validSocketId(roomId) || !message) return;
      if (isRateLimited(userId, "send_room_message")) return;
      const members = rooms.get(roomId);
      if (!members?.has(userId)) return;
      try {
        const saved = await persistRoomMessage({
          roomId,
          userId,
          userName: typeof fromUserName === "string" ? fromUserName.slice(0, 80) : undefined,
          message,
        });
        io.to(roomId).emit("room_message", {
          id: saved.id,
          roomId,
          fromUserId: userId,
          fromUserName: saved.userName,
          message: saved.message,
          timestamp: saved.timestamp,
        });
      } catch (err) {
        console.error("Room message persist error:", err);
      }
    });

    // ── Private messages ──
    socket.on("send_message", async (data: { toUserId?: string; message?: string } = {}) => {
      const { toUserId } = data;
      const message = normalizeChatMessage(data.message);
      if (!validSocketId(toUserId) || !message) return;
      if (isRateLimited(userId, "send_message")) return;
      // Mutual blocklist: a block in either direction silently drops DMs
      // (no error echo — never reveal block state to the sender).
      if (await isEitherBlocked(userId, toUserId)) return;
      try {
        await persistMessage({ fromUserId: userId, toUserId, message });
        const payload = { fromUserId: userId, toUserId, message, timestamp: Date.now() };
        io.to(toUserId).emit("private_message", payload);
        io.to(userId).emit("private_message", payload);
      } catch (err) {
        console.error("DM Error:", err);
      }
    });

    socket.on("typing", async (data: { toUserId?: string; isTyping?: boolean } = {}) => {
      const { toUserId, isTyping } = data;
      if (!validSocketId(toUserId)) return;
      if (isRateLimited(userId, "typing")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      io.to(toUserId).emit("user_typing", { fromUserId: userId, isTyping: !!isTyping });
    });

    // ── Challenges (persisted) ──
    socket.on("challenge_player", async (data: { toUserId?: string; gameId?: string; message?: string; gameName?: string } = {}) => {
      const { toUserId, gameId, message, gameName } = data;
      if (!toUserId || !gameId) return;
      if (isRateLimited(userId, "challenge_player")) return;
      // Mutual blocklist — createChallenge enforces this too, but dropping
      // at the socket layer avoids pointless DB writes from spammers.
      if (await isEitherBlocked(userId, toUserId)) return;
      const fromUserName = getSenderMeta(userId).artistName || userId;
      try {
        const record = await createChallenge(userId, fromUserName, {
          toUserId,
          gameId,
          gameName,
        });
        await persistNotification({
          userId: toUserId,
          type: "challenge_incoming",
          title: "🎮 Game Challenge",
          body: `${fromUserName} challenged you to ${record.gameName || gameId}`,
          payload: {
            challengeId: record.id,
            fromUserId: userId,
            gameId,
            gameTitle: record.gameName,
          },
        });
        const online = presence.has(toUserId);
        if (online) {
          io.to(toUserId).emit("incoming_challenge", record);
        }
        io.to(userId).emit("challenge_persisted", record);
      } catch (err) {
        console.error("Challenge persist error:", err);
      }
    });

    socket.on("request_inbox_sync", () => {
      void syncInbox(userId);
    });

    // ── Voice signaling (WebRTC relay) ──
    socket.on("voice_signal", async (data: { toUserId?: string; signal?: unknown } = {}) => {
      const { toUserId, signal } = data;
      if (!toUserId || !signal) return;
      if (isRateLimited(userId, "voice_signal")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      io.to(toUserId).emit("voice_signal", { fromUserId: userId, signal });
    });

    // ── Studio sessions ──
    socket.on("create_studio_session", async (data: { sessionId?: string; projectId?: string | null; sessionName?: string } = {}) => {
      try {
        const session = await createStudioSession({
          sessionId: data.sessionId,
          projectId: data.projectId ?? null,
          createdById: userId,
          sessionName: data.sessionName,
        });
        await upsertSessionMember({
          sessionId: session.id,
          userId,
          role: "host",
          status: "active",
        });
        socket.join(getStudioRoom(session.id));
        io.to(userId).emit("studio_session_created", {
          sessionId: session.id,
          projectId: data.projectId ?? null,
          sessionName: data.sessionName || "Studio Session",
        });
      } catch (err) {
        console.error("Create studio session error:", err);
      }
    });

    socket.on("invite_to_studio_session", async (data: { sessionId?: string; toUserId?: string; role?: string } = {}) => {
      const { sessionId, toUserId } = data;
      const role = ["editor", "reviewer", "viewer"].includes(data.role || "")
        ? (data.role as string)
        : "viewer";
      if (!sessionId || !toUserId) return;
      if (isRateLimited(userId, "invite_to_studio_session")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      try {
        if (!(await hasStudioPermission(sessionId, userId, "invite"))) return;
        await upsertSessionMember({ sessionId, userId: toUserId, role, status: "invited" });
        await persistNotification({
          userId: toUserId,
          type: "studio_session_invite",
          title: "🎛️ Studio Session Invite",
          body: `${getSenderMeta(userId).artistName || userId} invited you to collaborate.`,
          payload: { sessionId, role, invitedBy: userId },
        });
        io.to(toUserId).emit("studio_session_invite", { sessionId, invitedBy: userId, role });
      } catch (err) {
        console.error("Invite studio session error:", err);
      }
    });

    socket.on("join_studio_session", async (data: { sessionId?: string } = {}) => {
      const { sessionId } = data;
      if (!sessionId) return;
      try {
        const member = await getStudioMember(sessionId, userId);
        if (!member) return;
        await activateSessionMember(sessionId, userId);
        socket.join(getStudioRoom(sessionId));
        io.to(getStudioRoom(sessionId)).emit("member_joined", { sessionId, userId });
        io.to(userId).emit("session_sync", await buildSessionSyncPayload(sessionId, userId));
      } catch (err) {
        console.error("Join studio session error:", err);
      }
    });

    socket.on("leave_studio_session", (data: { sessionId?: string } = {}) => {
      const { sessionId } = data;
      if (!sessionId) return;
      socket.leave(getStudioRoom(sessionId));
      io.to(getStudioRoom(sessionId)).emit("member_left", { sessionId, userId });
    });

    const studioEventPermission = (eventType?: string): string | null => {
      switch (eventType) {
        case "PROJECT_SYNC":
        case "TRACK_DELTA_SYNC":
          return "edit";
        case "VOICE_INVITE":
        case "VOICE_ACCEPT":
        case "VOICE_DECLINE":
        case "VOICE_END":
          return "voice";
        default:
          // Unknown event types still require edit rights so viewers/invited
          // members can never inject arbitrary events into a session.
          return "edit";
      }
    };

    socket.on("studio_session_event", async (data: { sessionId?: string; event?: { type?: string; fromUserName?: string } & Record<string, unknown> } = {}) => {
      const { sessionId, event } = data;
      if (!sessionId || !event || !event.type) return;
      try {
        const permission = studioEventPermission(event.type);
        if (!(await hasStudioPermission(sessionId, userId, permission))) return;
        io.to(getStudioRoom(sessionId)).emit("studio_session_event", {
          sessionId,
          event: {
            ...event,
            fromUserId: userId,
            fromUserName: getSenderMeta(userId).artistName || event.fromUserName || userId,
          },
        });
      } catch (err) {
        console.error("Studio session event error:", err);
      }
    });

    socket.on("add_studio_comment", async (data: {
      sessionId?: string;
      projectId?: string;
      branchId?: string;
      checkpointId?: string;
      trackId?: string;
      clipId?: string;
      content?: string;
      id?: string;
    } = {}) => {
      const { sessionId, projectId, branchId, checkpointId, trackId, clipId, content } = data;
      if (!sessionId || !projectId || !content) return;
      try {
        if (!(await hasStudioPermission(sessionId, userId, "comment"))) return;
        const commentId = data.id || `comment_${randomUUID()}`;
        await AppDataSource.createQueryBuilder()
          .insert()
          .into("studio_comments")
          // Entity-property keys (column-name keys are dropped by TypeORM's
          // metadata validation and inserted as DEFAULT → NOT NULL errors).
          .values({
            id: commentId,
            sessionId,
            projectId,
            branchId: branchId || null,
            checkpointId: checkpointId || null,
            trackId: trackId || null,
            clipId: clipId || null,
            userId,
            content,
          })
          .execute();
        io.to(getStudioRoom(sessionId)).emit("studio_comment_added", {
          id: commentId,
          sessionId,
          projectId,
          branchId: branchId || null,
          checkpointId: checkpointId || null,
          trackId: trackId || null,
          clipId: clipId || null,
          userId,
          content,
        });
      } catch (err) {
        console.error("Add studio comment error:", err);
      }
    });

    socket.on("resolve_studio_comment", async (data: { sessionId?: string; commentId?: string } = {}) => {
      const { sessionId, commentId } = data;
      if (!sessionId || !commentId) return;
      try {
        if (!(await hasStudioPermission(sessionId, userId, "comment"))) return;
        await AppDataSource.createQueryBuilder()
          .update("studio_comments")
          .set({ resolved: true, updatedAt: new Date() })
          .where("id = :commentId AND session_id = :sessionId", { commentId, sessionId })
          .execute();
        io.to(getStudioRoom(sessionId)).emit("studio_comment_resolved", { commentId, sessionId });
      } catch (err) {
        console.error("Resolve studio comment error:", err);
      }
    });

    socket.on("create_approval_request", async (data: {
      sessionId?: string;
      projectId?: string;
      branchId?: string;
      checkpointId?: string;
      approverIds?: string[];
      id?: string;
    } = {}) => {
      const { sessionId, projectId, branchId, checkpointId, approverIds } = data;
      if (!sessionId || !projectId || !Array.isArray(approverIds)) return;
      try {
        if (!(await hasStudioPermission(sessionId, userId, "review"))) return;
        const approvalId = data.id || `approval_${randomUUID()}`;
        await AppDataSource.createQueryBuilder()
          .insert()
          .into("studio_approvals")
          .values({
            id: approvalId,
            sessionId,
            projectId,
            branchId: branchId || null,
            checkpointId: checkpointId || null,
            createdById: userId,
            approverIds,
          })
          .execute();
        for (const approverId of approverIds) {
          await persistNotification({
            userId: approverId,
            type: "studio_review_request",
            title: "📝 Review Requested",
            body: `${getSenderMeta(userId).artistName || userId} requested a session review.`,
            payload: { approvalId, sessionId, projectId },
          });
          io.to(approverId).emit("approval_requested", {
            approvalId,
            sessionId,
            projectId,
            requestedBy: userId,
          });
        }
      } catch (err) {
        console.error("Create approval request error:", err);
      }
    });

    socket.on("submit_approval", async (data: { approvalId?: string; status?: string; reason?: string } = {}) => {
      const { approvalId, status, reason } = data;
      if (!approvalId || !["approved", "rejected", "revision-requested"].includes(status || "")) return;
      try {
        const rows = await AppDataSource.createQueryBuilder()
          .select(["session_id", "approver_ids", "approval_status"])
          .from("studio_approvals", "a")
          .where("a.id = :approvalId", { approvalId })
          .getRawMany();
        const approval = rows[0];
        if (!approval) return;
        const sessionId = String(approval.session_id);
        if (!(await hasStudioPermission(sessionId, userId, "approve"))) return;
        if (Array.isArray(approval.approver_ids) && !approval.approver_ids.includes(userId)) return;
        const nextStatus = (typeof approval.approval_status === "object" ? approval.approval_status : {}) as Record<string, unknown>;
        nextStatus[userId] = { status, reason: reason || "", timestamp: Date.now() };
        const decisionStates = Object.values(nextStatus).map((entry) => (entry as { status?: string }).status);
        const overallStatus = decisionStates.includes("rejected")
          ? "rejected"
          : decisionStates.length > 0 && decisionStates.every((entry) => entry === "approved")
            ? "approved"
            : decisionStates.includes("revision-requested")
              ? "mixed"
              : "pending";
        await AppDataSource.createQueryBuilder()
          .update("studio_approvals")
          .set({
            approvalStatus: nextStatus,
            overallStatus,
            updatedAt: new Date(),
          })
          .where("id = :approvalId", { approvalId })
          .execute();
        io.to(getStudioRoom(sessionId)).emit("studio_approval_updated", {
          approvalId,
          sessionId,
          approverId: userId,
          status,
          overallStatus,
        });
      } catch (err) {
        console.error("Submit approval error:", err);
      }
    });

    socket.on("send_async_packet", async (data: {
      sessionId?: string;
      toUserId?: string;
      packetType?: string;
      payload?: Record<string, unknown>;
      id?: string;
    } = {}) => {
      const { sessionId, toUserId, packetType, payload } = data;
      if (!sessionId || !toUserId || !packetType) return;
      if (isRateLimited(userId, "send_async_packet")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      try {
        const requiredPermission =
          packetType === "remix_request"
            ? "remix"
            : ["review_request", "revision_request", "approval_request"].includes(packetType)
              ? "review"
              : "edit";
        if (!(await hasStudioPermission(sessionId, userId, requiredPermission))) return;
        const packetId = data.id || `packet_${randomUUID()}`;
        await AppDataSource.createQueryBuilder()
          .insert()
          .into("async_collaboration_packets")
          .values({
            id: packetId,
            sessionId,
            fromUserId: userId,
            toUserId,
            packetType,
            payload: payload || {},
          })
          .execute();
        if (presence.has(toUserId)) {
          io.to(toUserId).emit("async_packet_received", {
            id: packetId,
            sessionId,
            fromUserId: userId,
            toUserId,
            packetType,
            status: "pending",
            payload: payload || {},
            createdAt: Date.now(),
          });
        }
      } catch (err) {
        console.error("Send async packet error:", err);
      }
    });

    socket.on("apply_async_packet", async (data: { packetId?: string; status?: string; responsePayload?: unknown } = {}) => {
      const { packetId, status, responsePayload } = data;
      if (!packetId) return;
      try {
        const rows = await AppDataSource.createQueryBuilder()
          .update("async_collaboration_packets")
          .set({
            status: status || "applied",
            responsePayload: responsePayload ?? null,
            appliedAt: new Date(),
          })
          .where("id = :packetId AND to_user_id = :userId", { packetId, userId })
          .returning(["session_id", "from_user_id"])
          .execute();
        const packet = rows.raw?.[0] ?? rows.generatedMaps?.[0];
        if (!packet) return;
        io.to(String(packet.from_user_id)).emit("async_packet_applied", {
          packetId,
          sessionId: packet.session_id,
          appliedBy: userId,
        });
      } catch (err) {
        console.error("Apply async packet error:", err);
      }
    });

    socket.on("create_remix", async (data: {
      sourceProjectId?: string;
      remixProjectId?: string;
      lineageChain?: unknown[];
      id?: string;
    } = {}) => {
      const { sourceProjectId, remixProjectId, lineageChain } = data;
      if (!remixProjectId) return;
      try {
        const lineageId = data.id || `lineage_${randomUUID()}`;
        const lineage = Array.isArray(lineageChain) ? lineageChain : [];
        await AppDataSource.createQueryBuilder()
          .insert()
          .into("remix_lineage")
          .values({
            id: lineageId,
            remixProjectId,
            sourceProjectId: sourceProjectId || null,
            remixerId: userId,
            lineage,
            depth: Math.max(1, lineage.length || 1),
            attribution: { remixer: getSenderMeta(userId).artistName || userId },
          })
          // Insert values map via entity PROPERTY names; orUpdate arrays are
          // emitted verbatim, so they must be DATABASE column names.
          .orUpdate(
            ["source_project_id", "remixer_id", "lineage", "depth", "attribution"],
            ["remix_project_id"],
          )
          .execute();
        io.to(userId).emit("remix_lineage_created", {
          id: lineageId,
          remixProjectId,
          sourceProjectId: sourceProjectId || null,
        });
      } catch (err) {
        console.error("Create remix lineage error:", err);
      }
    });

    socket.on("request_session_sync", async (data: { sessionId?: string } = {}) => {
      const { sessionId } = data;
      if (!sessionId) return;
      try {
        if (!(await hasStudioPermission(sessionId, userId, null))) return;
        io.to(userId).emit("session_sync", await buildSessionSyncPayload(sessionId, userId));
      } catch (err) {
        console.error("Session sync error:", err);
      }
    });

    // ── Parties / Squads ──
    socket.on("create_party", (data: { partyId?: string; gameId?: string } = {}) => {
      if (isRateLimited(userId, "create_party")) return;
      const partyId = data.partyId || `party_${randomUUID()}`;
      const leaderMeta = getSenderMeta(userId);
      // One lobby per user: creating while in another lobby vacates it so
      // the directory never lists this player twice.
      removeUserFromAllParties();
      parties.set(partyId, {
        leaderId: userId,
        members: [{ userId, artistName: leaderMeta.artistName || userId }],
        gameId: data.gameId || "global",
      });
      socket.join(getPartyRoom(partyId));
      io.to(userId).emit("party_created", {
        partyId,
        leaderId: userId,
        members: [{ userId, artistName: leaderMeta.artistName || userId }],
      });
      broadcastLobbyList();
    });

    socket.on("invite_to_party", async (data: { toUserId?: string; partyId?: string; gameId?: string } = {}) => {
      const { toUserId, partyId, gameId } = data;
      if (!toUserId || !partyId) return;
      if (isRateLimited(userId, "invite_to_party")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      const party = parties.get(partyId);
      if (!party) return;
      io.to(toUserId).emit("party_invite", {
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        partyId,
        gameId: gameId || party.gameId,
      });
    });

    const removeUserFromAllParties = (): boolean => {
      let removed = false;
      parties.forEach((party, partyId) => {
        if (!party.members.some((m) => m.userId === userId)) return;
        // Resolved match lobbies end wholesale when either player vacates —
        // filtering the leaver out would strand the survivor in a dead room.
        if (resolvedMatchLobbies.has(partyId)) {
          removed = true;
          socket.leave(getPartyRoom(partyId));
          endResolvedMatchLobby(partyId, "player_vacated");
          return;
        }
        removed = true;
        party.members = party.members.filter((m) => m.userId !== userId);
        if (party.members.length > 0 && party.leaderId === userId) {
          party.leaderId = party.members[0].userId;
          io.to(getPartyRoom(partyId)).emit("host_transferred", {
            partyId,
            newHostId: party.leaderId,
            newHostName: party.members[0].artistName || party.leaderId,
          });
        }
        if (party.members.length === 0) parties.delete(partyId);
        socket.leave(getPartyRoom(partyId));
        io.to(getPartyRoom(partyId)).emit("user_left_party", { userId });
      });
      return removed;
    };

    socket.on("join_party", (data: { partyId?: string } = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      const party = parties.get(partyId);
      if (!party) {
        // Tell the joiner the lobby is gone so their UI can reset instead of
        // waiting forever for a user_joined_party that will never come.
        io.to(userId).emit("party_join_failed", {
          partyId,
          reason: "lobby_not_found",
        });
        return;
      }
      const alreadyMember = party.members.some((m) => m.userId === userId);
      if (!alreadyMember) {
        // Capacity guard: the directory advertises maxPlayers 4; enforce it
        // so joiners never overflow a full lobby.
        if (party.members.length >= PARTY_MAX_PLAYERS) {
          io.to(userId).emit("party_join_failed", {
            partyId,
            reason: "lobby_full",
          });
          return;
        }
        // One lobby per user: joining a new party always leaves the old one
        // so the directory never shows the same player in two lobbies.
        removeUserFromAllParties();
        const memberMeta = getSenderMeta(userId);
        party.members.push({ userId, artistName: memberMeta.artistName || userId });
      }
      socket.join(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit("user_joined_party", {
        userId,
        artistName: getSenderMeta(userId).artistName || userId,
      });
      broadcastLobbyList();
    });

    socket.on("leave_party", (data: { partyId?: string } = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      // Leaving a resolved challenge/matchmaking lobby ends the WHOLE match:
      // a 2-player game cannot continue with one side gone, and keeping the
      // room around would strand the survivor in a dead lobby.
      if (resolvedMatchLobbies.has(partyId)) {
        endResolvedMatchLobby(partyId, "player_left");
        broadcastLobbyList();
        return;
      }
      const party = parties.get(partyId);
      if (party) {
        party.members = party.members.filter((m) => m.userId !== userId);
        // Host transfer: promote the next member so the lobby stays valid.
        if (party.members.length > 0 && party.leaderId === userId) {
          party.leaderId = party.members[0].userId;
        }
        if (party.members.length === 0) parties.delete(partyId);
      }
      socket.leave(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit("user_left_party", { userId });
      broadcastLobbyList();
    });

    socket.on("party_launch_game", (data: { partyId?: string; gameId?: string } = {}) => {
      const { partyId, gameId } = data;
      if (!partyId || !gameId) return;
      const party = parties.get(partyId);
      if (!party || party.leaderId !== userId) return;
      io.to(getPartyRoom(partyId)).emit("party_launch_game", { partyId, gameId });
      broadcastLobbyList();
    });

    socket.on("send_party_message", (data: { partyId?: string; message?: string } = {}) => {
      const { partyId } = data;
      const message = normalizeChatMessage(data.message);
      const party = partyId ? parties.get(partyId) : undefined;
      if (!validSocketId(partyId) || !message || !party?.members.some((member) => member.userId === userId)) return;
      io.to(getPartyRoom(partyId)).emit("party_message", {
        roomId: partyId,
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        message,
        timestamp: Date.now(),
      });
    });

    // ── In-match multiplayer relays ──
    // The clients emit live-match events (score, chat, replays, spectator
    // reactions) and previously the server had NO handlers for them — the
    // events died on arrival and online matches never actually synced.
    // Each relay is membership-guarded (only players in the lobby room) and
    // rate limited, and uses socket.to(room) so the sender never sees its
    // own packet echoed back.

    socket.on("party_started", (data: { partyId?: string; gameId?: string } = {}) => {
      const { partyId, gameId } = data;
      const party = partyId ? parties.get(partyId) : undefined;
      if (!party || !party.members.some((m) => m.userId === userId)) return;
      if (isRateLimited(userId, "party_started")) return;
      io.to(getPartyRoom(partyId)).emit("party_started", { partyId, gameId });
      broadcastLobbyList();
    });

    socket.on("game_state_update", (update: Record<string, any> = {}) => {
      const { lobbyId } = update;
      const party = lobbyId ? parties.get(lobbyId) : undefined;
      if (!party || !party.members.some((m) => m.userId === userId)) return;
      if (isRateLimited(userId, "game_state_update")) return;
      socket.to(getPartyRoom(lobbyId)).emit("game_state_update", {
        ...update,
        fromUserId: userId,
      });
    });

    socket.on("replay_snapshot", (snapshot: Record<string, any> = {}) => {
      const { lobbyId } = snapshot;
      const party = lobbyId ? parties.get(lobbyId) : undefined;
      if (!party || !party.members.some((m) => m.userId === userId)) return;
      if (isRateLimited(userId, "replay_snapshot")) return;
      socket.to(getPartyRoom(lobbyId)).emit("replay_snapshot", {
        ...snapshot,
        fromUserId: userId,
      });
    });

    // Live lobby chat — the client emits full message objects; keep the
    // legacy send_party_message event above working for older clients too.
    socket.on("lobby_chat_message", (msg: Record<string, any> = {}) => {
      const lobbyId = msg.lobbyId;
      const message = normalizeChatMessage(msg.text ?? msg.message);
      const party = lobbyId ? parties.get(lobbyId) : undefined;
      if (!validSocketId(lobbyId) || !message || !party?.members.some((m) => m.userId === userId)) return;
      if (isRateLimited(userId, "send_party_message")) return;
      socket.to(getPartyRoom(lobbyId)).emit("lobby_chat_message", {
        id:
          typeof msg.id === "string"
            ? msg.id.slice(0, 64)
            : `lobby-msg-${Date.now()}`,
        lobbyId,
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        text: message,
        timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      });
    });

    // Spectators join the party room so live score/chat packets reach them.
    // They cannot SEND party chat/state (relays are membership-guarded).
    socket.on("join_spectate", (data: { lobbyId?: string } = {}) => {
      const { lobbyId } = data;
      if (!validSocketId(lobbyId)) return;
      const party = parties.get(lobbyId);
      if (!party || party.members.length === 0) return;
      if (isRateLimited(userId, "join_spectate")) return;
      socket.join(getPartyRoom(lobbyId));
      io.to(getPartyRoom(lobbyId)).emit("spectator_joined", {
        lobbyId,
        userId,
      });
    });

    socket.on("stop_spectating", () => {
      // Sockets leave rooms on disconnect; kept as a no-op for API symmetry.
    });

    socket.on("spectator_reaction", (r: Record<string, any> = {}) => {
      const { lobbyId } = r;
      if (!validSocketId(lobbyId)) return;
      const party = parties.get(lobbyId);
      if (!party || party.members.length === 0) return;
      if (isRateLimited(userId, "spectator_reaction")) return;
      socket.to(getPartyRoom(lobbyId)).emit("spectator_reaction", {
        ...r,
        fromUserId: userId,
      });
    });

    socket.on("spectator_chat_message", (msg: Record<string, any> = {}) => {
      const { lobbyId } = msg;
      const message = normalizeChatMessage(msg.text);
      if (!validSocketId(lobbyId) || !message) return;
      const party = parties.get(lobbyId);
      if (!party || party.members.length === 0) return;
      if (isRateLimited(userId, "send_party_message")) return;
      socket.to(getPartyRoom(lobbyId)).emit("spectator_chat_message", {
        id: typeof msg.id === "string" ? msg.id.slice(0, 64) : undefined,
        lobbyId,
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        text: message,
        timestamp: Date.now(),
      });
    });

    // ── Matchmaking ──
    socket.on("queue_for_match", (data: { gameId?: string } = {}) => {
      const { gameId } = data;
      if (!gameId) return;
      if (isRateLimited(userId, "queue_for_match")) return;
      if (!matchmakingQueues.has(gameId)) matchmakingQueues.set(gameId, []);
      const queue = matchmakingQueues.get(gameId)!;
      if (!queue.find((q) => q.userId === userId)) {
        queue.push({ userId, socketId: socket.id, timestamp: Date.now() });
      }
      if (queue.length >= 2) {
        const player1 = queue.shift();
        const player2 = queue.shift();
        if (player1 && player2) {
          // Provision a shared lobby for the pair so the matched opponents
          // land in the SAME room: score sync, lobby chat, spectate discovery
          // all work off the parties registry.
          const partyId = `party_${randomUUID()}`;
          parties.set(partyId, {
            leaderId: player1.userId,
            gameId,
            members: [
              {
                userId: player1.userId,
                artistName:
                  getSenderMeta(player1.userId).artistName || player1.userId,
              },
              {
                userId: player2.userId,
                artistName:
                  getSenderMeta(player2.userId).artistName || player2.userId,
              },
            ],
          });
          resolvedMatchLobbies.set(partyId, "matchmaking");
          io.to(player1.userId).emit("match_found", {
            opponentId: player2.userId,
            gameId,
            partyId,
          });
          io.to(player2.userId).emit("match_found", {
            opponentId: player1.userId,
            gameId,
            partyId,
          });
          broadcastLobbyList();
        }
      }
    });

    socket.on("cancel_match", (data: { gameId?: string } = {}) => {
      const { gameId } = data;
      if (!gameId) return;
      const queue = matchmakingQueues.get(gameId);
      if (queue) {
        matchmakingQueues.set(gameId, queue.filter((q) => q.userId !== userId));
      }
    });

    // ── Neural sync ──
    socket.on("neural_sync_request", async (data: { toUserId?: string; syncType?: string } = {}) => {
      const { toUserId, syncType } = data;
      if (!toUserId) return;
      if (isRateLimited(userId, "neural_sync_request")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      io.to(toUserId).emit("neural_sync_invite", {
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        syncType: syncType || "FULL_DASHBOARD",
      });
    });

    socket.on("neural_sync_approve", async (data: { toUserId?: string; syncData?: unknown } = {}) => {
      const { toUserId, syncData } = data;
      if (!toUserId) return;
      if (isRateLimited(userId, "neural_sync_approve")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      io.to(toUserId).emit("neural_sync_complete", {
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        syncData,
      });
    });

    // ── Shareable game invites (live socket path; mirrors REST) ──
    socket.on(
      "issue_game_invite",
      async (data: {
        gameId?: string;
        mode?: InviteMode;
        targetUserId?: string;
        payload?: Record<string, unknown>;
        ttlSeconds?: number;
      } = {}) => {
        const { gameId, mode, targetUserId, payload, ttlSeconds } = data;
        if (!gameId || !mode) {
          socket.emit("issue_game_invite_failed", {
            error: "gameId and mode are required",
          });
          return;
        }
        try {
          const issued = await issueInviteRecord({
            gameId,
            mode,
            createdById: userId,
            targetUserId: targetUserId ?? null,
            payload: payload ?? null,
            ttlSeconds,
          });
          socket.emit("game_invite_issued", issued);
        } catch (err) {
          socket.emit("issue_game_invite_failed", {
            error: (err as Error).message,
          });
        }
      },
    );

    socket.on(
      "redeem_game_invite",
      async (data: { token?: string } = {}) => {
        const { token } = data;
        if (!token) {
          socket.emit("redeem_game_invite_failed", {
            error: "token is required",
          });
          return;
        }
        try {
          const consumed = await consumeInviteRecord(token, userId);
          io.to(userId).emit("game_invite_redeemed", consumed);
        } catch (err) {
          socket.emit("redeem_game_invite_failed", {
            token,
            error: (err as Error).message,
          });
        }
      },
    );

    socket.on(
      "resolve_game_invite",
      async (data: { token?: string } = {}) => {
        const { token } = data;
        if (!token) return;
        try {
          socket.emit("game_invite_resolved", await resolveInviteRecord(token));
        } catch {
          // silent — receiver is best-effort
        }
      },
    );

    // ── Split-screen sync (online co-op where each player runs the game on
    // their own device). The "host" starts the session, emits snapshots;
    // the "guest" mirrors them. We replay state snapshots through a tuple
    //    (lobbyId, snapshotType, payload)
    // so a guest on a slow Wi-Fi connection can drop frames without us
    // queueing an unbounded backlog. ──
    socket.on(
      "split_screen_register",
      (data: { lobbyId?: string; role?: "host" | "guest" } = {}) => {
        const { lobbyId, role } = data;
        if (!lobbyId || (role !== "host" && role !== "guest")) return;
        let pair = splitScreenPeers.get(lobbyId);
        if (!pair) {
          pair = { hostId: "", guestId: "" };
          splitScreenPeers.set(lobbyId, pair);
        }
        // ── Host arbitration ──
        // Whichever socket registers first gets the host slot. A second
        // client claiming host is silently downgraded to guest so two
        // devices opening the same URL don't both think they're hosts.
        const effectiveRole =
          role === "host" && pair.hostId && pair.hostId !== userId
            ? "guest"
            : role;
        // ── Pair capacity ──
        // Split-screen is strictly 2 players. A third device claiming the
        // occupied guest slot is rejected instead of silently stealing it.
        if (effectiveRole === "guest" && pair.guestId && pair.guestId !== userId) {
          io.to(userId).emit("split_screen_pair_full", { lobbyId });
          return;
        }
        if (effectiveRole === "host") pair.hostId = userId;
        else pair.guestId = userId;
        socket.join(`split:${lobbyId}`);
        // Tell the registering client what role we assigned so they can
        // update their UI even on the silent downgrade.
        io.to(userId).emit("split_screen_role_assigned", {
          lobbyId,
          role: effectiveRole,
          requestedRole: role,
        });
        io.to(`split:${lobbyId}`).emit("split_screen_ready", {
          lobbyId,
          hostId: pair.hostId,
          guestId: pair.guestId,
        });
      },
    );

    socket.on(
      "split_screen_sync",
      (data: {
        lobbyId?: string;
        snapshot?: {
          level?: string;
          score?: number;
          position?: { x: number; y: number };
          turn?: "host" | "guest";
          ts?: number;
        };
      } = {}) => {
        const { lobbyId, snapshot } = data;
        if (!lobbyId || !snapshot) return;
        if (isRateLimited(userId, "split_screen_sync")) return;
        // Emit only to the OTHER side of the pair so the originator never
        // sees its own snapshot echoed back. Membership check: only the
        // registered host or guest of THIS pair may feed snapshots — a
        // bystander who knows the lobbyId can never inject state.
        const pair = splitScreenPeers.get(lobbyId);
        if (!pair) return;
        if (pair.hostId !== userId && pair.guestId !== userId) return;
        const partnerId = pair.hostId === userId ? pair.guestId : pair.hostId;
        if (!partnerId) return;
        io.to(partnerId).emit("split_screen_snapshot", {
          lobbyId,
          fromUserId: userId,
          snapshot: {
            ...snapshot,
            ts: snapshot.ts ?? Date.now(),
          },
        });
      },
    );

    socket.on(
      "split_screen_drop",
      (data: { lobbyId?: string } = {}) => {
        const { lobbyId } = data;
        if (!lobbyId) return;
        const pair = splitScreenPeers.get(lobbyId);
        if (!pair) return;
        if (pair.hostId === userId) pair.hostId = "";
        if (pair.guestId === userId) pair.guestId = "";
        if (!pair.hostId && !pair.guestId) {
          splitScreenPeers.delete(lobbyId);
        }
        socket.leave(`split:${lobbyId}`);
        io.to(`split:${lobbyId}`).emit("split_screen_ended", { lobbyId });
      },
    );

    // ── Live-stream / Go-Live lifecycle ──
    socket.on(
      "live_stream_start",
      async (data: {
        platform?: "twitch" | "kick" | "youtube";
        gameId?: string;
        lobbyId?: string;
        payload?: Record<string, unknown>;
      } = {}) => {
        const { platform, gameId, lobbyId, payload } = data;
        if (!platform) {
          socket.emit("live_stream_failed", { error: "platform required" });
          return;
        }
        try {
          const meta = getSenderMeta(userId);
          const issued = await startLiveStream({
            hostId: userId,
            hostDisplayName: meta.artistName,
            platform,
            gameId,
            lobbyId,
            payload,
          });
          // Tell the host the share URL right away so they can paste it
          // into the popup landing page or copy from the side panel.
          socket.emit("live_stream_started", issued);
          // Broadcast presence metadata so peers see a "LIVE" indicator.
          presence.set(userId, {
            socketId: socket.id,
            metadata: {
              ...presence.get(userId)?.metadata,
              live: true,
              livePlatform: platform,
              liveShareToken: issued.shareToken,
              liveGameId: issued.gameId ?? undefined,
            },
          });
          broadcastOnlineUsers();
        } catch (err) {
          socket.emit("live_stream_failed", {
            platform,
            error: (err as Error).message,
          });
        }
      },
    );

    socket.on(
      "live_stream_end",
      async (data: { streamId?: number } = {}) => {
        try {
          const result = await endLiveStream(userId, false);
          presence.set(userId, {
            socketId: socket.id,
            metadata: {
              ...presence.get(userId)?.metadata,
              live: false,
            },
          });
          broadcastOnlineUsers();
          io.to(userId).emit("live_stream_ended", result);
        } catch (err) {
          socket.emit("live_stream_failed", {
            stage: "end",
            error: (err as Error).message,
          });
        }
      },
    );

    socket.on(
      "live_stream_redeem",
      async (data: { token?: string } = {}) => {
        const { token } = data;
        if (!token) {
          socket.emit("live_stream_failed", { error: "token required" });
          return;
        }
        try {
          const resolved = await redeemViewerJoin(token);
          // Read the host's split-screen / co-op lobby from the row and
          // bridge the viewer into the lobby in one tap.
          const stream = await findStreamByToken(token);
          if (stream?.lobbyId) {
            io.to(stream.lobbyId).emit("live_stream_viewer_joined", {
              streamId: stream.id,
              viewerId: userId,
              viewerName: getSenderMeta(userId).artistName || userId,
            });
          }
          socket.emit("live_stream_redeem_ok", resolved);
        } catch (err) {
          socket.emit("live_stream_failed", {
            stage: "redeem",
            error: (err as Error).message,
          });
        }
      },
    );

    socket.on(
      "live_stream_resolve",
      async (data: { token?: string } = {}) => {
        const { token } = data;
        if (!token) return;
        try {
          socket.emit(
            "live_stream_resolved",
            await resolveViewerJoin(token)
          );
        } catch {
          // silent — receiver is best-effort
        }
      },
    );

    // ── Legacy squad handlers (kept for compatibility) ──
    socket.on("INITIALIZE_SQUAD", () => {
      const squadId = `squad_${randomUUID()}`;
      socket.join(squadId);
      io.to(userId).emit("SQUAD_CREATED", { squadId, members: [userId] });
    });

    socket.on("SEND_DIRECT_MESSAGE", async (data: { toUserId?: string; message?: string } = {}) => {
      const { toUserId } = data;
      const message = normalizeChatMessage(data.message);
      if (!validSocketId(toUserId) || !message) return;
      if (isRateLimited(userId, "send_message")) return;
      if (await isEitherBlocked(userId, toUserId)) return;
      try {
        await persistMessage({ fromUserId: userId, toUserId, message });
        io.to(toUserId).emit("RECEIVE_DIRECT_MESSAGE", {
          fromUserId: userId,
          message,
          timestamp: new Date(),
        });
      } catch (err) {
        console.error("DM Error:", err);
      }
    });

    socket.on("disconnect", () => {
      // Only drop presence when the LAST socket for this user disconnects —
      // the social and matchmaking clients each hold their own socket, and
      // losing one must not flicker the user offline while the other lives.
      const userSockets = socketIdsByUser.get(userId);
      userSockets?.delete(socket.id);
      if (!userSockets || userSockets.size === 0) {
        socketIdsByUser.delete(userId);
        presence.delete(userId);
        rateBuckets.delete(userId);
        broadcastOnlineUsers();
      }
      matchmakingQueues.forEach((queue, gameId) => {
        matchmakingQueues.set(gameId, queue.filter((q) => q.userId !== userId));
      });
      // Remove the user from any parties/lobbies so the authoritative lobby
      // directory never shows ghost lobbies for disconnected players, and
      // promote the next member when the leader drops.
      let partyChanged = false;
      parties.forEach((party, partyId) => {
        if (!party.members.some((m) => m.userId === userId)) return;
        partyChanged = true;
        // A resolved challenge/match lobby dies with its player — the pair
        // cannot continue, so tear the room down instead of ghosting it.
        if (resolvedMatchLobbies.has(partyId)) {
          endResolvedMatchLobby(partyId, "disconnected");
          return;
        }
        party.members = party.members.filter((m) => m.userId !== userId);
        if (party.members.length === 0) {
          parties.delete(partyId);
        } else if (party.leaderId === userId) {
          party.leaderId = party.members[0].userId;
          io.to(getPartyRoom(partyId)).emit("host_transferred", {
            partyId,
            newHostId: party.leaderId,
            newHostName: party.members[0].artistName || party.leaderId,
          });
        }
      });
      if (partyChanged) broadcastLobbyList();
      // Clean up any split-screen session this user was hosting or joining
      // so the orphan peer immediately gets a split_screen_ended event.
      splitScreenPeers.forEach((pair, lobbyId) => {
        if (pair.hostId !== userId && pair.guestId !== userId) return;
        const partnerId =
          pair.hostId === userId ? pair.guestId : pair.hostId;
        if (pair.hostId === userId) pair.hostId = "";
        if (pair.guestId === userId) pair.guestId = "";
        if (!pair.hostId && !pair.guestId) {
          splitScreenPeers.delete(lobbyId);
        } else if (partnerId) {
          io.to(partnerId).emit("split_screen_ended", {
            lobbyId,
            reason: "peer_disconnected",
          });
        }
      });
      // Mark host offline-live on disconnect when no other socket remains.
      const meta = { ...(presence.get(userId)?.metadata ?? {}) } as Record<
        string,
        unknown
      >;
      if (meta.live) {
        meta.live = false;
        presence.set(userId, { socketId: socket.id, metadata: meta });
        void endLiveStream(userId, false).catch(() => undefined);
        broadcastOnlineUsers();
      }
    });
  });

  return io;
};

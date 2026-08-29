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
  persistMessage,
  persistNotification,
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

/**
 * Emit a challenge-response update to both the challenger and the recipient
 * so their inboxes/outgoing-challenge state converge in realtime.
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
  const payload = {
    id: challenge.id,
    fromUserId: challenge.fromUserId,
    toUserId: challenge.toUserId,
    gameId: challenge.gameId,
    status: challenge.status,
    timestamp: challenge.timestamp,
  };
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

  const presence = new Map<string, { socketId: string; metadata: PresenceMeta }>();
  // Every live socket per user. A user may hold multiple sockets (social +
  // matchmaking), so presence must survive the loss of any ONE of them.
  const socketIdsByUser = new Map<string, Set<string>>();
  const rooms = new Map<string, Set<string>>();
  const parties = new Map<string, Party>();
  const matchmakingQueues = new Map<string, QueueEntry[]>();

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

  const syncInbox = async (userId: string) => {
    try {
      await AppDataSource.createQueryBuilder()
        .update("game_challenges")
        .set({ status: "expired", updated_at: new Date() })
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
    socket.on("join_room", (roomId: string) => {
      if (!validSocketId(roomId)) return;
      for (const [joinedRoomId, members] of rooms) {
        if (members.delete(userId)) socket.leave(joinedRoomId);
        if (members.size === 0) rooms.delete(joinedRoomId);
      }
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId)!.add(userId);
      socket.join(roomId);
    });

    socket.on("send_room_message", (data: { roomId?: string; message?: string; fromUserName?: string } = {}) => {
      const { roomId, fromUserName } = data;
      const message = normalizeChatMessage(data.message);
      if (!validSocketId(roomId) || !message) return;
      const members = rooms.get(roomId);
      if (!members?.has(userId)) return;
      io.to(roomId).emit("room_message", {
        roomId,
        fromUserId: userId,
        fromUserName: typeof fromUserName === "string" ? fromUserName.slice(0, 80) : userId,
        message,
        timestamp: Date.now(),
      });
    });

    // ── Private messages ──
    socket.on("send_message", async (data: { toUserId?: string; message?: string } = {}) => {
      const { toUserId } = data;
      const message = normalizeChatMessage(data.message);
      if (!validSocketId(toUserId) || !message) return;
      try {
        await persistMessage({ fromUserId: userId, toUserId, message });
        const payload = { fromUserId: userId, toUserId, message, timestamp: Date.now() };
        io.to(toUserId).emit("private_message", payload);
        io.to(userId).emit("private_message", payload);
      } catch (err) {
        console.error("DM Error:", err);
      }
    });

    socket.on("typing", (data: { toUserId?: string; isTyping?: boolean } = {}) => {
      const { toUserId, isTyping } = data;
      if (!validSocketId(toUserId)) return;
      io.to(toUserId).emit("user_typing", { fromUserId: userId, isTyping: !!isTyping });
    });

    // ── Challenges (persisted) ──
    socket.on("challenge_player", async (data: { toUserId?: string; gameId?: string; message?: string; gameName?: string } = {}) => {
      const { toUserId, gameId, message, gameName } = data;
      if (!toUserId || !gameId) return;
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
    socket.on("voice_signal", (data: { toUserId?: string; signal?: unknown } = {}) => {
      const { toUserId, signal } = data;
      if (!toUserId || !signal) return;
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
          .values({
            id: commentId,
            session_id: sessionId,
            project_id: projectId,
            branch_id: branchId || null,
            checkpoint_id: checkpointId || null,
            track_id: trackId || null,
            clip_id: clipId || null,
            user_id: userId,
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
          .set({ resolved: true, updated_at: new Date() })
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
            session_id: sessionId,
            project_id: projectId,
            branch_id: branchId || null,
            checkpoint_id: checkpointId || null,
            created_by_id: userId,
            approver_ids: approverIds,
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
          .set({ approval_status: nextStatus, overall_status: overallStatus, updated_at: new Date() })
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
            session_id: sessionId,
            from_user_id: userId,
            to_user_id: toUserId,
            packet_type: packetType,
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
            response_payload: responsePayload ?? null,
            applied_at: new Date(),
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
            remix_project_id: remixProjectId,
            source_project_id: sourceProjectId || null,
            remixer_id: userId,
            lineage,
            depth: Math.max(1, lineage.length || 1),
            attribution: { remixer: getSenderMeta(userId).artistName || userId },
          })
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
      const partyId = data.partyId || `party_${randomUUID()}`;
      const leaderMeta = getSenderMeta(userId);
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
    });

    socket.on("invite_to_party", (data: { toUserId?: string; partyId?: string; gameId?: string } = {}) => {
      const { toUserId, partyId, gameId } = data;
      if (!toUserId || !partyId) return;
      const party = parties.get(partyId);
      if (!party) return;
      io.to(toUserId).emit("party_invite", {
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        partyId,
        gameId: gameId || party.gameId,
      });
    });

    socket.on("join_party", (data: { partyId?: string } = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      const party = parties.get(partyId);
      if (!party) return;
      const memberMeta = getSenderMeta(userId);
      if (!party.members.find((m) => m.userId === userId)) {
        party.members.push({ userId, artistName: memberMeta.artistName || userId });
      }
      socket.join(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit("user_joined_party", {
        userId,
        artistName: memberMeta.artistName || userId,
      });
    });

    socket.on("leave_party", (data: { partyId?: string } = {}) => {
      const { partyId } = data;
      if (!partyId) return;
      const party = parties.get(partyId);
      if (party) {
        party.members = party.members.filter((m) => m.userId !== userId);
        if (party.members.length === 0) parties.delete(partyId);
      }
      socket.leave(getPartyRoom(partyId));
      io.to(getPartyRoom(partyId)).emit("user_left_party", { userId });
    });

    socket.on("party_launch_game", (data: { partyId?: string; gameId?: string } = {}) => {
      const { partyId, gameId } = data;
      if (!partyId || !gameId) return;
      const party = parties.get(partyId);
      if (!party || party.leaderId !== userId) return;
      io.to(getPartyRoom(partyId)).emit("party_launch_game", { partyId, gameId });
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

    // ── Matchmaking ──
    socket.on("queue_for_match", (data: { gameId?: string } = {}) => {
      const { gameId } = data;
      if (!gameId) return;
      if (!matchmakingQueues.has(gameId)) matchmakingQueues.set(gameId, []);
      const queue = matchmakingQueues.get(gameId)!;
      if (!queue.find((q) => q.userId === userId)) {
        queue.push({ userId, socketId: socket.id, timestamp: Date.now() });
      }
      if (queue.length >= 2) {
        const player1 = queue.shift();
        const player2 = queue.shift();
        if (player1 && player2) {
          io.to(player1.userId).emit("match_found", { opponentId: player2.userId, gameId });
          io.to(player2.userId).emit("match_found", { opponentId: player1.userId, gameId });
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
    socket.on("neural_sync_request", (data: { toUserId?: string; syncType?: string } = {}) => {
      const { toUserId, syncType } = data;
      if (!toUserId) return;
      io.to(toUserId).emit("neural_sync_invite", {
        fromUserId: userId,
        fromUserName: getSenderMeta(userId).artistName || userId,
        syncType: syncType || "FULL_DASHBOARD",
      });
    });

    socket.on("neural_sync_approve", (data: { toUserId?: string; syncData?: unknown } = {}) => {
      const { toUserId, syncData } = data;
      if (!toUserId) return;
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
    const splitScreenPeers = new Map<
      string,
      { hostId: string; guestId: string }
    >();

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
        // Emit only to the OTHER side of the pair so the originator never
        // sees its own snapshot echoed back.
        const pair = splitScreenPeers.get(lobbyId);
        if (!pair) return;
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
        broadcastOnlineUsers();
      }
      matchmakingQueues.forEach((queue, gameId) => {
        matchmakingQueues.set(gameId, queue.filter((q) => q.userId !== userId));
      });
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

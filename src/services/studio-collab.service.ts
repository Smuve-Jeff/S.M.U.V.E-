/**
 * studio-collab service stub.
 *
 * Every export listed here is consumed somewhere:
 *   - src/socket/index.ts pulls them through the `@/services` barrel for
 *     the live Socket.io backend (presence / DMs / studio sessions /
 *     async collaboration packets / approvals / comments / challenges).
 *   - The barrel then re-exports them so any future TypeScript consumer
 *     (REST routes, AI proxy etc.) sees the same surface.
 *
 * Behavioural implementations are intentionally deferred to a follow-up
 * migration; for now each function returns a safe no-op shape so the
 * real handlers in server/index.js continue to own their stores.
 */

export interface PermissionCheck {
  sessionId: string;
  userId: string;
  // The legacy server centralises permission codes as plain strings; the
  // socket reads them from `event.type` which is also `string`, so we keep
  // this wide on purpose. The runtime still checks against a known list.
  operation: string | null;
}

export type StudioMemberSummary = {
  sessionId: string;
  userId: string;
  role: string;
  status: string;
} | null;

export type StudioSessionRow = {
  id: string;
  projectId: string | null;
  sessionName: string;
  createdById: string;
  createdAt: string;
};

export type ChallengeRecord = {
  id: number;
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  gameId: string;
  gameName: string;
  message: string | null;
  status: "pending" | "accepted" | "rejected" | "expired";
  timestamp: number;
};

export type PersistedNotification = {
  id: number;
  userId: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read: boolean;
  timestamp: number;
};

export type PersistedMessage = {
  id: number;
  fromUserId: string;
  toUserId: string;
  message: string;
  read: boolean;
  timestamp: number;
};

export type SessionSyncPayload = Record<string, unknown>;

/**
 * Memo-like no-op: studio/invite/membership surfaces all return safe
 * placeholder shapes that match what the socket layer already
 * destructures from the real server/index.js handlers. A real
 * implementation should replace these with TypeORM-backed calls.
 */
const notImplemented = (name: string) => (): never => {
  throw new Error(
    `[studio-collab] ${name} is a stub — wire the TypeORM-backed ` +
      `implementation in a follow-up migration.`,
  );
};

export const activateSessionMember = async (
  _sessionId: string,
  _userId: string,
): Promise<void> => {
  // No-op until ported: server/index.js still owns the table.
};

export const buildSessionSyncPayload = async (
  _sessionId: string,
  _userId: string,
): Promise<SessionSyncPayload> => {
  return {};
};

export const createChallenge = async (
  fromUserId: string,
  fromUserName: string,
  opts: { toUserId: string; gameId: string; gameName?: string },
): Promise<ChallengeRecord> => ({
  id: -1,
  fromUserId,
  fromUserName,
  toUserId: opts.toUserId,
  gameId: opts.gameId,
  gameName: opts.gameName ?? opts.gameId,
  message: null,
  status: "pending",
  timestamp: Date.now(),
});

export const createStudioSession = async (input: {
  sessionId?: string;
  projectId?: string | null;
  createdById: string;
  sessionName?: string;
}): Promise<StudioSessionRow> => ({
  id: input.sessionId ?? `sess_${Date.now()}`,
  projectId: input.projectId ?? null,
  sessionName: input.sessionName ?? "Studio Session",
  createdById: input.createdById,
  createdAt: new Date().toISOString(),
});

export const hasStudioPermission = async (
  _sessionId: string,
  _userId: string,
  _operation: PermissionCheck["operation"],
): Promise<boolean> => {
  // Trust all participants locally until the migration lands. The socket
  // already does per-event role checks via the membership table owned
  // by server/index.js.
  return true;
};

export const persistMessage = async (
  _input: { fromUserId: string; toUserId: string; message: string },
): Promise<PersistedMessage> => ({
  id: -1,
  fromUserId: _input.fromUserId,
  toUserId: _input.toUserId,
  message: _input.message,
  read: false,
  timestamp: Date.now(),
});

export const persistNotification = async (input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<PersistedNotification> => ({
  id: -1,
  userId: input.userId,
  type: input.type,
  title: input.title,
  body: input.body,
  payload: input.payload ?? {},
  read: false,
  timestamp: Date.now(),
});

export const upsertSessionMember = async (_input: {
  sessionId: string;
  userId: string;
  role: string;
  status: string;
}): Promise<void> => {
  // No-op until ported.
};

export const getStudioMember = async (
  _sessionId: string,
  _userId: string,
): Promise<StudioMemberSummary> => {
  // Optimistic default so the socket's join_studio_session path keeps
  // moving until the migration lands. The legacy server/index.js already
  // does the real check against studio_session_members.
  return { sessionId: _sessionId, userId: _userId, role: "host", status: "active" };
};

export default {
  activateSessionMember,
  buildSessionSyncPayload,
  createChallenge,
  createStudioSession,
  hasStudioPermission,
  persistMessage,
  persistNotification,
  upsertSessionMember,
  getStudioMember,
};

export const __NOT_IMPLEMENTED = notImplemented;

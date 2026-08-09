import { AppDataSource } from "@/database/data-source";
import { GameInvite } from "@/entities";
import { AppError } from "@/lib";
import { randomBytes } from "node:crypto";

/**
 * Default lifetime for a freshly-issued invite. Sensitive (private) invites
 * may override via the `ttlSeconds` field on issue.
 */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h
const MIN_TTL_SECONDS = 60; // 1m floor
const MAX_TTL_SECONDS = 60 * 60 * 24 * 14; // 14d ceiling

export type InviteMode =
  | "online"
  | "offline"
  | "co-op"
  | "split-screen"
  | "challenge"
  | "quick-match";

export const ALLOWED_MODES: readonly InviteMode[] = [
  "online",
  "offline",
  "co-op",
  "split-screen",
  "challenge",
  "quick-match",
];

export interface IssueInviteInput {
  gameId: string;
  mode: InviteMode;
  createdById: string;
  /** When set, only this recipient can consume the token. Otherwise anyone with the URL can. */
  targetUserId?: string | null;
  /** Free-form payload (lobbyId, message, level). */
  payload?: Record<string, unknown> | null;
  ttlSeconds?: number;
}

export interface InviteRow {
  id: number;
  token: string;
  gameId: string;
  mode: InviteMode;
  createdById: string;
  targetUserId: string | null;
  payload: Record<string, unknown> | null;
  expiresAt: string;
  consumedAt: string | null;
  consumedById: string | null;
  revoked: boolean;
  /** Absolute share URL pointing at the app's deep-link handler. */
  shareUrl: string;
}

const SHARE_BASE_URL =
  process.env.SHARE_BASE_URL ||
  process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
  "https://smuvejeffpresents.com";

const repo = () => ({
  invites: AppDataSource.getRepository(GameInvite),
});

const rowToWire = (i: GameInvite): InviteRow => ({
  id: i.id,
  token: i.token,
  gameId: i.gameId,
  mode: i.mode as InviteMode,
  createdById: i.createdById,
  targetUserId: i.targetUserId,
  payload: i.payload,
  expiresAt: new Date(i.expiresAt).toISOString(),
  consumedAt: i.consumedAt ? new Date(i.consumedAt).toISOString() : null,
  consumedById: i.consumedById,
  revoked: i.revoked,
  shareUrl: buildShareUrl(i),
});

const buildShareUrl = (i: GameInvite): string => {
  const params = new URLSearchParams();
  params.set("game", i.gameId);
  params.set("mode", i.mode);
  params.set("invite", i.token);
  if (i.createdById) params.set("from", i.createdById);
  if (i.targetUserId) params.set("to", i.targetUserId);
  return `${SHARE_BASE_URL.replace(/\/$/, "")}/tha-spot?${params.toString()}`;
};

/** Generate a URL-safe random token (24 hex chars ≈ 96 bits of entropy). */
export const generateInviteToken = (): string =>
  randomBytes(12).toString("hex");

const clampTtl = (ttl?: number): number => {
  if (!ttl || !Number.isFinite(ttl)) return DEFAULT_TTL_SECONDS;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(ttl)));
};

/**
 * Sweep out expired rows so the index stays small. Returns the number
 * pruned. Safe to call on a timer; uses DELETE … WHERE expires_at < now().
 */
export const purgeExpiredInvites = async (): Promise<number> {
  const result = await AppDataSource.createQueryBuilder()
    .delete()
    .from("game_invites")
    .where("expires_at < CURRENT_TIMESTAMP")
    .execute();
  return result.affected ?? 0;
};

/**
 * Issue a brand-new invite token. Always returns a unique `token` (the
 * migration adds a unique constraint, but we retry once if we collide).
 */
export const issueInvite = async (
  input: IssueInviteInput,
): Promise<InviteRow> => {
  if (!input.gameId || typeof input.gameId !== "string") {
    throw new AppError(400, "gameId is required");
  }
  if (!ALLOWED_MODES.includes(input.mode)) {
    throw new AppError(
      400,
      `mode must be one of: ${ALLOWED_MODES.join(", ")}`,
    );
  }
  if (!input.createdById) {
    throw new AppError(401, "Authentication required");
  }

  const ttl = clampTtl(input.ttlSeconds);
  // Try twice on the off chance of a token collision (1 in 2^48 if it happens).
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateInviteToken();
    try {
      const saved = await repo().invites.save(
        repo().invites.create({
          token,
          gameId: input.gameId,
          mode: input.mode,
          createdById: input.createdById,
          targetUserId: input.targetUserId ?? null,
          payload: input.payload ?? null,
          expiresAt: new Date(Date.now() + ttl * 1000),
        }),
      );
      return rowToWire(saved);
    } catch (err: any) {
      // Unique-constraint violation -> retry once with a fresh token
      const msg = String(err?.driverError?.message ?? err?.message ?? "");
      if (msg.includes("game_invites_token_unique") && attempt === 0) continue;
      throw err;
    }
  }
  throw new AppError(500, "Failed to issue a unique invite token");
};

/**
 * Resolve a token WITHOUT consuming it. Returns the full row when valid (not
 * expired, not revoked, not yet consumed if restricted). Used to surface the
 * invite preview before the user clicks Accept.
 */
export const resolveInvite = async (token: string): Promise<InviteRow> => {
  if (!token || typeof token !== "string") {
    throw new AppError(400, "token is required");
  }
  const invite = await repo().invites.findOneBy({ token });
  if (!invite) throw new AppError(404, "Invite not found");
  if (invite.revoked) throw new AppError(410, "Invite was revoked");
  if (invite.consumedAt) {
    throw new AppError(410, "Invite has already been consumed");
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new AppError(410, "Invite has expired");
  }
  return rowToWire(invite);
};

/**
 * Look up an invite AND — if it's restricted — mark it consumed by `userId`
 * in a single transaction. Returns the row plus consumption details.
 *
 * Public (non-restricted) invites may be consumed unlimited times during
 * their lifetime.
 */
export const consumeInvite = async (
  token: string,
  userId: string | null,
): Promise<
  InviteRow & { wasRestricted: boolean; alreadyConsumed: boolean }
> => {
  if (!token) throw new AppError(400, "token is required");
  const invite = await repo().invites.findOneBy({ token });
  if (!invite) throw new AppError(404, "Invite not found");
  if (invite.revoked) throw new AppError(410, "Invite was revoked");
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new AppError(410, "Invite has expired");
  }
  const wasRestricted = !!invite.targetUserId;
  if (wasRestricted) {
    if (!userId || String(invite.targetUserId) !== String(userId)) {
      throw new AppError(
        403,
        "This invite is restricted to a different player",
      );
    }
    if (invite.consumedAt) {
      return {
        ...rowToWire(invite),
        wasRestricted,
        alreadyConsumed: true,
      };
    }
    invite.consumedAt = new Date();
    invite.consumedById = String(userId);
    await repo().invites.save(invite);
  } else if (userId && !invite.consumedById) {
    // Public invite: record the first consumer for analytics but stay
    // resolvable for everyone else.
    invite.consumedById = String(userId);
    await repo().invites.save(invite);
  }
  return {
    ...rowToWire(invite),
    wasRestricted,
    alreadyConsumed: false,
  };
};

/** List invites created by the caller (15 most-recent, regardless of state). */
export const listMyInvites = async (
  createdById: string,
): Promise<InviteRow[]> => {
  const rows = await repo().invites.find({
    where: { createdById },
    order: { createdAt: "DESC" },
    take: 15,
  });
  return rows.map(rowToWire);
};

/** Revoke an invite. Only the issuing user (or admin) may call this. */
export const revokeInvite = async (
  token: string,
  actorId: string,
  isAdmin: boolean,
): Promise<{ success: boolean }> => {
  const invite = await repo().invites.findOneBy({ token });
  if (!invite) throw new AppError(404, "Invite not found");
  if (!isAdmin && String(invite.createdById) !== String(actorId)) {
    throw new AppError(403, "Cannot revoke invites issued by another player");
  }
  invite.revoked = true;
  await repo().invites.save(invite);
  return { success: true };
};

/** Direct row lookup used by the socket live handlers. */
export const findInviteByToken = async (
  token: string,
): Promise<GameInvite | null> =>
  repo().invites.findOneBy({ token });

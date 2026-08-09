import { AppDataSource } from "@/database/data-source";
import { LiveStream } from "@/entities";
import { AppError } from "@/lib";
import { randomBytes } from "node:crypto";

/**
 * Allowed platforms mirror the OAuth popup stub in
 * routes/auth.routes.ts — extending the popup contract goes hand-in-hand
 * with extending this service.
 */
export const LIVE_STREAM_PLATFORMS = ["twitch", "kick", "youtube"] as const;
export type LiveStreamPlatform = (typeof LIVE_STREAM_PLATFORMS)[number];

export interface StartLiveStreamInput {
  hostId: string;
  hostDisplayName?: string;
  platform: LiveStreamPlatform;
  gameId?: string;
  lobbyId?: string;
  payload?: Record<string, unknown> | null;
}

export interface LiveStreamRow {
  id: number;
  shareToken: string;
  hostId: string;
  hostDisplayName: string | null;
  platform: LiveStreamPlatform;
  gameId: string | null;
  lobbyId: string | null;
  payload: Record<string, unknown> | null;
  active: boolean;
  startedAt: string;
  endedAt: string | null;
  viewerJoins: number;
  /**
   * Absolute share URL pointing at `/tha-spot?game=<id>&lobby=<id>&live=<token>`.
   * Viewers who open it land on the tap-to-join overlay.
   */
  shareUrl: string;
}

const SHARE_BASE_URL =
  process.env.SHARE_BASE_URL ||
  process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
  "https://smuvejeffpresents.com";

const repo = () => ({ streams: AppDataSource.getRepository(LiveStream) });

const buildShareUrl = (row: LiveStream): string => {
  const params = new URLSearchParams();
  if (row.gameId) params.set("game", row.gameId);
  if (row.lobbyId) params.set("lobby", row.lobbyId);
  params.set("live", row.shareToken);
  params.set("from", row.hostId);
  return `${SHARE_BASE_URL.replace(/\/$/, "")}/tha-spot?${params.toString()}`;
};

const rowToWire = (row: LiveStream): LiveStreamRow => ({
  id: row.id,
  shareToken: row.shareToken,
  hostId: row.hostId,
  hostDisplayName: row.hostDisplayName,
  platform: row.platform as LiveStreamPlatform,
  gameId: row.gameId,
  lobbyId: row.lobbyId,
  payload: row.payload,
  active: row.active,
  startedAt: new Date(row.startedAt).toISOString(),
  endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
  viewerJoins: row.viewerJoins,
  shareUrl: buildShareUrl(row),
});

const generateShareToken = (): string =>
  // 24 hex chars = 96 bits; matches the GameInvite token scheme.
  randomBytes(12).toString("hex");

/**
 * Issue a new live stream row. The OAuth popup that opens immediately
 * after uses `shareToken` to either complete the row (on auth success)
 * or end it (on popup close without success). Either way the row is
 * pre-recorded so the share URL is deterministic from before the popup
 * is shown.
 */
export const startLiveStream = async (
  input: StartLiveStreamInput
): Promise<LiveStreamRow> => {
  if (!input.hostId) throw new AppError(401, "Authentication required");
  if (!LIVE_STREAM_PLATFORMS.includes(input.platform)) {
    throw new AppError(
      400,
      `platform must be one of: ${LIVE_STREAM_PLATFORMS.join(", ")}`
    );
  }

  // End any other active streams the host is running so we don't leave
  // ghost rows in the index. Host can only be live on one platform at
  // a time per game (matches what the UI also enforces).
  const existing = await repo().streams.find({
    where: { hostId: input.hostId, active: true },
  });
  for (const row of existing) {
    row.active = false;
    row.endedAt = new Date();
  }
  if (existing.length) {
    await repo().streams.save(existing);
  }

  // Token retry: the unique index can collide on regeneration (1 in 2^96)
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateShareToken();
    try {
      const saved = await repo().streams.save(
        repo().streams.create({
          shareToken: token,
          hostId: input.hostId,
          hostDisplayName: input.hostDisplayName ?? null,
          platform: input.platform,
          gameId: input.gameId ?? null,
          lobbyId: input.lobbyId ?? null,
          payload: input.payload ?? null,
          active: true,
        })
      );
      return rowToWire(saved);
    } catch (err: any) {
      const msg = String(err?.driverError?.message ?? err?.message ?? "");
      if (msg.includes("live_streams_share_token_unique") && attempt === 0) {
        continue;
      }
      throw err;
    }
  }
  throw new AppError(500, "Failed to issue a unique live-stream token");
};

/**
 * Return the host's most recently active row regardless of `active` flag.
 * The UI uses this to render a "your last stream" pill and to confirm
 * end-of-stream on graceful shutdown.
 */
export const getCurrentLiveStream = async (
  hostId: string
): Promise<LiveStreamRow | null> => {
  const row = await repo().streams.findOne({
    where: { hostId },
    order: { startedAt: "DESC" },
  });
  return row ? rowToWire(row) : null;
};

/**
 * Mark the host's currently active stream as ended. Idempotent: returns 0
 * if no active row exists so the caller doesn't have to double-check.
 */
export const endLiveStream = async (
  hostId: string,
 isAdmin = false
): Promise<{ success: boolean; streamId: number | null }> => {
  const active = await repo().streams.find({
    where: isAdmin ? { active: true } : { hostId, active: true },
  });
  if (!active.length) {
    if (isAdmin) {
      // Admin "end all" sweep — no rows is still success.
      return { success: true, streamId: null };
    }
    throw new AppError(404, "No active live stream to end");
  }
  for (const row of active) {
    row.active = false;
    row.endedAt = new Date();
  }
  await repo().streams.save(active);
  return { success: true, streamId: active[0]?.id ?? null };
};

/**
 * Resolve a viewer's tap-to-join token WITHOUT consuming. Public route —
 * anyone with the share URL can call it to render a preview card.
 */
export const resolveViewerJoin = async (
  token: string
): Promise<LiveStreamRow> => {
  if (!token) throw new AppError(400, "token is required");
  const row = await repo().streams.findOne({ where: { shareToken: token } });
  if (!row) throw new AppError(404, "Live stream not found");
  if (!row.active) throw new AppError(410, "Live stream has ended");
  return rowToWire(row);
};

/**
 * Record a viewer join + return the resolved row in one round-trip.
 * Increments `viewerJoins` for telemetry dashboards.
 */
export const redeemViewerJoin = async (
  token: string
): Promise<LiveStreamRow> => {
  if (!token) throw new AppError(400, "token is required");
  const row = await repo().streams.findOne({ where: { shareToken: token } });
  if (!row) throw new AppError(404, "Live stream not found");
  if (!row.active) throw new AppError(410, "Live stream has ended");
  row.viewerJoins = (row.viewerJoins ?? 0) + 1;
  await repo().streams.save(row);
  return rowToWire(row);
};

/** Convenience lookup used by the socket layer for low-latency joins. */
export const findStreamByToken = async (
  token: string
): Promise<LiveStream | null> =>
  repo().streams.findOne({ where: { shareToken: token } });

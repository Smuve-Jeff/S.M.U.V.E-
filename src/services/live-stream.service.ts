import { AppDataSource } from "@/database/data-source";
import { LiveStream, LiveStreamViewerJoin } from "@/entities";
import { AppError } from "@/lib";
import { randomBytes } from "node:crypto";

/**
 * Broadcast destinations.
 *
 * `smuve` is the native S.M.U.V.E Live surface: there is no third-party
 * OAuth popup because the share link itself is the broadcast. The other
 * others mirror the OAuth popup stub in routes/auth.routes.ts — extending
 * one contract goes hand-in-hand with extending the other.
 */
export const LIVE_STREAM_PLATFORMS = [
  "smuve",
  "twitch",
  "kick",
  "youtube",
  "tiktok",
] as const;
export type LiveStreamPlatform = (typeof LIVE_STREAM_PLATFORMS)[number];

/**
 * Platforms the Go Live flow can actually broadcast to today: the native
 * S.M.U.V.E room, plus the two providers with a working WHIP -> RTMP ingest.
 *
 * `youtube` and `tiktok` stay in LIVE_STREAM_PLATFORMS so rows created before
 * this matrix was tightened still decode, but a new broadcast cannot be
 * started on them: YouTube's stored grant is read-only and TikTok has no
 * ingest path at all.
 */
export const LIVE_GO_LIVE_PLATFORMS = ["smuve", "twitch", "kick"] as const;
export type GoLivePlatform = (typeof LIVE_GO_LIVE_PLATFORMS)[number];

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

const repo = () => ({
  streams: AppDataSource.getRepository(LiveStream),
  viewerJoins: AppDataSource.getRepository(LiveStreamViewerJoin),
});

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

export const generateShareToken = (): string =>
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
  input: StartLiveStreamInput,
): Promise<LiveStreamRow> => {
  if (!input.hostId) throw new AppError(401, "Authentication required");
  if (!LIVE_GO_LIVE_PLATFORMS.includes(input.platform as GoLivePlatform)) {
    throw new AppError(
      400,
      `platform must be one of: ${LIVE_GO_LIVE_PLATFORMS.join(", ")}`,
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
        }),
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
 * Return the host's active row when one exists, otherwise their most recent
 * row. The UI restores a live session from the active row (so a page reload
 * does not strand a broadcast) and uses the fallback for the "last stream"
 * summary.
 */
export const getCurrentLiveStream = async (
  hostId: string
): Promise<LiveStreamRow | null> => {
  const active = await repo().streams.findOne({
    where: { hostId, active: true },
    order: { startedAt: "DESC" },
  });
  if (active) return rowToWire(active);
  const latest = await repo().streams.findOne({
    where: { hostId },
    order: { startedAt: "DESC" },
  });
  return latest ? rowToWire(latest) : null;
};

/**
 * Active broadcasts for the discovery directory. Presence is per-process and
 * only covers connected clients, so this DB read is what lets a viewer who
 * just signed in (or missed the presence broadcast) still find a live stream.
 */
export const listActiveLiveStreams = async (
  limit = 50
): Promise<LiveStreamRow[]> => {
  const rows = await repo().streams.find({
    where: { active: true },
    order: { startedAt: "DESC" },
    take: Math.min(Math.max(Math.trunc(limit), 1), 100),
  });
  return rows.map(rowToWire);
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
 * A viewer that taps JOIN twice, refreshes the overlay, or comes back later
 * to the same broadcast is still one viewer. Every caller supplies the same
 * per-viewer ID to both redeem paths: the account id for a signed-in viewer,
 * or the stable browser id for a share-link guest. Never key this on an IP
 * address: a household, school or carrier NAT would collapse distinct viewers
 * into one. The unique database row is what makes this durable; a short
 * in-memory window would forget a viewer as soon as it expired.
 */
const LIVE_VIEWER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Normalize a client-supplied viewer id; reject anything we cannot key on. */
export const normalizeLiveViewerId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const id = value.trim().replace(/^guest:/, "");
  return LIVE_VIEWER_ID_PATTERN.test(id) ? id : null;
};

/**
 * The one dedupe key shared by REST and socket redeems. Authentication wins
 * over a supplied id so a guest cannot collide with an account's key.
 */
export const liveViewerKey = (
  userId: string | number | null | undefined,
  viewerId: unknown,
): string | null => {
  const account = userId === null || userId === undefined ? "" : String(userId);
  if (account && !account.startsWith("guest:")) return `user:${account}`;
  const guest = normalizeLiveViewerId(viewerId);
  return guest ? `guest:${guest}` : null;
};
interface DatabaseErrorLike {
  code?: string;
  errno?: number;
  driverError?: { code?: string; errno?: number };
}

const isUniqueViolation = (err: unknown): boolean => {
  const error = err as DatabaseErrorLike | null;
  return (
    error?.code === "23505" ||
    error?.errno === 1062 ||
    error?.driverError?.code === "23505" ||
    error?.driverError?.errno === 1062
  );
};

/**
 * Claim one viewer slot on a stream. The unique index makes the claim itself
 * atomic: the first caller inserts; every later redeem gets a duplicate-key
 * error and leaves `viewerJoins` alone. The count moves in the same
 * transaction as the join row, so a failure between the two statements can
 * never leave a durable join that is permanently missing from the count.
 * Returns true only for the insert that owns the join.
 */
const recordViewerJoin = async (
  streamId: number,
  viewerKey: string,
): Promise<boolean> => {
  try {
    await AppDataSource.transaction(async (manager) => {
      await manager.insert(LiveStreamViewerJoin, { streamId, viewerKey });
      await manager.increment(LiveStream, { id: streamId }, "viewerJoins", 1);
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
};

/**
 * Record a viewer join + return the resolved row in one round-trip.
 * Increments `viewerJoins` for telemetry dashboards, once per viewer per
 * stream. A missing viewer key (invalid/absent guest id) cannot be deduped
 * and keeps the legacy count-every-redeem behavior.
 */
export const redeemViewerJoin = async (
  token: string,
  viewerKey: string | null = null,
): Promise<LiveStreamRow> => {
  if (!token) throw new AppError(400, "token is required");
  const row = await repo().streams.findOne({ where: { shareToken: token } });
  if (!row) throw new AppError(404, "Live stream not found");
  if (!row.active) throw new AppError(410, "Live stream has ended");
  // Scope the durable join to this stream: a viewer who joins two different
  // broadcasts is legitimately two joins.
  if (viewerKey) {
    // The transaction inside also increments atomically, so two different
    // viewers redeeming at the same time both land instead of overwriting
    // each other's read-modify-write.
    await recordViewerJoin(row.id, viewerKey);
  } else {
    // No durable key to dedupe on: keep the legacy count-every-redeem path.
    await repo().streams.increment({ id: row.id }, "viewerJoins", 1);
  }
  // Re-read so a duplicate redeem also reports the current total after any
  // concurrent increments. The durable join row still owns the counting.
  const latest = await repo().streams.findOne({ where: { id: row.id } });
  return rowToWire(latest ?? row);
};

/** Convenience lookup used by the socket layer for low-latency joins. */
export const findStreamByToken = async (
  token: string
): Promise<LiveStream | null> =>
  repo().streams.findOne({ where: { shareToken: token } });

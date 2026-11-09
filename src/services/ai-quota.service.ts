import { AppDataSource } from "@/database/data-source";
import { AiUsageLedger } from "@/entities/AiUsageLedger";

export type AiMediaKind = "image" | "video";

export interface AiQuotaEntry {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
}

export interface AiQuotaStatus {
  image: AiQuotaEntry;
  video: AiQuotaEntry;
}

/** Rolling daily window: the ledger bounds the day, the rate limiters bound
 * the burst (per 15 minutes), and both are per account. */
export const AI_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AI_IMAGE_QUOTA_LIMIT = 100;
export const AI_VIDEO_QUOTA_LIMIT = 20;

export function quotaWindowFor(
  now: number,
  windowMs: number = AI_QUOTA_WINDOW_MS,
): { windowStart: number; resetsAt: number } {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return { windowStart, resetsAt: windowStart + windowMs };
}

export function buildStatus(
  counts: { image: number; video: number },
  at: number,
): AiQuotaStatus {
  const { resetsAt } = quotaWindowFor(at);
  const entry = (raw: number, limit: number): AiQuotaEntry => {
    const used = Math.max(0, raw);
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt: new Date(resetsAt).toISOString(),
    };
  };
  return {
    image: entry(counts.image, AI_IMAGE_QUOTA_LIMIT),
    video: entry(counts.video, AI_VIDEO_QUOTA_LIMIT),
  };
}

const windowStartOf = (row: AiUsageLedger | null): number | null => {
  if (!row) return null;
  const parsed = new Date(row.windowStart).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Today's usage for one account. A ledger outage fails OPEN and logs —
 * a broken counter must never take the media surface down with it — but
 * the outage is visible in the error log rather than silently accepted.
 */
export async function quotaStatus(userId: number): Promise<AiQuotaStatus> {
  const at = Date.now();
  const { windowStart } = quotaWindowFor(at);
  try {
    const row = await AppDataSource.getRepository(AiUsageLedger).findOneBy({
      userId,
    });
    if (windowStartOf(row) !== windowStart) {
      return buildStatus({ image: 0, video: 0 }, at);
    }
    return buildStatus(
      { image: row!.imageCount, video: row!.videoCount },
      at,
    );
  } catch (error) {
    console.error("AI quota read failed; failing open", error);
    return buildStatus({ image: 0, video: 0 }, at);
  }
}

/**
 * Increment one account's counter atomically: the upsert either rolls the
 * window and starts fresh, or adds to the live counts — concurrent calls
 * can never clobber each other into an undercount.
 */
export async function recordAiUsage(
  userId: number,
  kind: AiMediaKind,
): Promise<void> {
  const { windowStart } = quotaWindowFor(Date.now());
  try {
    await AppDataSource.getRepository(AiUsageLedger).query(
      `INSERT INTO "ai_usage_ledger"
         ("user_id", "window_start", "image_count", "video_count", "updated_at")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("user_id") DO UPDATE SET
         "window_start" = EXCLUDED."window_start",
         "image_count" = CASE
           WHEN "ai_usage_ledger"."window_start" <> EXCLUDED."window_start"
           THEN EXCLUDED."image_count"
           ELSE "ai_usage_ledger"."image_count" + EXCLUDED."image_count"
         END,
         "video_count" = CASE
           WHEN "ai_usage_ledger"."window_start" <> EXCLUDED."window_start"
           THEN EXCLUDED."video_count"
           ELSE "ai_usage_ledger"."video_count" + EXCLUDED."video_count"
         END,
         "updated_at" = now()`,
      [
        userId,
        new Date(windowStart),
        kind === "image" ? 1 : 0,
        kind === "video" ? 1 : 0,
      ],
    );
  } catch (error) {
    console.error("AI quota write failed; failing open", error);
  }
}

/**
 * Guard for AI media routes: refuses a request when the account's daily
 * quota is spent, and ledgers one unit on success. Usage is recorded
 * after the response lands, so failed generations never burn quota.
 */
export const aiQuotaGuard = (kind: AiMediaKind) => {
  return async (req: any, res: any, next: any): Promise<void> => {
    const userId = Number(req?.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return next();
    const status = await quotaStatus(userId);
    const entry = status[kind];
    if (entry.used >= entry.limit) {
      res.status(429).json({
        error: `AI ${kind} quota reached for this account. It resets at ${entry.resetsAt}.`,
        quota: status,
      });
      return;
    }
    res.on("finish", () => {
      if (res.statusCode < 400) void recordAiUsage(userId, kind);
    });
    next();
  };
};

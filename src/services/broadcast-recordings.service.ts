import { MEDIA_RELAY_TOKEN, MEDIA_RELAY_URL } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { BroadcastSession } from "@/entities/BroadcastSession";
import { AppError } from "@/lib";
import {
  mintPlaybackTicket,
  playbackPath,
  verifyPlaybackTicket,
} from "@/lib/media-ticket";

/**
 * Recordings live on the relay's volume, named after the relay session
 * (`<relayId>.mp4`). The relay knows nothing about accounts, so this service
 * joins its file list against the sessions this server opened — a host sees
 * their own shows, never another host's.
 */

export interface BroadcastRecording {
  relayId: string;
  platform: string;
  startedAt: string;
  endedAt: string | null;
  /** File name on the relay. */
  name: string;
  bytes: number;
  recordedAt: string;
  /** Where the app downloads it from, relative to the API. */
  downloadPath: string;
  /** Seconds of media, read from the file's own header; null when unknown. */
  durationSeconds: number | null;
  /**
   * A small JPEG frame as a data URL, so an `<img>` needs no token of its own.
   * Null when the relay has no ffmpeg or could not frame the file.
   */
  thumbnail: string | null;
  /** Hours the host asked to keep this show for; null means the default window. */
  keepHours: number | null;
  /** When that promise runs out, if one was made. */
  keepUntil: string | null;
  /**
   * When the sweeper will take this file: the end of the default window, or a
   * longer pin, whichever is later. Null when retention is off or unknown.
   */
  expiresAt: string | null;
}

interface RelayFile {
  name: string;
  bytes: number;
  modifiedAt: string;
  durationSeconds: number | null;
  keepHours: number | null;
  keepUntil: string | null;
}

/** A show can be kept for up to 90 days; the relay enforces the same cap. */
export const MAX_KEEP_HOURS = 90 * 24;

/** Thumbnails are worth fetching, but not for an unbounded history. */
const MAX_THUMBNAILS = 24;
/** The relay spawns ffmpeg for a frame it has not cached yet; do not flood it. */
const THUMBNAIL_CONCURRENCY = 4;

interface Relay {
  base: string;
  token: string;
}

const sessions = () =>
  AppDataSource.getRepository<BroadcastSession>("BroadcastSession");

function relayConfiguration(): Relay | null {
  const base = MEDIA_RELAY_URL.trim().replace(/\/+$/, "");
  return base ? { base, token: MEDIA_RELAY_TOKEN.trim() } : null;
}

async function callRelay(
  relay: Relay,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (relay.token) headers.Authorization = `Bearer ${relay.token}`;
  return fetch(`${relay.base}${path}`, { ...init, headers });
}

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Remember a relay session so its recording can be found later. Best effort: a
 * push that is already running must not fail because bookkeeping did.
 */
export async function rememberBroadcastSession(input: {
  userId: number;
  relayId: string;
  platform: string;
}): Promise<void> {
  try {
    const repo = sessions();
    await repo.save(
      repo.create({
        relayId: input.relayId,
        userId: input.userId,
        platform: input.platform,
      }),
    );
  } catch (error) {
    console.error(
      `[broadcast] could not remember relay session ${input.relayId}: ${errorText(error)}`,
    );
  }
}

/** Close the row when the push stops. Also best effort. */
export async function markBroadcastSessionEnded(relayId: string): Promise<void> {
  try {
    await sessions().update({ relayId }, { endedAt: new Date() });
  } catch (error) {
    console.error(
      `[broadcast] could not close relay session ${relayId}: ${errorText(error)}`,
    );
  }
}

const EMPTY_RELAY_LIST = { files: [] as RelayFile[], retentionHours: 0 };

/** The relay's recordings and its default window, when it keeps any. */
async function relayRecordings(
  relay: Relay,
): Promise<{ files: RelayFile[]; retentionHours: number }> {
  const response = await callRelay(relay, "/recordings", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (response.status === 503) return EMPTY_RELAY_LIST;
  if (!response.ok) {
    throw new AppError(502, "The broadcast relay could not list its recordings.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    recordings?: unknown;
    retentionHours?: unknown;
  };
  const window = Number(payload.retentionHours);
  const retentionHours = Number.isFinite(window) && window > 0 ? window : 0;
  const rows = Array.isArray(payload.recordings) ? payload.recordings : [];
  const files = rows
    .map((row) => {
      const value = (row ?? {}) as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name : "";
      if (!name) return null;
      return {
        name,
        bytes: Number(value.bytes ?? 0) || 0,
        modifiedAt:
          typeof value.modifiedAt === "string" ? value.modifiedAt : "",
        durationSeconds:
          Number(value.durationSeconds) > 0 ? Number(value.durationSeconds) : null,
        keepHours: Number(value.keepHours) > 0 ? Number(value.keepHours) : null,
        keepUntil:
          typeof value.keepUntil === "string" &&
          !Number.isNaN(Date.parse(value.keepUntil))
            ? value.keepUntil
            : null,
      };
    })
    .filter((row): row is RelayFile => !!row);
  return { files, retentionHours };
}

/** A recording belongs to a session when the file is named after it. */
const belongsTo = (name: string, relayId: string): boolean =>
  name === `${relayId}.mp4` || name.startsWith(`${relayId}-`);

/**
 * The host's recordings, joined to their sessions, without any thumbnail
 * lookups. Ownership checks use this: they must not spawn ffmpeg on the relay
 * just to answer a request.
 */
async function collectRecordings(owner: number): Promise<{
  relay: Relay;
  recordings: BroadcastRecording[];
} | null> {
  const relay = relayConfiguration();
  if (!relay) return null;

  const rows = await sessions().find({
    where: { userId: owner },
    order: { startedAt: "DESC" },
    take: 200,
  });
  if (!rows.length) return null;
  const { files, retentionHours } = await relayRecordings(relay);
  if (!files.length) return null;

  const recordings: BroadcastRecording[] = [];
  for (const row of rows) {
    for (const file of files) {
      if (!belongsTo(file.name, row.relayId)) continue;
      const windowEnd =
        retentionHours > 0
          ? Date.parse(file.modifiedAt) + retentionHours * 3_600_000
          : null;
      const pinEnd = file.keepUntil ? Date.parse(file.keepUntil) : null;
      // A file goes when both its window and its pin are over. Math.max would
      // turn a missing deadline into NaN and lose the other one, so collect
      // only the deadlines that exist.
      const deadlines = [windowEnd, pinEnd].filter(
        (value): value is number => value !== null && Number.isFinite(value),
      );
      const sweepAt = deadlines.length ? Math.max(...deadlines) : null;
      recordings.push({
        relayId: row.relayId,
        platform: row.platform,
        startedAt: new Date(row.startedAt).toISOString(),
        endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
        name: file.name,
        bytes: file.bytes,
        recordedAt: file.modifiedAt,
        durationSeconds: file.durationSeconds,
        keepHours: file.keepHours,
        keepUntil: file.keepUntil,
        expiresAt: sweepAt === null ? null : new Date(sweepAt).toISOString(),
        thumbnail: null,
        downloadPath: `/broadcast/recordings/${encodeURIComponent(
          row.relayId,
        )}/download?name=${encodeURIComponent(file.name)}`,
      });
    }
  }
  return {
    relay,
    recordings: recordings.sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt),
    ),
  };
}

/** One frame as a data URL; null whenever it cannot be had. */
async function relayThumbnail(
  relay: Relay,
  name: string,
): Promise<string | null> {
  try {
    const response = await callRelay(
      relay,
      `/recordings/${encodeURIComponent(name)}/thumbnail`,
      { method: "GET" },
    );
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The host's recordings that still exist on the relay, each with its duration
 * and a still frame. Older shows drop out of the list on their own once
 * retention deletes the file.
 */
export async function listBroadcastRecordings(
  userId: number | string,
): Promise<BroadcastRecording[]> {
  const owner = Number(userId);
  if (!Number.isFinite(owner)) return [];
  const collected = await collectRecordings(owner);
  if (!collected) return [];

  const visible = collected.recordings.slice(0, MAX_THUMBNAILS);
  for (let index = 0; index < visible.length; index += THUMBNAIL_CONCURRENCY) {
    await Promise.all(
      visible.slice(index, index + THUMBNAIL_CONCURRENCY).map(async (row) => {
        row.thumbnail = await relayThumbnail(collected.relay, row.name);
      }),
    );
  }
  return collected.recordings;
}

export interface RecordingDownload {
  body: ReadableStream<Uint8Array>;
  bytes: number;
  filename: string;
  /** 200 for the whole file, 206 when the caller asked for a byte range. */
  status: number;
  contentRange: string | null;
}

/**
 * Open one of the host's recordings as a stream. Ownership is proven by the
 * session row, and the file name must be one the relay listed for that session
 * — a name from the request is never joined into a path or proxied directly.
 */
export async function openBroadcastRecording(
  userId: number | string,
  relayId: string,
  name: string,
  options: { range?: string } = {},
): Promise<RecordingDownload> {
  const relay = relayConfiguration();
  if (!relay) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server, so there are no recordings.",
    );
  }
  const owner = Number(userId);
  const id = String(relayId || "");
  if (!Number.isFinite(owner) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AppError(404, "That recording does not exist.");
  }

  const row = await sessions().findOne({ where: { relayId: id } });
  // Same answer for "not yours" and "not there": a host must not be able to
  // probe which relay ids exist.
  if (!row || Number(row.userId) !== owner) {
    throw new AppError(404, "That recording does not exist.");
  }

  const collected = await collectRecordings(owner);
  const match = collected?.recordings.find(
    (recording) => recording.relayId === id && recording.name === name,
  );
  if (!match) throw new AppError(404, "That recording does not exist.");

  const relayHeaders: Record<string, string> = {};
  // A player seeks with byte ranges; pass the range through so the relay can
  // answer 206 instead of streaming the whole show again from the start.
  if (options.range) relayHeaders.Range = options.range;

  const response = await callRelay(
    relay,
    `/recordings/${encodeURIComponent(match.name)}`,
    { method: "GET", headers: relayHeaders },
  );
  if (!response.ok || !response.body) {
    throw new AppError(502, "The relay could not hand over that recording.");
  }
  const length = Number(response.headers.get("content-length") ?? "");
  return {
    body: response.body,
    bytes: Number.isFinite(length) && length > 0 ? length : match.bytes,
    filename: match.name,
    status: response.status === 206 ? 206 : 200,
    contentRange: response.headers.get("content-range"),
  };
}

/**
 * Mint a short-lived URL a `<video>` element can load. Ownership is proven
 * here, once; the media route then trusts only the signed ticket, because a
 * media element cannot send a bearer token and a JWT in a URL would be logged.
 */
export async function issuePlaybackTicket(
  userId: number | string,
  relayId: string,
  name: string,
): Promise<{ path: string; expiresAt: string }> {
  const owner = Number(userId);
  const id = String(relayId || "");
  if (!Number.isFinite(owner) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AppError(404, "That recording does not exist.");
  }
  const collected = await collectRecordings(owner);
  const owned = collected?.recordings.some(
    (recording) => recording.relayId === id && recording.name === name,
  );
  if (!owned) {
    throw new AppError(404, "That recording does not exist.");
  }

  const ticket = mintPlaybackTicket({ userId: owner, relayId: id, name });
  return {
    path: playbackPath(ticket),
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  };
}

/**
 * Keep one of the host's recordings past the default window, or put it back on
 * the default policy with 0 hours. The promise lives beside the file, so it
 * survives a restart of either the API or the relay.
 */
export async function setBroadcastRetention(
  userId: number | string,
  relayId: string,
  name: string,
  hours: number | string,
): Promise<{ keepHours: number | null; keepUntil: string | null }> {
  const value = Number(hours);
  if (!Number.isInteger(value) || value < 0 || value > MAX_KEEP_HOURS) {
    throw new AppError(
      400,
      `Keep a recording for whole hours between 0 and ${MAX_KEEP_HOURS}.`,
    );
  }
  const owner = Number(userId);
  const id = String(relayId || "");
  if (!Number.isFinite(owner) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AppError(404, "That recording does not exist.");
  }
  const collected = await collectRecordings(owner);
  const owned = collected?.recordings.find(
    (recording) => recording.relayId === id && recording.name === name,
  );
  if (!collected || !owned) {
    throw new AppError(404, "That recording does not exist.");
  }

  const failed = new AppError(
    502,
    "The relay could not update that recording's retention.",
  );
  let response: Response;
  try {
    response = await callRelay(
      collected.relay,
      `/recordings/${encodeURIComponent(owned.name)}/retention`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: value }),
      },
    );
  } catch {
    throw failed;
  }
  if (response.status === 404) {
    throw new AppError(404, "That recording does not exist.");
  }
  if (response.status === 400) {
    throw new AppError(
      400,
      `Keep a recording for whole hours between 0 and ${MAX_KEEP_HOURS}.`,
    );
  }
  if (response.status === 503) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server, so there are no recordings.",
    );
  }
  if (!response.ok) throw failed;

  const payload = (await response.json().catch(() => ({}))) as {
    keepHours?: unknown;
    keepUntil?: unknown;
  };
  const kept = Number(payload.keepHours);
  return {
    keepHours: Number.isInteger(kept) && kept > 0 ? kept : null,
    keepUntil:
      typeof payload.keepUntil === "string" &&
      !Number.isNaN(Date.parse(payload.keepUntil))
        ? payload.keepUntil
        : null,
  };
}

/**
 * Delete one of the host's recordings now instead of waiting for retention.
 *
 * Ownership is checked against the session the API opened, and only a name the
 * relay listed for that session is passed on; a request never decides a path.
 * A file that is already gone is success: that is the outcome asked for.
 */
export async function deleteBroadcastRecording(
  userId: number | string,
  relayId: string,
  name: string,
): Promise<void> {
  const owner = Number(userId);
  const id = String(relayId || "");
  if (!Number.isFinite(owner) || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AppError(404, "That recording does not exist.");
  }
  const collected = await collectRecordings(owner);
  const owned = collected?.recordings.find(
    (recording) => recording.relayId === id && recording.name === name,
  );
  if (!collected || !owned) {
    throw new AppError(404, "That recording does not exist.");
  }

  let response: Response;
  try {
    response = await callRelay(
      collected.relay,
      `/recordings/${encodeURIComponent(owned.name)}`,
      { method: "DELETE" },
    );
  } catch {
    throw new AppError(502, "The relay could not delete that recording.");
  }
  if (response.status === 204 || response.status === 404) return;
  if (response.status === 503) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server, so there are no recordings.",
    );
  }
  throw new AppError(502, "The relay could not delete that recording.");
}

/** The claims carried by a media URL, ready for `verifyPlaybackTicket`. */
export function playbackTicketFromQuery(input: {
  userId: unknown;
  relayId: unknown;
  name: unknown;
  expiresAt: unknown;
  signature: unknown;
}): boolean {
  return verifyPlaybackTicket({
    userId: input.userId,
    relayId: input.relayId,
    name: input.name,
    expiresAt: input.expiresAt,
    signature: input.signature,
  });
}

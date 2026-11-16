import { MEDIA_RELAY_TOKEN, MEDIA_RELAY_URL } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { BroadcastSession } from "@/entities/BroadcastSession";
import { AppError } from "@/lib";

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
}

interface RelayFile {
  name: string;
  bytes: number;
  modifiedAt: string;
}

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

/** The relay's recordings, or an empty list when it keeps none. */
async function relayRecordings(relay: Relay): Promise<RelayFile[]> {
  const response = await callRelay(relay, "/recordings", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (response.status === 503) return [];
  if (!response.ok) {
    throw new AppError(502, "The broadcast relay could not list its recordings.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    recordings?: unknown;
  };
  const rows = Array.isArray(payload.recordings) ? payload.recordings : [];
  return rows
    .map((row) => {
      const value = (row ?? {}) as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name : "";
      if (!name) return null;
      return {
        name,
        bytes: Number(value.bytes ?? 0) || 0,
        modifiedAt:
          typeof value.modifiedAt === "string" ? value.modifiedAt : "",
      };
    })
    .filter((row): row is RelayFile => !!row);
}

/** A recording belongs to a session when the file is named after it. */
const belongsTo = (name: string, relayId: string): boolean =>
  name === `${relayId}.mp4` || name.startsWith(`${relayId}-`);

/**
 * The host's recordings that still exist on the relay. Older shows drop out of
 * the list on their own once retention deletes the file.
 */
export async function listBroadcastRecordings(
  userId: number | string,
): Promise<BroadcastRecording[]> {
  const owner = Number(userId);
  if (!Number.isFinite(owner)) return [];
  const relay = relayConfiguration();
  if (!relay) return [];

  const rows = await sessions().find({
    where: { userId: owner },
    order: { startedAt: "DESC" },
    take: 200,
  });
  if (!rows.length) return [];
  const files = await relayRecordings(relay);
  if (!files.length) return [];

  const recordings: BroadcastRecording[] = [];
  for (const row of rows) {
    for (const file of files) {
      if (!belongsTo(file.name, row.relayId)) continue;
      recordings.push({
        relayId: row.relayId,
        platform: row.platform,
        startedAt: new Date(row.startedAt).toISOString(),
        endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
        name: file.name,
        bytes: file.bytes,
        recordedAt: file.modifiedAt,
        downloadPath: `/broadcast/recordings/${encodeURIComponent(
          row.relayId,
        )}/download?name=${encodeURIComponent(file.name)}`,
      });
    }
  }
  return recordings.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export interface RecordingDownload {
  body: ReadableStream<Uint8Array>;
  bytes: number;
  filename: string;
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

  const mine = (await listBroadcastRecordings(owner)).filter(
    (recording) => recording.relayId === id,
  );
  const match = mine.find((recording) => recording.name === name);
  if (!match) throw new AppError(404, "That recording does not exist.");

  const response = await callRelay(
    relay,
    `/recordings/${encodeURIComponent(match.name)}`,
    { method: "GET" },
  );
  if (!response.ok || !response.body) {
    throw new AppError(502, "The relay could not hand over that recording.");
  }
  const length = Number(response.headers.get("content-length") ?? "");
  return {
    body: response.body,
    bytes: Number.isFinite(length) && length > 0 ? length : match.bytes,
    filename: match.name,
  };
}

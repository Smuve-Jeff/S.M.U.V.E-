import {
  MEDIA_RELAY_TOKEN,
  MEDIA_RELAY_URL,
  TWITCH_CLIENT_ID,
  TWITCH_RTMP_URL,
} from "@/config/env";
import { AppDataSource } from "@/database/data-source";
import { StreamingAccount } from "@/entities/StreamingAccount";
import {
  StreamingDestination,
  type IngestPlatform,
} from "@/entities/StreamingDestination";
import { AppError } from "@/lib";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { accessTokenForAccount } from "@/services/streaming-oauth.service";

export const INGEST_PLATFORMS = ["twitch", "kick"] as const;

export interface DestinationStatus {
  platform: IngestPlatform;
  ready: boolean;
  /** What the host sees next to the platform: an account or the next step. */
  detail: string;
}

export interface DestinationOverview {
  platforms: DestinationStatus[];
  /** False means every push answers 503 until a relay is configured. */
  relayConfigured: boolean;
}

export interface IngestSession {
  platform: IngestPlatform;
  relayId: string;
  /** WHIP endpoint the browser publishes to. */
  whipUrl: string;
}

/** Resolved destination. Never leaves the server. */
interface IngestDestination {
  platform: IngestPlatform;
  rtmpUrl: string;
  streamKey: string;
}

const accountRepository = () =>
  AppDataSource.getRepository<StreamingAccount>("StreamingAccount");

const destinationRepository = () =>
  AppDataSource.getRepository<StreamingDestination>("StreamingDestination");

function asPlatform(value: string): IngestPlatform {
  const key = String(value || "").toLowerCase();
  if (!(INGEST_PLATFORMS as readonly string[]).includes(key)) {
    throw new AppError(404, `${key || "That"} is not a broadcast destination.`);
  }
  return key as IngestPlatform;
}

function relayConfiguration(): { base: string; token: string } | null {
  const base = MEDIA_RELAY_URL.trim().replace(/\/+$/, "");
  return base ? { base, token: MEDIA_RELAY_TOKEN.trim() } : null;
}

async function callRelay(
  relay: { base: string; token: string },
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (relay.token) headers.Authorization = `Bearer ${relay.token}`;
  return fetch(`${relay.base}${path}`, { ...init, headers });
}

/**
 * Twitch hands out the key over Helix, so nothing here has to be stored: the
 * key is read at push time with the scope the connect flow already asked for.
 */
async function twitchDestination(userId: number): Promise<IngestDestination> {
  const account = await accountRepository().findOne({
    where: { userId, platform: "twitch" },
  });
  if (!account) {
    throw new AppError(409, "Connect your Twitch channel before pushing a broadcast.");
  }
  const { accessToken } = await accessTokenForAccount(account);
  const response = await fetch(
    `https://api.twitch.tv/helix/streams/key?broadcaster_id=${encodeURIComponent(account.providerAccountId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": TWITCH_CLIENT_ID,
      },
    },
  );
  if (!response.ok) {
    throw new AppError(
      502,
      response.status === 401 || response.status === 403
        ? "Twitch refused the channel link — reconnect Twitch and try again."
        : "Twitch did not return your stream key.",
    );
  }
  const body = (await response.json()) as {
    data?: { stream_key?: string }[];
  };
  const streamKey = body.data?.[0]?.stream_key;
  if (!streamKey) {
    throw new AppError(502, "Twitch did not return your stream key.");
  }
  return { platform: "twitch", rtmpUrl: TWITCH_RTMP_URL, streamKey };
}

async function kickDestination(userId: number): Promise<IngestDestination> {
  const row = await destinationRepository().findOne({
    where: { userId, platform: "kick" },
  });
  if (!row) {
    throw new AppError(
      409,
      "Add your Kick stream URL and key before pushing a broadcast.",
    );
  }
  return {
    platform: "kick",
    rtmpUrl: row.rtmpUrl,
    streamKey: openSecret(row.streamKey),
  };
}

export async function destinationOverview(
  userId: number | string,
): Promise<DestinationOverview> {
  const owner = Number(userId);
  const [twitchAccount, kickRow] = await Promise.all([
    accountRepository().findOne({ where: { userId: owner, platform: "twitch" } }),
    destinationRepository().findOne({ where: { userId: owner, platform: "kick" } }),
  ]);

  const status = (
    platform: IngestPlatform,
    detail: string,
  ): DestinationStatus => ({ platform, ready: !!detail, detail });

  return {
    relayConfigured: !!relayConfiguration(),
    platforms: [
      twitchAccount
        ? status("twitch", `TWITCH — ${twitchAccount.displayName}`)
        : status("twitch", ""),
      kickRow ? status("kick", `KICK — ${ingestHost(kickRow.rtmpUrl)}`) : status("kick", ""),
    ],
  };
}

function ingestHost(rtmpUrl: string): string {
  try {
    return new URL(rtmpUrl).host || "INGEST SET";
  } catch {
    return "INGEST SET";
  }
}

/**
 * Store the Kick destination the host copied from their dashboard. Both values
 * are checked here because a typo would otherwise surface as a silent failure
 * in the middle of a broadcast.
 */
export async function saveKickDestination(
  userId: number | string,
  input: { rtmpUrl?: unknown; streamKey?: unknown },
): Promise<DestinationStatus> {
  const rtmpUrl = typeof input.rtmpUrl === "string" ? input.rtmpUrl.trim() : "";
  const streamKey =
    typeof input.streamKey === "string" ? input.streamKey.trim() : "";

  if (!/^rtmps?:\/\/\S+$/i.test(rtmpUrl)) {
    throw new AppError(
      400,
      "The Kick stream URL must be the rtmps:// address from your creator dashboard.",
    );
  }
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(streamKey)) {
    throw new AppError(400, "That does not look like a Kick stream key.");
  }

  const owner = Number(userId);
  const rows = destinationRepository();
  const existing = await rows.findOne({ where: { userId: owner, platform: "kick" } });
  const values = {
    userId: owner,
    platform: "kick" as const,
    rtmpUrl,
    streamKey: sealSecret(streamKey),
  };
  if (existing) await rows.update({ id: existing.id }, values);
  else await rows.save(rows.create(values));

  return { platform: "kick", ready: true, detail: `KICK — ${ingestHost(rtmpUrl)}` };
}

export async function clearKickDestination(userId: number | string): Promise<void> {
  await destinationRepository().delete({ userId: Number(userId), platform: "kick" });
}

/**
 * Ask the relay to open a session that pulls the browser's WHIP publish and
 * pushes it to the provider's RTMP ingest.
 *
 * The stream key never reaches the browser: the relay receives it server to
 * server, and the host only gets the WHIP URL to publish to.
 */
export async function startIngestSession(
  userId: number | string,
  platform: string,
): Promise<IngestSession> {
  const key = asPlatform(platform);
  const relay = relayConfiguration();
  if (!relay) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server. Set MEDIA_RELAY_URL to a WHIP→RTMP relay.",
    );
  }
  const owner = Number(userId);
  const destination =
    key === "twitch" ? await twitchDestination(owner) : await kickDestination(owner);

  const response = await callRelay(relay, "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      rtmpUrl: destination.rtmpUrl,
      streamKey: destination.streamKey,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id?: unknown;
    whipUrl?: unknown;
  };
  if (!response.ok) {
    throw new AppError(
      502,
      `The broadcast relay refused the session (HTTP ${response.status}).`,
    );
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const whipUrl = typeof payload.whipUrl === "string" ? payload.whipUrl : "";
  if (!id || !/^https?:\/\//i.test(whipUrl)) {
    throw new AppError(502, "The broadcast relay returned an unusable session.");
  }
  return { platform: key, relayId: id, whipUrl };
}

export interface SelfTestSession {
  relayId: string;
  whipUrl: string;
}

export interface SelfTestStatus {
  ready: boolean;
  bytesReceived: number;
  tracks: string[];
  running: boolean;
  error: string | null;
}

/**
 * Open a relay session aimed at the relay's own test sink. No provider key is
 * involved, so this cannot go live on the host's channel by accident.
 */
export async function startSelfTest(): Promise<SelfTestSession> {
  const relay = relayConfiguration();
  if (!relay) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server. Set MEDIA_RELAY_URL to a WHIP→RTMP relay.",
    );
  }
  const response = await callRelay(relay, "/selftest", {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id?: unknown;
    whipUrl?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    const detail =
      typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new AppError(502, `The relay refused the self-test (${detail}).`);
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const whipUrl = typeof payload.whipUrl === "string" ? payload.whipUrl : "";
  if (!id || !/^https?:\/\//i.test(whipUrl)) {
    throw new AppError(502, "The relay returned an unusable self-test session.");
  }
  return { relayId: id, whipUrl };
}

/** What the relay currently knows about one of its sessions. */
interface RelaySessionSnapshot {
  ready: boolean;
  bytesReceived: number;
  tracks: string[];
  /** Bytes ffmpeg has written towards the provider — the egress truth. */
  bytesOut: number;
  stalled: boolean;
  stalledForMs: number;
  bitrateKbps: number;
  drops: number;
  silentMs: number;
  lastDropAt: string | null;
  recoveries: number;
  recovering: boolean;
  lastRecoveryAt: string | null;
  recoveryGaveUp: boolean;
  running: boolean;
  error: string | null;
}

/**
 * Read one relay session. The relay's own watchdog decides what "stalled"
 * means; this only carries its verdict through, so the panel and the API never
 * disagree about a push.
 */
async function readRelaySession(
  relayId: string,
  label: string,
): Promise<RelaySessionSnapshot> {
  const relay = relayConfiguration();
  const id = String(relayId || "");
  if (!relay || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new AppError(400, `That ${label} session is not valid.`);
  }
  const response = await callRelay(relay, `/sessions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    throw new AppError(404, `That ${label} session has already closed.`);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    ready?: unknown;
    bytesReceived?: unknown;
    tracks?: unknown;
    bytesOut?: unknown;
    stalled?: unknown;
    stalledForMs?: unknown;
    bitrateKbps?: unknown;
    drops?: unknown;
    silentMs?: unknown;
    lastDropAt?: unknown;
    recoveries?: unknown;
    recovering?: unknown;
    lastRecoveryAt?: unknown;
    recoveryGaveUp?: unknown;
    running?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    throw new AppError(502, `The relay could not report on the ${label}.`);
  }
  return {
    ready: payload.ready === true,
    bytesReceived: Number(payload.bytesReceived ?? 0) || 0,
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((track) => String(track))
      : [],
    bytesOut: Number(payload.bytesOut ?? 0) || 0,
    stalled: payload.stalled === true,
    stalledForMs: Number(payload.stalledForMs ?? 0) || 0,
    bitrateKbps: Number(payload.bitrateKbps ?? 0) || 0,
    drops: Number(payload.drops ?? 0) || 0,
    silentMs: Number(payload.silentMs ?? 0) || 0,
    lastDropAt: typeof payload.lastDropAt === "string" ? payload.lastDropAt : null,
    recoveries: Number(payload.recoveries ?? 0) || 0,
    recovering: payload.recovering === true,
    lastRecoveryAt:
      typeof payload.lastRecoveryAt === "string" ? payload.lastRecoveryAt : null,
    recoveryGaveUp: payload.recoveryGaveUp === true,
    running: payload.running === true,
    error: typeof payload.error === "string" ? payload.error : null,
  };
}

/** What the relay actually received on a self-test session. */
export async function selfTestStatus(relayId: string): Promise<SelfTestStatus> {
  const snapshot = await readRelaySession(relayId, "self-test");
  return {
    ready: snapshot.ready,
    bytesReceived: snapshot.bytesReceived,
    tracks: snapshot.tracks,
    running: snapshot.running,
    error: snapshot.error,
  };
}

/** Whether a live push is still reaching the provider. */
export interface IngestStatus {
  ready: boolean;
  running: boolean;
  bytesReceived: number;
  bytesOut: number;
  /** The relay saw this session's egress go silent. */
  stalled: boolean;
  stalledForMs: number;
  /** kbit/s the relay measures ffmpeg writing towards the provider. */
  bitrateKbps: number;
  /** Egress drops this session has already recovered from. */
  drops: number;
  /** Total time spent silent across those drops. */
  silentMs: number;
  lastDropAt: string | null;
  /** How many times the relay restarted ffmpeg to bring this push back. */
  recoveries: number;
  recovering: boolean;
  lastRecoveryAt: string | null;
  /** The relay ran out of restart attempts and left the session flagged. */
  recoveryGaveUp: boolean;
  error: string | null;
}

export async function ingestStatus(relayId: string): Promise<IngestStatus> {
  const snapshot = await readRelaySession(relayId, "broadcast");
  return {
    ready: snapshot.ready,
    running: snapshot.running,
    bytesReceived: snapshot.bytesReceived,
    bytesOut: snapshot.bytesOut,
    stalled: snapshot.stalled,
    stalledForMs: snapshot.stalledForMs,
    bitrateKbps: snapshot.bitrateKbps,
    drops: snapshot.drops,
    silentMs: snapshot.silentMs,
    lastDropAt: snapshot.lastDropAt,
    recoveries: snapshot.recoveries,
    recovering: snapshot.recovering,
    lastRecoveryAt: snapshot.lastRecoveryAt,
    recoveryGaveUp: snapshot.recoveryGaveUp,
    error: snapshot.error,
  };
}

/** Close the relay session; a missing relay just means nothing to tear down. */
export async function stopIngestSession(relayId: string): Promise<void> {
  const relay = relayConfiguration();
  const id = String(relayId || "");
  if (!relay || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return;
  try {
    await callRelay(relay, `/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (error) {
    // The relay dropping a session is not worth failing the host's stop press:
    // its own idle timeout cleans up the ffmpeg process.
    console.error(
      `[broadcast] relay session ${id} was not closed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

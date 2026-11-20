import { createHmac } from "node:crypto";
import {
  JWT_SECRET,
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
import {
  markBroadcastSessionEnded,
  rememberBroadcastSession,
} from "@/services/broadcast-recordings.service";

export const CUSTOM_INGEST_PLATFORMS = [
  "custom",
  "custom2",
  "custom3",
  "custom4",
] as const;
export type CustomIngestPlatform = (typeof CUSTOM_INGEST_PLATFORMS)[number];

export const INGEST_PLATFORMS = [
  "twitch",
  "kick",
  "facebook",
  ...CUSTOM_INGEST_PLATFORMS,
] as const;

/** Providers whose RTMP URL and key are entered from their dashboard. */
const MANUAL_INGEST_PLATFORMS = [
  "kick",
  "facebook",
  ...CUSTOM_INGEST_PLATFORMS,
] as const;
type ManualIngestPlatform = (typeof MANUAL_INGEST_PLATFORMS)[number];

const isCustomIngestPlatform = (
  platform: IngestPlatform,
): platform is CustomIngestPlatform =>
  (CUSTOM_INGEST_PLATFORMS as readonly string[]).includes(platform);

const defaultCustomLabel = (platform: CustomIngestPlatform): string =>
  `CUSTOM ${CUSTOM_INGEST_PLATFORMS.indexOf(platform) + 1}`;

export type DestinationVerification =
  | "verified"
  | "unverified"
  | "not-applicable";

export interface DestinationStatus {
  platform: IngestPlatform;
  ready: boolean;
  /** What the host sees next to the platform: an account or the next step. */
  detail: string;
  /** Host-facing name, especially for the generic custom destination. */
  label: string;
  /** Whether the current saved URL + key passed a real destination test. */
  verification: DestinationVerification;
  /** When that pass happened; null unless `verification` is verified. */
  verifiedAt: string | null;
}

export interface DestinationOverview {
  platforms: DestinationStatus[];
  /** False means every push answers 503 until a relay is configured. */
  relayConfigured: boolean;
}

export interface IngestSession {
  /** Primary provider, kept for clients that only understand one output. */
  platform: IngestPlatform;
  /** Every provider sharing this one relay session. */
  platforms: IngestPlatform[];
  relayId: string;
  /** WHIP endpoint the browser publishes to. */
  whipUrl: string;
}

/** Resolved destination. Never leaves the server. */
interface IngestDestination {
  platform: IngestPlatform;
  rtmpUrl: string;
  streamKey: string;
  /** Account-backed destinations have no stored URL/key to verify. */
  source: "manual" | "account";
  /** Facebook only: the Live Video object that must be ended on stop. */
  videoId?: string;
  pageToken?: string;
}

/** One ephemeral destination test the server is willing to certify. */
interface PendingDestinationTest {
  userId: number;
  platform: ManualIngestPlatform;
  fingerprint: string;
  expiresAt: number;
}

const pendingDestinationTests = new Map<string, PendingDestinationTest>();

/**
 * Tie a pass to the exact URL + key without storing either one again. HMAC
 * with the server secret makes the value useless as an offline key oracle.
 */
function destinationFingerprint(rtmpUrl: string, streamKey: string): string {
  return createHmac("sha256", JWT_SECRET)
    .update(rtmpUrl)
    .update("\0")
    .update(streamKey)
    .digest("hex");
}

/** Graph API version for Facebook live ingest; keep in step with the login flow. */
const META_GRAPH_VERSION = "v27.0";

/** Live Videos opened by a push, so STOP can end them instead of leaving them up. */
const facebookLives = new Map<string, { videoId: string; pageToken: string }>();

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

function asManualPlatform(value: string): ManualIngestPlatform {
  const key = String(value || "").toLowerCase();
  if (!(MANUAL_INGEST_PLATFORMS as readonly string[]).includes(key)) {
    throw new AppError(400, `${key || "That"} uses an account connection, not a manual stream key.`);
  }
  return key as ManualIngestPlatform;
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
  return {
    platform: "twitch",
    rtmpUrl: TWITCH_RTMP_URL,
    streamKey,
    source: "account",
  };
}

async function manualDestination(
  userId: number,
  platform: ManualIngestPlatform,
): Promise<IngestDestination> {
  const row = await destinationRepository().findOne({
    where: { userId, platform },
  });
  if (!row) {
    throw new AppError(
      409,
      `Add your ${platform.toUpperCase()} stream URL and key before pushing a broadcast.`,
    );
  }
  return {
    platform,
    rtmpUrl: row.rtmpUrl,
    streamKey: openSecret(row.streamKey),
    source: "manual",
  };
}

/**
 * Facebook with a linked Page: create a Live Video on that Page and push to its
 * ingest URL. Falls back to the host's pasted RTMP row when no Page is linked.
 */
async function facebookDestination(userId: number): Promise<IngestDestination> {
  const account = await accountRepository().findOne({
    where: { userId, platform: "facebook" },
  });
  if (!account?.pageId || !account.pageToken) {
    return manualDestination(userId, "facebook");
  }
  try {
    return await createFacebookLive(
      account.pageId,
      openSecret(account.pageToken),
    );
  } catch (error) {
    // A Page grant without publish_video, or a Page token revoked on Meta's
    // side: a pasted RTMP destination still works, so use it instead of
    // failing a broadcast the host has a working path for.
    const manual = await destinationRepository().findOne({
      where: { userId, platform: "facebook" },
    });
    if (!manual) throw error;
    return {
      platform: "facebook",
      rtmpUrl: manual.rtmpUrl,
      streamKey: openSecret(manual.streamKey),
      source: "manual",
    };
  }
}

async function createFacebookLive(
  pageId: string,
  pageToken: string,
): Promise<IngestDestination> {
  const response = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pageId)}/live_videos`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        status: "LIVE_NOW",
        title: "S.M.U.V.E LIVE",
        access_token: pageToken,
      }).toString(),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    id?: unknown;
    secure_stream_url?: unknown;
  };
  if (!response.ok || typeof payload.secure_stream_url !== "string") {
    throw new AppError(
      502,
      response.status === 401 || response.status === 403
        ? "Facebook refused the Page link — reconnect Facebook and try again."
        : "Facebook did not return a stream URL for this broadcast.",
    );
  }
  const ingest = splitFacebookIngestUrl(payload.secure_stream_url);
  if (!ingest) {
    throw new AppError(502, "Facebook returned a stream URL the relay cannot use.");
  }
  return {
    platform: "facebook",
    rtmpUrl: ingest.rtmpUrl,
    streamKey: ingest.streamKey,
    source: "account",
    videoId: typeof payload.id === "string" ? payload.id : undefined,
    pageToken,
  };
}

/** Split Facebook's `rtmps://host/rtmp/KEY` back into the relay's two fields. */
export function splitFacebookIngestUrl(
  value: string,
): { rtmpUrl: string; streamKey: string } | null {
  const url = String(value || "").trim();
  if (!/^rtmps?:\/\//i.test(url)) return null;
  const cut = url.lastIndexOf("/");
  if (cut <= "rtmps://".length) return null;
  const rtmpUrl = url.slice(0, cut);
  const streamKey = url.slice(cut + 1).split("?")[0];
  if (!/^[A-Za-z0-9_.-]{8,200}$/.test(streamKey)) return null;
  return { rtmpUrl, streamKey };
}

async function endFacebookLive(
  videoId: string,
  pageToken: string,
): Promise<void> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(videoId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          end_live_video: "true",
          access_token: pageToken,
        }).toString(),
      },
    );
    if (!response.ok) {
      console.error(`[broadcast] Facebook would not end live video ${videoId}.`);
    }
  } catch (error) {
    console.error(
      `[broadcast] could not end Facebook live video ${videoId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** A Live Video opened for a session that never started must not stay live. */
async function releaseFacebookLives(
  destinations: IngestDestination[],
): Promise<void> {
  await Promise.all(
    destinations
      .filter((destination) => destination.videoId && destination.pageToken)
      .map((destination) =>
        endFacebookLive(destination.videoId!, destination.pageToken!),
      ),
  );
}

function verifiedAtForRow(row: StreamingDestination): string | null {
  if (!row.verifiedAt || !row.verifiedFingerprint) return null;
  const current = destinationFingerprint(
    row.rtmpUrl,
    openSecret(row.streamKey),
  );
  return current === row.verifiedFingerprint
    ? new Date(row.verifiedAt).toISOString()
    : null;
}

function manualDestinationStatus(
  platform: ManualIngestPlatform,
  row: StreamingDestination,
): DestinationStatus {
  const label =
    row.label?.trim() ||
    (isCustomIngestPlatform(platform)
      ? defaultCustomLabel(platform)
      : platform.toUpperCase());
  const verifiedAt = verifiedAtForRow(row);
  return {
    platform,
    ready: true,
    detail: `${label.toUpperCase()} — ${ingestHost(row.rtmpUrl)}`,
    label,
    verification: verifiedAt ? "verified" : "unverified",
    verifiedAt,
  };
}

function accountDestinationStatus(
  platform: IngestPlatform,
  detail: string,
): DestinationStatus {
  return {
    platform,
    ready: true,
    detail,
    label: platform.toUpperCase(),
    // Twitch and Page-backed Facebook keys are not stored as a URL + key pair,
    // so there is nothing durable to fingerprint here.
    verification: "not-applicable",
    verifiedAt: null,
  };
}

function emptyDestinationStatus(
  platform: IngestPlatform,
  label = platform.toUpperCase(),
): DestinationStatus {
  return {
    platform,
    ready: false,
    detail: "",
    label,
    verification: "not-applicable",
    verifiedAt: null,
  };
}

export async function destinationOverview(
  userId: number | string,
): Promise<DestinationOverview> {
  const owner = Number(userId);
  const [twitchAccount, facebookAccount, kickRow, facebookRow, customRows] =
    await Promise.all([
      accountRepository().findOne({
        where: { userId: owner, platform: "twitch" },
      }),
      accountRepository().findOne({
        where: { userId: owner, platform: "facebook" },
      }),
      destinationRepository().findOne({
        where: { userId: owner, platform: "kick" },
      }),
      destinationRepository().findOne({
        where: { userId: owner, platform: "facebook" },
      }),
      Promise.all(
        CUSTOM_INGEST_PLATFORMS.map((platform) =>
          destinationRepository().findOne({ where: { userId: owner, platform } }),
        ),
      ),
    ]);

  return {
    relayConfigured: !!relayConfiguration(),
    platforms: [
      twitchAccount
        ? accountDestinationStatus(
            "twitch",
            `TWITCH — ${twitchAccount.displayName}`,
          )
        : emptyDestinationStatus("twitch"),
      kickRow
        ? manualDestinationStatus("kick", kickRow)
        : emptyDestinationStatus("kick"),
      facebookAccount?.pageId
        ? accountDestinationStatus(
            "facebook",
            `FACEBOOK — ${facebookAccount.displayName}`,
          )
        : facebookRow
          ? manualDestinationStatus("facebook", facebookRow)
          : emptyDestinationStatus("facebook"),
      ...CUSTOM_INGEST_PLATFORMS.map((platform, index) => {
        const row = customRows[index];
        return row
          ? manualDestinationStatus(platform, row)
          : emptyDestinationStatus(platform, defaultCustomLabel(platform));
      }),
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

/** A custom destination needs a short host-facing name in the picker. */
function customLabel(value: unknown): string {
  const label = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._+&-]{0,39}$/.test(label)) {
    throw new AppError(
      400,
      "Give the custom destination a label (TikTok, Instagram, X, LinkedIn, …).",
    );
  }
  return label;
}

/**
 * Store a manual RTMP destination the host copied from their dashboard. Both
 * values are checked here because a typo would otherwise surface as a silent
 * failure in the middle of a broadcast.
 */
export async function saveManualDestination(
  userId: number | string,
  platform: string,
  input: { rtmpUrl?: unknown; streamKey?: unknown; label?: unknown },
): Promise<DestinationStatus> {
  const key = asManualPlatform(platform);
  const rtmpUrl = typeof input.rtmpUrl === "string" ? input.rtmpUrl.trim() : "";
  const streamKey =
    typeof input.streamKey === "string" ? input.streamKey.trim() : "";
  const label = isCustomIngestPlatform(key)
    ? customLabel(input.label)
    : key.toUpperCase();

  if (!/^rtmps?:\/\/\S+$/i.test(rtmpUrl) || /[|\[\]]/.test(rtmpUrl)) {
    throw new AppError(
      400,
      `The ${label} stream URL must be the rtmps:// address from your creator dashboard.`,
    );
  }
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(streamKey)) {
    throw new AppError(400, `That does not look like a ${label} stream key.`);
  }

  const owner = Number(userId);
  const rows = destinationRepository();
  const existing = await rows.findOne({ where: { userId: owner, platform: key } });
  const fingerprint = destinationFingerprint(rtmpUrl, streamKey);
  // Re-saving the exact same pair does not invalidate a real pass. Any change
  // to either field does, because a pass for the old pair says nothing here.
  const unchanged =
    !!existing &&
    existing.rtmpUrl === rtmpUrl &&
    !!existing.streamKey &&
    openSecret(existing.streamKey) === streamKey;
  const preserveVerification =
    unchanged &&
    !!existing?.verifiedAt &&
    existing.verifiedFingerprint === fingerprint;
  const verifiedAt = preserveVerification ? existing.verifiedAt : null;
  const values = {
    userId: owner,
    platform: key,
    label,
    rtmpUrl,
    streamKey: sealSecret(streamKey),
    verifiedAt,
    verifiedFingerprint: preserveVerification ? fingerprint : null,
  };
  if (existing) await rows.update({ id: existing.id }, values);
  else await rows.save(rows.create(values));

  return {
    platform: key,
    ready: true,
    detail: `${label} — ${ingestHost(rtmpUrl)}`,
    label,
    verification: verifiedAt ? "verified" : "unverified",
    verifiedAt: verifiedAt ? new Date(verifiedAt).toISOString() : null,
  };
}

/**
 * Certify a destination test after checking the relay and the exact stored
 * configuration itself. A client cannot make a row verified by claiming a pass.
 */
export async function verifyDestinationTest(
  userId: number | string,
  platform: string,
  relayId: string,
): Promise<DestinationStatus> {
  const owner = Number(userId);
  const key = asManualPlatform(platform);
  const id = String(relayId || "");
  const pending = pendingDestinationTests.get(id);
  if (
    !pending ||
    pending.userId !== owner ||
    pending.platform !== key ||
    pending.expiresAt <= Date.now()
  ) {
    pendingDestinationTests.delete(id);
    throw new AppError(
      409,
      "That destination test is no longer active — run the test again.",
    );
  }

  const snapshot = await readRelaySession(id, "destination test");
  if (
    !snapshot.running ||
    snapshot.bytesOut <= 0 ||
    snapshot.stalled ||
    snapshot.recoveryGaveUp ||
    snapshot.error
  ) {
    throw new AppError(
      409,
      "The relay has not confirmed media reaching this destination yet.",
    );
  }

  const rows = destinationRepository();
  const row = await rows.findOne({ where: { userId: owner, platform: key } });
  if (!row) {
    throw new AppError(409, "Save this destination before verifying it.");
  }
  const fingerprint = destinationFingerprint(
    row.rtmpUrl,
    openSecret(row.streamKey),
  );
  if (fingerprint !== pending.fingerprint) {
    throw new AppError(
      409,
      "The destination changed during the test — run the test again.",
    );
  }

  const verifiedAt = new Date();
  await rows.update(
    { id: row.id },
    { verifiedAt, verifiedFingerprint: fingerprint },
  );
  pendingDestinationTests.delete(id);
  return manualDestinationStatus(key, {
    ...row,
    verifiedAt,
    verifiedFingerprint: fingerprint,
  });
}

export async function clearManualDestination(
  userId: number | string,
  platform: string,
): Promise<void> {
  const key = asManualPlatform(platform);
  await destinationRepository().delete({ userId: Number(userId), platform: key });
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
  platform: string | string[],
  options: { ephemeral?: boolean } = {},
): Promise<IngestSession> {
  const requested = Array.isArray(platform) ? platform : [platform];
  const keys = [...new Set(requested.map((value) => asPlatform(value)))];
  if (keys.length === 0) {
    throw new AppError(400, "Choose at least one broadcast destination.");
  }
  if (keys.length > 4) {
    throw new AppError(400, "At most 4 broadcast destinations are allowed.");
  }
  const relay = relayConfiguration();
  if (!relay) {
    throw new AppError(
      503,
      "Broadcast push is not configured on this server. Set MEDIA_RELAY_URL to a WHIP→RTMP relay.",
    );
  }
  const owner = Number(userId);
  const destinations = await Promise.all(
    keys.map(async (key): Promise<IngestDestination> => ({
      platform: key,
      ...(key === "twitch"
        ? await twitchDestination(owner)
        : key === "facebook"
          ? await facebookDestination(owner)
          : await manualDestination(owner, key)),
    })),
  );

  const testDestination =
    options.ephemeral && keys.length === 1 && destinations[0].source === "manual"
      ? destinations[0]
      : null;
  const testFingerprint = testDestination
    ? destinationFingerprint(testDestination.rtmpUrl, testDestination.streamKey)
    : null;
  // A new test supersedes the old pass immediately. If the test fails or is
  // interrupted, the destination stays unverified rather than falling back to
  // a pass that may no longer be true.
  if (testDestination) {
    await destinationRepository().update(
      { userId: owner, platform: testDestination.platform },
      { verifiedAt: null, verifiedFingerprint: null },
    );
  }

  let session: { id: string; whipUrl: string };
  try {
    session = await openRelaySession(relay, destinations);
  } catch (error) {
    // A Live Video opened but never pushed would sit on the Page; end it.
    await releaseFacebookLives(destinations);
    throw error;
  }
  const live = destinations.find(
    (destination) => destination.videoId && destination.pageToken,
  );
  if (live?.videoId && live.pageToken) {
    facebookLives.set(session.id, {
      videoId: live.videoId,
      pageToken: live.pageToken,
    });
  }
  // The relay records this session under `id`; the row is what later proves a
  // recording belongs to that host. A destination test is a real publish but
  // not a show, so it must not appear in the recordings list.
  if (!options.ephemeral) {
    await rememberBroadcastSession({
      userId: owner,
      relayId: session.id,
      platform: keys[0],
    });
  } else if (testDestination && testFingerprint) {
    pendingDestinationTests.set(session.id, {
      userId: owner,
      platform: testDestination.platform as ManualIngestPlatform,
      fingerprint: testFingerprint,
      expiresAt: Date.now() + 120_000,
    });
  }
  return {
    platform: keys[0],
    platforms: keys,
    relayId: session.id,
    whipUrl: session.whipUrl,
  };
}

/** Open one relay session that pushes to every resolved destination. */
async function openRelaySession(
  relay: { base: string; token: string },
  destinations: IngestDestination[],
): Promise<{ id: string; whipUrl: string }> {
  const response = await callRelay(relay, "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      destinations: destinations.map((destination) => ({
        rtmpUrl: destination.rtmpUrl,
        streamKey: destination.streamKey,
      })),
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
  return { id, whipUrl };
}

export interface SelfTestSession {
  relayId: string;
  whipUrl: string;
}

/**
 * What the self-test's ingest received, as opposed to what the browser sent.
 * Only present when the sink is the relay's own MediaMTX: a provider ingest has
 * no API to ask, so the relay reports null rather than pretending.
 */
export interface SelfTestIngest {
  path: string;
  reachable: boolean;
  /** MediaMTX's names, e.g. `H264`, `MPEG-4 Audio`. */
  tracks: string[];
  bytesReceived: number;
  /** The audio track that arrived, with the codec an operator knows. */
  audio: { track: string; codec: string } | null;
  /** Why the ingest is incomplete, or null when it is not. */
  problem: string | null;
}

export interface SelfTestStatus {
  ready: boolean;
  bytesReceived: number;
  tracks: string[];
  running: boolean;
  error: string | null;
  ingest: SelfTestIngest | null;
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
/** Parses the relay's ingest report, ignoring anything malformed. */
function readRelayIngest(value: unknown): SelfTestIngest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const audio =
    raw.audio && typeof raw.audio === 'object'
      ? (raw.audio as Record<string, unknown>)
      : null;
  return {
    path: typeof raw.path === 'string' ? raw.path : '',
    reachable: raw.reachable === true,
    tracks: Array.isArray(raw.tracks) ? raw.tracks.map((track) => String(track)) : [],
    bytesReceived: Number(raw.bytesReceived ?? 0) || 0,
    audio:
      audio && typeof audio.codec === 'string'
        ? {
            track: typeof audio.track === 'string' ? audio.track : '',
            codec: audio.codec,
          }
        : null,
    problem: typeof raw.problem === 'string' ? raw.problem : null,
  };
}

interface RelaySessionSnapshot {
  ready: boolean;
  bytesReceived: number;
  tracks: string[];
  ingest: SelfTestIngest | null;
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
    ingest?: unknown;
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
    ingest: readRelayIngest(payload.ingest),
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
    ingest: snapshot.ingest,
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
  if (/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    await markBroadcastSessionEnded(id);
  }
  pendingDestinationTests.delete(id);
  const live = facebookLives.get(id);
  if (live) {
    facebookLives.delete(id);
    await endFacebookLive(live.videoId, live.pageToken);
  }
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

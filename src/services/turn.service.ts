/**
 * ICE server provisioning for S.M.U.V.E Live.
 *
 * Direct peer connections work with STUN on most home networks. Viewers behind
 * symmetric NATs or restrictive firewalls need a relay, so the preferred path
 * is Cloudflare Realtime TURN: the server exchanges its scoped TURN key for
 * short-lived credentials and only the ephemeral values reach the browser.
 *
 * Credentials are cached until shortly before they expire, and the last known
 * good set is served if Cloudflare is temporarily unreachable, so an outage
 * cannot stop a broadcast that already has a working relay allocation.
 */
export interface TurnIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnHealth {
  /** A relay is configured, whether or not it is currently issuing servers. */
  configured: boolean;
  /** Cloudflare Realtime TURN is configured as the managed provider. */
  managed: boolean;
  /** At least one TURN URL was returned to the browser. */
  available: boolean;
  source: "cloudflare" | "static" | "public" | "none";
}

const CLOUDFLARE_TURN_URL = "https://rtc.live.cloudflare.com/v1/turn/keys";
/**
 * Public TURN relay used only when no TURN credentials are configured.
 *
 * Open Relay (Metered) is a free public relay on 80 and 443 — the two ports
 * corporate and mobile firewalls actually allow — so a viewer behind a
 * symmetric NAT can still receive a broadcast on a deployment with no TURN
 * key. Media stays DTLS-SRTP encrypted end to end; the relay forwards packets
 * it cannot read. It is shared and best effort (20 GB/month), so an operator
 * should switch to managed credentials when they can:
 *   TURN_PUBLIC_FALLBACK=off
 * or point TURN_PUBLIC_FALLBACK_URLS at their own relay (e.g. coturn).
 */
const DEFAULT_PUBLIC_TURN_URLS = [
  "turn:openrelay.metered.ca:80",
  "turn:openrelay.metered.ca:80?transport=tcp",
  "turn:openrelay.metered.ca:443",
  "turns:openrelay.metered.ca:443?transport=tcp",
];
const DEFAULT_PUBLIC_TURN_USERNAME = "openrelayproject";
const DEFAULT_PUBLIC_TURN_CREDENTIAL = "openrelayproject";
const DEFAULT_STUN_URLS =
  "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302";
const DEFAULT_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 172_800;
const CACHE_SAFETY_SECONDS = 300;
const FAILURE_BACKOFF_MS = 30_000;

interface CredentialCache {
  key: string;
  expiresAt: number;
  servers: TurnIceServer[];
}

let cache: CredentialCache | null = null;
let failure: { key: string; until: number } | null = null;

const splitUrls = (raw: string | undefined): string[] =>
  (raw || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

const clampTtl = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(60, Math.round(parsed)));
};

const isIceServer = (value: unknown): value is TurnIceServer => {
  if (!value || typeof value !== "object") return false;
  const urls = (value as { urls?: unknown }).urls;
  return (
    (typeof urls === "string" && urls.length > 0) ||
    (Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((url) => typeof url === "string" && url.length > 0))
  );
};

/**
 * The last-resort relay, or null when the operator opted out. Credentials are
 * public by design on the shared relay; pointing the URLs at your own server
 * keeps media on your own infrastructure.
 */
const publicTurnFallback = (): TurnIceServer | null => {
  const mode = (process.env.TURN_PUBLIC_FALLBACK || "").trim().toLowerCase();
  if (mode === "off" || mode === "false" || mode === "0") return null;
  const configured = splitUrls(process.env.TURN_PUBLIC_FALLBACK_URLS);
  return {
    urls: configured.length ? configured : DEFAULT_PUBLIC_TURN_URLS,
    username:
      process.env.TURN_PUBLIC_FALLBACK_USERNAME?.trim() ||
      DEFAULT_PUBLIC_TURN_USERNAME,
    credential:
      process.env.TURN_PUBLIC_FALLBACK_CREDENTIAL?.trim() ||
      DEFAULT_PUBLIC_TURN_CREDENTIAL,
  };
};

/** Fallback STUN, operator TURN, then the shared public relay. */
const fallbackIceServers = (): TurnIceServer[] => {
  const servers: TurnIceServer[] = [];
  const stun = splitUrls(process.env.STUN_URLS || DEFAULT_STUN_URLS);
  if (stun.length) servers.push({ urls: stun });

  const turnUrls = splitUrls(process.env.TURN_URLS);
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (turnUrls.length && username && credential) {
    // An operator-configured relay wins; no third party is involved.
    servers.push({ urls: turnUrls, username, credential });
    return servers;
  }
  const publicRelay = publicTurnFallback();
  if (publicRelay) servers.push(publicRelay);
  return servers;
};

/**
 * Resolve the ICE servers for a browser. Never throws: if managed credentials
 * cannot be obtained, STUN/static TURN still allow direct connections.
 */
export const getIceServers = async (): Promise<TurnIceServer[]> => {
  const fallback = fallbackIceServers();
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !apiToken) return fallback;

  const ttl = clampTtl(process.env.TURN_TTL_SECONDS);
  const cacheKey = `${keyId}:${ttl}`;
  const now = Date.now();
  if (cache && cache.key === cacheKey && cache.expiresAt > now) {
    return cache.servers;
  }
  if (failure && failure.key === cacheKey && failure.until > now) {
    return cache && cache.key === cacheKey ? cache.servers : fallback;
  }

  try {
    const response = await fetch(
      `${CLOUDFLARE_TURN_URL}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) {
      throw new Error(`credential request failed (${response.status})`);
    }
    const payload = (await response.json()) as { iceServers?: unknown };
    const servers = Array.isArray(payload?.iceServers)
      ? payload.iceServers.filter(isIceServer)
      : [];
    if (!servers.length) {
      throw new Error("credential response had no usable ice servers");
    }

    // Refresh with headroom so a peer created near the end of a broadcast
    // never starts with credentials that are about to expire.
    const cacheSeconds = Math.max(60, ttl - CACHE_SAFETY_SECONDS);
    cache = {
      key: cacheKey,
      expiresAt: now + cacheSeconds * 1000,
      servers,
    };
    failure = null;
    return servers;
  } catch (err) {
    failure = { key: cacheKey, until: now + FAILURE_BACKOFF_MS };
    // Log the reason only; the TURN key and API token must never be logged.
    console.warn(
      "[turn] managed TURN credentials unavailable:",
      (err as Error)?.message || "unknown error",
    );
    return cache && cache.key === cacheKey ? cache.servers : fallback;
  }
};

/**
 * Summarize how the current browser would reach a relay. This is safe to
 * expose: it says whether TURN is configured and in use, never the key.
 */
const describeTurn = (servers: TurnIceServer[]): TurnHealth => {
  const urls = servers.flatMap((server) =>
    Array.isArray(server.urls) ? server.urls : [server.urls],
  );
  const turnUrls = urls.filter((url) => /^turns?:/i.test(url));
  const managed = Boolean(
    process.env.CLOUDFLARE_TURN_KEY_ID?.trim() &&
    process.env.CLOUDFLARE_TURN_API_TOKEN?.trim(),
  );
  const source = turnUrls.some((url) => /turn\.cloudflare\.com/i.test(url))
    ? "cloudflare"
    : turnUrls.some((url) =>
          /(openrelay|relay)\.metered\.ca/i.test(url),
        )
      ? "public"
      : turnUrls.length
        ? "static"
        : "none";
  return {
    configured:
      managed ||
      splitUrls(process.env.TURN_URLS).length > 0 ||
      turnUrls.length > 0,
    managed,
    available: turnUrls.length > 0,
    source,
  };
};

/** ICE servers plus the relay health shown in the Go Live dashboard. */
export const getIceConfig = async (): Promise<{
  iceServers: TurnIceServer[];
  turn: TurnHealth;
}> => {
  const iceServers = await getIceServers();
  return { iceServers, turn: describeTurn(iceServers) };
};

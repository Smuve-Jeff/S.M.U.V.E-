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
  source: "cloudflare" | "static" | "none";
}

const CLOUDFLARE_TURN_URL = "https://rtc.live.cloudflare.com/v1/turn/keys";
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

/** Fallback STUN and static TURN configured directly in the environment. */
const fallbackIceServers = (): TurnIceServer[] => {
  const servers: TurnIceServer[] = [];
  const stun = splitUrls(process.env.STUN_URLS || DEFAULT_STUN_URLS);
  if (stun.length) servers.push({ urls: stun });

  const turnUrls = splitUrls(process.env.TURN_URLS);
  const username = process.env.TURN_USERNAME?.trim();
  const credential = process.env.TURN_CREDENTIAL?.trim();
  if (turnUrls.length && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
  }
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
    : turnUrls.length
      ? "static"
      : "none";
  return {
    configured: managed || splitUrls(process.env.TURN_URLS).length > 0,
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

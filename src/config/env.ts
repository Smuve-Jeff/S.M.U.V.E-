import { randomBytes } from "crypto";

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT) || 4000;
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const DB_NAME = process.env.DATABASE_URL?.split("/").pop() || "dbname";
// No committed secret fallback. Production must provide a stable JWT_SECRET;
// development derives an ephemeral per-boot secret so no key material is
// stored in the repository (server tests set JWT_SECRET via setup-jest-server.ts).
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET is required when NODE_ENV=production.");
      })()
    : randomBytes(48).toString("hex"));
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ── Transactional email (Plunk) ────────────────────────────────────────────
// Must be a *secret* key (sk_*): Plunk accepts public keys (pk_*) only on
// /v1/track and rejects them on /v1/send.
export const PLUNK_API_KEY =
  process.env.PLUNK_API_KEY || process.env.PLUNK_SECRET_KEY || "";
// The sender must live on a domain verified in the Plunk project; Plunk
// refuses the send otherwise.
export const PLUNK_FROM_EMAIL =
  process.env.PLUNK_FROM_EMAIL || process.env.EMAIL_FROM || "";
export const PLUNK_FROM_NAME = process.env.PLUNK_FROM_NAME || "S.M.U.V.E. 2.0";

/**
 * Public origin of the Angular app, used for links that leave the API
 * (password reset today). Defaults to the first FRONTEND_URL entry so a
 * same-origin deployment needs no extra configuration.
 */
export const APP_ORIGIN = (
  process.env.APP_ORIGIN ||
  (process.env.FRONTEND_URL || "").split(",")[0] ||
  "http://localhost:4200"
)
  .trim()
  .replace(/\/+$/, "");

// ── Streaming account OAuth (Twitch / YouTube) ─────────────────────────────
// The public origin providers redirect back to. Must match the callback URL
// registered in each provider's app console exactly.
export const API_PUBLIC_URL = (
  process.env.API_PUBLIC_URL ||
  process.env.PUBLIC_API_URL ||
  `http://localhost:${PORT}`
).replace(/\/+$/, "");

export const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
export const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
export const YOUTUBE_CLIENT_ID =
  process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
export const YOUTUBE_CLIENT_SECRET =
  process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
/** 32-byte key (hex or base64) for sealing stored OAuth tokens. Optional: when
 *  blank the key is derived from JWT_SECRET under a distinct label. */
export const OAUTH_TOKEN_KEY = process.env.OAUTH_TOKEN_KEY || "";

// ── Broadcast push (WHIP → RTMP relay) ─────────────────────────────────────
// Twitch and Kick only accept RTMP(S), which a browser cannot send. The host
// publishes WHIP to a relay that pushes RTMP to the provider, so this is the
// control API of that relay:
//   POST   {MEDIA_RELAY_URL}/sessions  { rtmpUrl, streamKey } -> { id, whipUrl }
//   DELETE {MEDIA_RELAY_URL}/sessions/:id
export const MEDIA_RELAY_URL = process.env.MEDIA_RELAY_URL || "";
export const MEDIA_RELAY_TOKEN = process.env.MEDIA_RELAY_TOKEN || "";
/** Twitch ingest base; the stream key is appended by the relay. */
export const TWITCH_RTMP_URL =
  process.env.TWITCH_RTMP_URL || "rtmp://live.twitch.tv/app";

/** How long a password-reset link stays valid. */
export const PASSWORD_RESET_TTL_MINUTES =
  Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30;

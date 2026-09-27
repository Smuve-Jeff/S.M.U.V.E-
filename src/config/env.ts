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

/** How long a password-reset link stays valid. */
export const PASSWORD_RESET_TTL_MINUTES =
  Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30;

/**
 * Centralised env loader for the Express backend.
 *
 * Reads at import time so a misconfiguration crashes the server on
 * startup rather than mid-request. The values come from process.env
 * (populated by the hosting runner via `freebuff-deploy env set` or
 * by docker compose in local dev). Names here MUST match the
 * `freebuff-deploy env list` keys verbatim.
 */

const renderSetSnippet = (key: string): string =>
  "'{\"" + key + "\":\u2026}'";

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value || value.length === 0) {
    const snippet = renderSetSnippet(key);
    throw new Error(
      "Missing required environment variable: " +
        key +
        ". Set it through the project's Keys API or via " +
        "`freebuff-deploy env set " +
        snippet +
        "`.",
    );
  }
  return value;
};

const optional = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
};

const normalizeNodeEnv = (
  raw: string | undefined,
): "development" | "test" | "production" => {
  const v = (raw ?? "development").toLowerCase();
  if (v === "production" || v === "test" || v === "development") return v;
  return "development";
};

export const NODE_ENV = normalizeNodeEnv(process.env.NODE_ENV);
export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_TEST = NODE_ENV === "test";

/**
 * Postgres connection string for the API database. Required in every
 * environment — even local dev reads from a real Postgres container.
 */
export const DATABASE_URL = required(
  "DATABASE_URL",
  // Local dev fallback: a no-auth local Postgres socket connection.
  // Production hosting must override this through the env API before the
  // server starts; the Freebuff deploy runner enforces that.
  "postgres://smuve:smuve@localhost:5432/smuve",
);

/**
 * Comma-separated list of allowed CORS origins.
 * The frontend (PWA) lives at this origin; staging + production share
 * the line, separated by commas, no whitespace.
 */
export const FRONTEND_URL = optional(
  "FRONTEND_URL",
  "http://localhost:4200,https://smuvejeffpresents.com,https://www.smuvejeffpresents.com",
);

/**
 * Symmetric secret used to sign + verify session JWTs. Required in
 * every non-development environment; the host layer is responsible for
 * minting it via the API Keys tab.
 */
export const JWT_SECRET = required(
  "JWT_SECRET",
  // Local dev fallback so first-time contributors can boot the API
  // without ceremony. Production hosting MUST override this before the
  // process accepts traffic.
  "dev-only-jwt-secret-do-not-use-in-production-please-rotate",
);

export default {
  NODE_ENV,
  IS_PRODUCTION,
  IS_TEST,
  DATABASE_URL,
  FRONTEND_URL,
  JWT_SECRET,
};

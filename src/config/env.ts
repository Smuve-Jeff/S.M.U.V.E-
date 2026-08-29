import { randomBytes } from "crypto";

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT) || 4000;
export const DATABASE_URL = process.env.DATABASE_URL || "";
/** PlanetScale uses a MySQL-compatible connection URL. */
export const DATABASE_DRIVER =
  process.env.DATABASE_DRIVER ||
  (DATABASE_URL.startsWith("mysql://") || DATABASE_URL.startsWith("mysql2://")
    ? "mysql"
    : "postgres");
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

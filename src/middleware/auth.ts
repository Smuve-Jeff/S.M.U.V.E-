import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import { AppDataSource } from "@/database/data-source";
// Type-only: the repository is resolved by entity *name* at runtime so this
// module never pulls the decorator-laden entity graph into the request path
// (and so test suites can stub the data source without mocking 20 entities).
import type { User } from "@/entities/User";
import { AppError } from "@/lib";
import type { AuthTokenPayload } from "@/types";

/**
 * Pin the accepted algorithm. Without it, verification trusts whatever the
 * token's own header claims, which is how `alg: none` and RS/HS confusion
 * attacks get in.
 */
const verifyToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthTokenPayload;

/**
 * Require a valid `Authorization: Bearer <token>` header; sets `req.user`.
 *
 * A JWT alone is not proof of a live session: it cannot be recalled, so a token
 * stolen before a password reset would keep working until it expired. The
 * account's current `tokenVersion` and role are therefore re-read on every
 * request — a rotation bumps the version and every previously issued token is
 * refused. A database failure is a hard error, never a silent pass.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return next(new AppError(401, "Authentication token required"));
  }

  let payload: AuthTokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(new AppError(403, "Invalid or expired token"));
  }

  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return next(new AppError(403, "Invalid token"));
  }

  let current: Pick<User, "id" | "role" | "tokenVersion"> | null;
  try {
    current = await AppDataSource.getRepository<User>("User").findOne({
      where: { id: userId },
      select: { id: true, role: true, tokenVersion: true },
    });
  } catch (err) {
    // Fail closed: an unreachable database must never read as "authenticated".
    return next(err);
  }

  if (!current) {
    return next(new AppError(403, "This account no longer exists"));
  }
  // Tokens issued before this check existed carry no `tv`; they are treated as
  // version 0, which is what those accounts hold, so the upgrade itself does
  // not sign everybody out — only a rotation does.
  if (Number(payload.tv ?? 0) !== Number(current.tokenVersion ?? 0)) {
    return next(new AppError(403, "Session revoked. Sign in again."));
  }

  // Role comes from the account, not the token, so a demotion takes effect
  // immediately instead of lasting until the token expires.
  req.user = { userId, role: String(current.role ?? payload.role ?? "user") };
  next();
};

/** Require the authenticated user to have one of the given roles. */
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    next();
  };

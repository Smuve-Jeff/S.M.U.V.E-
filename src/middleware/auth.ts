import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import { AppError } from "@/lib";
import type { AuthUser } from "@/types";

/** Require a valid `Authorization: Bearer <token>` header; sets `req.user` on success. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return next(new AppError(401, "Authentication token required"));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = { userId: Number(payload.userId), role: payload.role };
    next();
  } catch {
    next(new AppError(403, "Invalid or expired token"));
  }
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

import type { Request, Response, NextFunction } from "express";

/**
 * AppError — structured error the API surface throws on purpose.
 * The signature is `(statusCode, message, code?, details?)` to match
 * the in-codebase callsite idiom: `throw new AppError(400, "msg")`.
 * `code` is an optional stable machine-readable identifier; defaults
 * to a generic label so common 4xx/5xx flows stay terse.
 */
export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    code: string = statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Express final error handler. Always emits a JSON envelope so the
 * Angular client never has to parse HTML on failure.
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : "INTERNAL_ERROR";
  const message =
    statusCode >= 500 && !isAppError
      ? "Internal server error"
      : err.message || "Unknown error";
  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error("[server] unhandled error:", err);
  }
  res.status(statusCode).json({
    ok: false,
    error: { code, message, details: isAppError ? err.details : undefined },
  });
};

/**
 * Express 404 fallback so non-API misses get a stable envelope
 * instead of an HTML stack trace from upstream proxies.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
};

// Augment Express so middleware-attached `req.user` is visible to route
// handlers without per-file type assertions. AuthUser is the same shape
// the socket.io handshake (src/socket/index.ts) and the JWT verifier
// in src/middleware/auth.ts produce.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        role: string;
      };
    }
  }
}

export default { AppError, errorHandler, notFoundHandler };

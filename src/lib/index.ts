import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ZodError } from "zod";
import type { ApiErrorBody } from "@/types";

/** Error with an HTTP status code, thrown by services/routes and handled centrally. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * A profile blob is stamped with the account that owns it (`profile.id`). The
 * row is already keyed by the authenticated account, so a blob stamped with a
 * different owner is a mismatched payload: saving it would install another
 * artist's identity on the next load, and — because the client refuses to write
 * a record stamped with a foreign account — every later edit would silently fail
 * to persist. A blob with no stamp (a fresh profile) is allowed; the row names
 * the owner in that case.
 */
export const assertProfileBelongsTo = (
  profileData: unknown,
  userId: string,
): void => {
  const stamp = (profileData as { id?: unknown } | null | undefined)?.id;
  if (typeof stamp !== "string") return;
  const owner = stamp.trim();
  if (!owner) return;
  if (owner !== String(userId)) {
    throw new AppError(400, "Profile data does not belong to this account.");
  }
};

/** 404 handler — mounted after all routes. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/** Central error handler — mounted last. Express 5 forwards async rejections here. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiErrorBody = { error: err.message };
    if (err.details !== undefined) body.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  if (
    err &&
    typeof err === "object" &&
    "issues" in err &&
    Array.isArray((err as ZodError).issues)
  ) {
    const zodErr = err as ZodError;
    return res.status(400).json({
      error: "Invalid input",
      details: zodErr.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  // Multer upload errors (e.g. LIMIT_FILE_SIZE from the size limit) arrive
  // here via Express 5 forwarding. Map them to clean client-facing statuses.
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: unknown }).code);
    if (code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large." });
    }
    if (code.startsWith("LIMIT_")) {
      return res.status(400).json({ error: "Invalid upload." });
    }
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
};

/** Parse and validate a numeric URL parameter (e.g. `/api/user/42`). */
export const parseIdParam = (raw: string | undefined, label = "id"): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Invalid ${label}: must be a positive integer`);
  }
  return id;
};

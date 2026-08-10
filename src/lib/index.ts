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

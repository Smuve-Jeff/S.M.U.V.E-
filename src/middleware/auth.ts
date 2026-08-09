import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@/config/env";
import { AppError } from "@/lib";

/**
 * Express middleware that validates the Authorization: Bearer JWT and
 * populates req.user with the resulting AuthUser shape declared in
 * src/lib/index.ts (`Express.Request.user` augmentation). Behaviour is
 * intentionally close to the socket.io handshake (`getSender` in
 * src/socket/index.ts) so a token that opens a socket also opens an
 * HTTP route.
 *
 * Failure modes (all surface as JSON via src/lib#errorHandler):
 *   - missing or non-Bearer header  --> 401 AUTH_MISSING
 *   - invalid signature / malformed --> 401 AUTH_INVALID
 *   - userId missing inside the JWT --> 401 AUTH_PAYLOAD_MALFORMED
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    next(
      new AppError(401, "Authentication required", "AUTH_MISSING", {
        header: "Authorization",
      }),
    );
    return;
  }
  const token = match[1].trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId?: unknown;
      role?: unknown;
    };
    if (!payload || payload.userId === undefined || payload.userId === null) {
      next(new AppError(401, "JWT missing userId claim", "AUTH_PAYLOAD_MALFORMED"));
      return;
    }
    req.user = {
      userId: Number(payload.userId),
      role: String(payload.role ?? "user"),
    };
    next();
  } catch (err) {
    next(
      new AppError(
        401,
        (err as Error)?.message ?? "JWT verification failed",
        "AUTH_INVALID",
      ),
    );
  }
};

export default authenticate;

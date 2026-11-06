import type { AuthUser } from "./index";

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user (set by the `authenticate` middleware). */
      user?: AuthUser;
    }
  }
}

export {};

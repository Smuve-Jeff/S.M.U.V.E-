import type { AuthUser } from "./index";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Authenticated user (set by the `authenticate` middleware). */
      user?: AuthUser;
    }
  }
}

export {};

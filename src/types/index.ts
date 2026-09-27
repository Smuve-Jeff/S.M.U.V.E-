/**
 * Shared API types for the S.M.U.V.E. API backend.
 */

/** Shape of the JWT payload for authenticated requests. */
export interface AuthUser {
  userId: number;
  role: string;
}

/**
 * The signed JWT payload as issued by `signToken`.
 *
 * `tv` is the account's tokenVersion at signing time; `authenticate` compares
 * it against the stored value so a credential rotation can revoke tokens that
 * were already handed out.
 */
export interface AuthTokenPayload extends AuthUser {
  tv?: number;
}

/** Safe user shape returned by the API (never includes the password hash). */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: string;
  /** True only after the address was actually confirmed by its owner. */
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Response body returned by register/login. */
export interface AuthResponse {
  token: string;
  user: PublicUser;
  /**
   * Whether this deployment can send verification mail at all. The client only
   * enforces "verify your address" when it can actually be completed, so an
   * environment without a mail provider never locks anyone out of a route.
   */
  emailVerificationAvailable: boolean;
}

/** Standard JSON error body. */
export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

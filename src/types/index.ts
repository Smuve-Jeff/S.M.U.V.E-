/**
 * Shared API types for the S.M.U.V.E. API backend.
 */

/** Shape of the JWT payload for authenticated requests. */
export interface AuthUser {
  userId: number;
  role: string;
}

/** Safe user shape returned by the API (never includes the password hash). */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Response body returned by register/login. */
export interface AuthResponse {
  token: string;
  user: PublicUser;
}

/** Standard JSON error body. */
export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

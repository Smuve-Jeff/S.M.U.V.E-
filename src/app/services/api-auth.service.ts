import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from './token.service';

// --- Typed DTOs matching the S.M.U.V.E. API (Express + TypeORM) ---

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: string;
  /** Server-confirmed address state — never inferred from a successful login. */
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAuthResponse {
  token: string;
  user: ApiUser;
  /**
   * Whether the API can send verification mail at all. The client only asks
   * for verification when it can actually be completed.
   */
  emailVerificationAvailable?: boolean;
}

export interface ApiLoginInput {
  email: string;
  password: string;
}

export interface ApiRegisterInput {
  name: string;
  email: string;
  password: string;
}

/** Generic acknowledgement from the account-recovery endpoints. */
export interface ApiMessageResponse {
  ok: boolean;
  message?: string;
}

export interface ApiPasswordResetResponse {
  ok: boolean;
  user: ApiUser;
}

/**
 * Error thrown by ApiAuthService. `status === 0` means the API could not be
 * reached (network error / CORS / deployment issue). Login decides whether a
 * local-only development fallback is permitted; production never falls back.
 */
export class ApiAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

/**
 * Typed client for the S.M.U.V.E. API authentication endpoints.
 *
 * Point `window.env.AUTH_API_URL` at the running API. Development may use
 * http://localhost:4000/api or a relative `/api` dev-proxy URL; production
 * should use the deployed API origin.
 */
@Injectable({ providedIn: 'root' })
export class ApiAuthService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);

  private readonly baseUrl = APP_SECURITY_CONFIG.auth_api_url;

  /** POST /api/auth/login */
  async login(input: ApiLoginInput): Promise<ApiAuthResponse> {
    return this.post<ApiAuthResponse>('/auth/login', input);
  }

  /** POST /api/auth/register */
  async register(input: ApiRegisterInput): Promise<ApiAuthResponse> {
    return this.post<ApiAuthResponse>('/auth/register', input);
  }

  /**
   * POST /api/auth/forgot-password — ask for a single-use reset link.
   *
   * The API answers identically whether or not the address has an account, so
   * callers must present the returned message rather than infer existence.
   */
  async requestPasswordReset(email: string): Promise<ApiMessageResponse> {
    return this.post<ApiMessageResponse>('/auth/forgot-password', { email });
  }

  /** POST /api/auth/reset-password — redeem a reset token with a new password. */
  async resetPassword(
    token: string,
    password: string
  ): Promise<ApiPasswordResetResponse> {
    return this.post<ApiPasswordResetResponse>('/auth/reset-password', {
      token,
      password,
    });
  }

  /**
   * POST /api/auth/verify-email/send — email a fresh 6-digit verification code
   * to the address on the signed-in account.
   */
  async sendEmailVerification(): Promise<ApiMessageResponse> {
    return this.post<ApiMessageResponse>('/auth/verify-email/send', {}, true);
  }

  /** POST /api/auth/verify-email/confirm — redeem a verification code. */
  async confirmEmailVerification(code: string): Promise<ApiPasswordResetResponse> {
    return this.post<ApiPasswordResetResponse>(
      '/auth/verify-email/confirm',
      { code },
      true
    );
  }

  /** GET /api/auth/me — returns the current user for the stored JWT. */
  async me(): Promise<ApiUser> {
    const token = this.tokenService.jwtToken();
    try {
      return await firstValueFrom(
        this.http.get<ApiUser>(`${this.baseUrl}/auth/me`, {
          headers:
            token && this.tokenService.isApiToken()
              ? { Authorization: 'Bearer ' + token }
              : {},
        })
      );
    } catch (err) {
      throw this.toApiError(err);
    }
  }

  private async post<T>(
    path: string,
    body: unknown,
    authenticated = false
  ): Promise<T> {
    // Authenticated calls state their own bearer token rather than relying on
    // the global interceptor: these routes must never be reached without it,
    // and a legacy (demo) token must not be presented as an API credential.
    const token = this.tokenService.jwtToken();
    try {
      return await firstValueFrom(
        this.http.post<T>(`${this.baseUrl}${path}`, body, {
          headers:
            authenticated && token && this.tokenService.isApiToken()
              ? { Authorization: 'Bearer ' + token }
              : {},
        })
      );
    } catch (err) {
      throw this.toApiError(err);
    }
  }

  private toApiError(err: unknown): ApiAuthError {
    if (err instanceof HttpErrorResponse) {
      const serverMessage =
        err.error &&
        typeof err.error === 'object' &&
        'error' in err.error &&
        typeof (err.error as { error?: unknown }).error === 'string'
          ? (err.error as { error: string }).error
          : undefined;
      return new ApiAuthError(err.status, serverMessage || err.message);
    }
    return new ApiAuthError(0, 'Unknown authentication error');
  }
}

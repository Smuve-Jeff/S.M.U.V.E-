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
  createdAt: string;
  updatedAt: string;
}

export interface ApiAuthResponse {
  token: string;
  user: ApiUser;
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.post<T>(`${this.baseUrl}${path}`, body)
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

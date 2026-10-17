import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from '../services/token.service';
import { UserStoreService } from '../services/user-store.service';

const API_HOSTS = [
  APP_SECURITY_CONFIG.api_url,
  APP_SECURITY_CONFIG.auth_api_url,
]
  .filter(Boolean)
  .map((host) => host.replace(/\/+$/, ''));

/**
 * Attaches `Authorization: Bearer <jwt>` to every request that targets the
 * S.M.U.V.E. APIs (absolute API hosts or relative /api/* paths). Requests that
 * already carry an Authorization header (e.g. DatabaseService.getHeaders())
 * are left untouched. Centralizes auth so services don't manage headers.
 *
 * It also handles the other half of that job: a token the API refuses is dead,
 * and keeping it would leave the app "signed in" while every request fails.
 * That is now reachable in normal use — a password reset revokes every session,
 * including this device's — so a 401/403 clears the local session and returns
 * the artist to the login surface with their place remembered.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const userStore = inject(UserStoreService);
  const router = inject(Router);

  const url = req.url;
  const targetsApi =
    API_HOSTS.some((host) => url === host || url.startsWith(`${host}/`)) ||
    url === '/api' ||
    url.startsWith('/api/');

  const handleAuthFailure = (error: unknown) => {
    // Only react to a *session* being refused. A rejected sign-in (wrong
    // password) is a normal 401 on a request that carried no API token.
    if (
      targetsApi &&
      error instanceof HttpErrorResponse &&
      (error.status === 401 || error.status === 403) &&
      tokenService.isApiToken()
    ) {
      tokenService.setToken(null);
      userStore.setUser(null);
      void router.navigate(['/login'], {
        queryParams: { returnUrl: router.url },
        replaceUrl: true,
      });
    }
    return throwError(() => error);
  };

  if (req.headers.has('Authorization') || !targetsApi) {
    return next(req).pipe(catchError(handleAuthFailure));
  }

  const token = tokenService.jwtToken();
  // Local/demo sessions intentionally do not get presented as API credentials.
  // The legacy client token is not signed by the TypeScript API.
  if (!token || !tokenService.isApiToken()) {
    return next(req).pipe(catchError(handleAuthFailure));
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    })
  ).pipe(catchError(handleAuthFailure));
};

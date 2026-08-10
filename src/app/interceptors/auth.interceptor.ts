import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { APP_SECURITY_CONFIG } from '../app.security';
import { TokenService } from '../services/token.service';

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
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has('Authorization')) {
    return next(req);
  }

  const url = req.url;
  const targetsApi =
    API_HOSTS.some((host) => url === host || url.startsWith(`${host}/`)) ||
    url === '/api' ||
    url.startsWith('/api/');
  if (!targetsApi) {
    return next(req);
  }

  const tokenService = inject(TokenService);
  const token = tokenService.jwtToken();
  // Local/demo sessions intentionally do not get presented as API credentials.
  // The legacy client token is not signed by the TypeScript API.
  if (!token || !tokenService.isApiToken()) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    })
  );
};

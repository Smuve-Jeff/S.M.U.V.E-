import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '../services/token.service';
import { SecurityService } from '../services/security.service';

/**
 * Attaches the current JWT (Authorization: Bearer) and CSRF token
 * (X-CSRF-Token) on same-origin mutating requests, so the Express backend
 * in src/app.ts can authenticate the user and verify the same-site
 * origin check.
 *
 * The backend also expects CORS to permit credentials; the Freebuff
 * preview deploys frontend + server from the same host, so credentials
 * flow naturally. Public requests and outbound cross-origin GETs are
 * left untouched.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const tokens = inject(TokenService);
  const security = inject(SecurityService);

  const token = tokens.jwtToken();
  const method = req.method.toUpperCase();
  const mutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const sameOrigin = !req.url.startsWith('http') || req.url.startsWith(typeof window !== 'undefined' ? window.location.origin : '');

  let headers = req.headers;
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  if (mutating && sameOrigin) {
    headers = headers.set('X-CSRF-Token', security.getCSRFToken());
  }

  return next(
    headers === req.headers
      ? req
      : req.clone({ headers, withCredentials: true }),
  );
};

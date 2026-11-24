import { Injectable, signal } from '@angular/core';

export type TokenSource = 'api' | 'legacy' | null;

const TOKEN_STORAGE_KEY = 'smuve_jwt_token';
const TOKEN_SOURCE_STORAGE_KEY = 'smuve_jwt_source';

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  private _jwtToken = signal<string | null>(null);
  jwtToken = this._jwtToken.asReadonly();

  private _tokenSource = signal<TokenSource>(null);
  tokenSource = this._tokenSource.asReadonly();
  private _isApiToken = signal(false);
  isApiToken = this._isApiToken.asReadonly();

  constructor() {
    let token: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        token = localStorage.getItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // A blocked store must not break application boot; the session simply
      // starts signed out until the artist signs in again.
      token = null;
    }
    const source = this.readStoredSource(token);
    this._jwtToken.set(token);
    this._tokenSource.set(source);
    // Unknown legacy storage is intentionally not trusted as an API token.
    this._isApiToken.set(source === 'api');
  }

  setToken(token: string | null, source: Exclude<TokenSource, null> = 'api') {
    const nextSource = token ? source : null;
    this._jwtToken.set(token);
    this._tokenSource.set(nextSource);
    this._isApiToken.set(nextSource === 'api');

    try {
      if (typeof localStorage !== 'undefined') {
        if (token) {
          localStorage.setItem(TOKEN_STORAGE_KEY, token);
          localStorage.setItem(TOKEN_SOURCE_STORAGE_KEY, source);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(TOKEN_SOURCE_STORAGE_KEY);
        }
      }
    } catch {
      // The in-memory token still works for this session when storage is blocked.
    }
  }

  private readStoredSource(token: string | null): TokenSource {
    if (!token) return null;

    let stored: string | null = null;
    try {
      if (typeof localStorage === 'undefined') return null;
      stored = localStorage.getItem(TOKEN_SOURCE_STORAGE_KEY);
    } catch {
      return null;
    }
    if (stored === 'api' || stored === 'legacy') return stored;

    // Migrate tokens created before provenance was persisted. The active API
    // signs `userId`; the local demo token signs `sub`.
    try {
      const [, encodedPayload] = token.split('.');
      if (!encodedPayload) return null;
      const base64Payload = encodedPayload
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const paddedPayload =
        base64Payload + '='.repeat((4 - (base64Payload.length % 4)) % 4);
      const payload = JSON.parse(atob(paddedPayload)) as {
        userId?: unknown;
        sub?: unknown;
      };
      return payload.userId !== undefined
        ? 'api'
        : payload.sub !== undefined
          ? 'legacy'
          : null;
    } catch {
      return null;
    }
  }
}

interface SmuveEnv {
  AUTH_SALT?: string;
  SESSION_TIMEOUT?: number;
  API_URL?: string;
  AUTH_API_URL?: string;
  SOCKET_URL?: string;
}

const env: SmuveEnv =
  typeof window !== 'undefined' ? ((window as any).env as SmuveEnv) || {} : {};
const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

export const APP_SECURITY_CONFIG = {
  auth_salt: env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH',
  session_timeout: env.SESSION_TIMEOUT || 3600000,
  // Local dev defaults: window.env in src/index.html overrides these with the
  // live tunnel URLs (https://api.smuvejeffpresents.com/api) in production.
  api_url: normalizeBaseUrl(env.API_URL || 'http://localhost:4000/api'),
  auth_api_url: normalizeBaseUrl(
    env.AUTH_API_URL || 'http://localhost:4000/api'
  ),
  // Socket.io endpoint — same host as the API with the /api suffix removed.
  // An explicit SOCKET_URL override wins; otherwise derive from API_URL so the
  // socket always talks to the same tunnel as the REST API.
  socket_url: normalizeBaseUrl(
    env.SOCKET_URL ||
      (env.API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '')
  ),
  // Demo auth is useful when developing with no API, but must never silently
  // mask a production API outage or CORS/deployment problem.
  legacy_auth_fallback: (() => {
    const configuredUrl = env.AUTH_API_URL || 'http://localhost:4000/api';
    // A relative URL is the supported Angular dev-proxy shape and is safe to
    // use for local development. Absolute URLs are allowed only for loopback.
    if (configuredUrl.startsWith('/')) return true;
    try {
      const host = new URL(configuredUrl).hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  })(),
  pbkdf2_iterations: 210000,
  key_length: 512,
};

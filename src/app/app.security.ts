interface SmuveEnv {
  AUTH_SALT?: string;
  ENCRYPTION_KEY?: string;
  SESSION_TIMEOUT?: number;
  API_URL?: string;
}

const env: SmuveEnv =
  typeof window !== 'undefined' ? ((window as any).env as SmuveEnv) || {} : {};

if (!env.AUTH_SALT || !env.ENCRYPTION_KEY) {
  console.warn(
    '[SECURITY] AUTH_SALT and/or ENCRYPTION_KEY not provided via window.env. ' +
      'Using built-in defaults. Configure these values for production deployments.'
  );
}

export const APP_SECURITY_CONFIG = {
  auth_salt: env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH',
  encryption_key: env.ENCRYPTION_KEY || 'SMUVE_V4_ULTRA_ENCRYPTION_SECRET',
  session_timeout: env.SESSION_TIMEOUT || 3600000, // 1 hour
  api_url:
    env.API_URL ||
    'https://smuve-v4-backend-9951606049235487441.onrender.com/api',
};

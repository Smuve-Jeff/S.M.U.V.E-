interface SmuveEnv {
  AUTH_SALT?: string;
  ENCRYPTION_KEY?: string;
  SESSION_TIMEOUT?: number;
  API_URL?: string;
}

const env = ((window as any).env as SmuveEnv) || {};

export const APP_SECURITY_CONFIG = {
  auth_salt: env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH',
  encryption_key: env.ENCRYPTION_KEY || 'SMUVE_V4_ULTRA_ENCRYPTION_SECRET',
  session_timeout: env.SESSION_TIMEOUT || 3600000, // 1 hour
  api_url:
    env.API_URL ||
    'https://smuve-v4-backend-9951606049235487441.onrender.com/api',
};

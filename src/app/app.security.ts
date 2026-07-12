interface SmuveEnv {
  AUTH_SALT?: string;
  ENCRYPTION_KEY?: string;
  SESSION_TIMEOUT?: number;
  API_URL?: string;
}

const env: SmuveEnv =
  typeof window !== 'undefined' ? ((window as any).env as SmuveEnv) || {} : {};

export const APP_SECURITY_CONFIG = {
  auth_salt: env.AUTH_SALT || 'SMUVE_SALT_V4_SECURE_HASH',
  encryption_key: env.ENCRYPTION_KEY || 'SMUVE_V4_ULTRA_ENCRYPTION_SECRET',
  session_timeout: env.SESSION_TIMEOUT || 3600000,
  api_url:
    env.API_URL ||
    'https://smuvejeffpresents.com/api',
  pbkdf2_iterations: 210000,
  key_length: 512,
};

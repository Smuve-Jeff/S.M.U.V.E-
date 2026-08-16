export type AuthOutcome = 'allow' | 'deny' | 'invalid';

export interface AuthEvent {
  outcome: AuthOutcome;
  userId: string | null;
  method: string;
  path: string;
  reason: string | null;
}

/**
 * Insert an auth event into D1. Returns the D1 result so callers can inspect
 * `meta.changes` if needed.
 */
export function insertAuthEvent(db: D1Database, event: AuthEvent): Promise<D1Result> {
  return db
    .prepare(
      `INSERT INTO auth_events (ts, outcome, user_id, method, path, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(Date.now(), event.outcome, event.userId, event.method, event.path, event.reason)
    .run();
}

/**
 * Log an auth event, swallowing D1 errors so a database outage never breaks
 * the auth path. Safe to call inside `ctx.waitUntil(...)`.
 */
export async function logAuthEvent(env: { DB?: D1Database }, event: AuthEvent): Promise<void> {
  if (!env.DB) return;
  try {
    await insertAuthEvent(env.DB, event);
  } catch (err) {
    console.error('D1 auth-event write failed:', err instanceof Error ? err.message : err);
  }
}

/** Returns true when the token id (`jti`) has been revoked in D1. */
export async function isTokenRevoked(db: D1Database, jti: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT jti FROM revoked_tokens WHERE jti = ? LIMIT 1')
    .bind(jti)
    .first<{ jti: string }>();
  return row !== null;
}

-- Cloudflare D1 schema for the S.M.U.V.E. authentication worker.

-- Every auth decision (allow / deny / invalid) is written here for audit.
CREATE TABLE IF NOT EXISTS auth_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,          -- epoch milliseconds
  outcome  TEXT    NOT NULL,          -- 'allow' | 'deny' | 'invalid'
  user_id  TEXT,
  method   TEXT    NOT NULL,
  path     TEXT    NOT NULL,
  reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_events_ts   ON auth_events (ts);
CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events (user_id);

-- JWT `jti` values that must no longer be accepted.
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL          -- epoch milliseconds
);

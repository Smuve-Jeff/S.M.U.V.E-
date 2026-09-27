import { Injectable, computed, inject, signal, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';

export interface SecurityAudit {
  score: number;
  status: 'FORTIFIED' | 'HARDENED' | 'ATTENTION_REQUIRED' | 'UNAVAILABLE';
  alerts: string[];
}

/** Result of a password policy evaluation — mirrors the backend Zod rules. */
export interface PasswordPolicyResult {
  valid: boolean;
  /** 0-100 strength reading for the meter; `valid` is the gate, not the score. */
  score: number;
  failures: string[];
}

/** What a zeroization pass actually removed from memory. */
export interface ZeroizationReport {
  wiped: string[];
  at: number;
}

export interface TwoFactorSetup {
  supported: boolean;
  secret: string | null;
  qrCodeUri: string | null;
}

/**
 * Breached / trivially guessable passwords. This is a local shortlist — the
 * point is to stop an artist locking an account behind `Password1!`-class
 * secrets, not to replace a server-side breach check.
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password1!', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwerty123', 'qwertyuiop', 'letmein123', 'welcome1', 'welcome123', 'admin123',
  'administrator', 'iloveyou1', 'sunshine1', 'princess1', 'football1',
  'monkey123', 'dragon123', 'abc12345', '12345678', '123456789', '1234567890',
  'smuve123', 'smuve1234', 'changeme1', 'trustno1', 'baseball1', 'superman1',
]);

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private ngZone = inject(NgZone);

  sessionExpiresAt = signal<number | null>(null);
  /**
   * Derived session validity.
   *
   * This MUST stay read-only: the Hub landing page and the Settings audit
   * panel call `getSecurityAudit()` straight from their templates, and a
   * signal write during a render pass throws NG0600 — which previously took
   * the whole landing page down.
   */
  isSessionValid = computed<boolean>(() => {
    const expires = this.sessionExpiresAt();
    return !expires || Date.now() < expires;
  });
  lastActivity = signal(Date.now());
  logs = signal<any[]>([]);
  sessions = signal<any[]>([]);

  // ── Two-factor recovery codes ──────────────────────────────────────────────
  /** How many unused one-time recovery codes are still valid. */
  backupCodesRemaining = signal(0);
  /**
   * Only hashes are retained: the plaintext codes are handed to the artist
   * exactly once, so a memory scrape of this service cannot replay a code.
   */
  private backupCodeHashes: string[] = [];
  private backupCodeSalt = '';

  // ── Inactivity auto-lock ──────────────────────────────────────────────────
  autoLockEnabled = signal(true);
  autoLockTimeoutMs = signal(15 * 60 * 1000);
  isLocked = signal(false);
  private autoLockHandle: ReturnType<typeof setInterval> | null = null;
  private static readonly AUTO_LOCK_TICK_MS = 15_000;

  private rateLimitMap = new Map<string, { attempts: number; blockedUntil: number }>();
  private readonly maxAttempts = 5;
  private readonly blockDurationMs = 15 * 60 * 1000;
  private csrfToken: string | null = null;
  private twoFactorSecret: string | null = null;

  /** Pure session check — safe to call from templates and computed signals. */
  validateSession(): boolean {
    const expires = this.sessionExpiresAt();
    const valid = !expires || Date.now() < expires;
    if (!valid) this.logger.warn('Security session expired');
    return valid;
  }

  refreshSession() {
    // `isSessionValid` derives from this value, so setting the expiry is what
    // brings the session back to a valid state.
    this.sessionExpiresAt.set(Date.now() + 3600000);
    this.lastActivity.set(Date.now());
  }

  recordAttempt(key: string) {
    const now = Date.now();
    const entry = this.rateLimitMap.get(key) ?? { attempts: 0, blockedUntil: 0 };
    if (entry.blockedUntil > now) {
      return { allowed: false, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    }
    entry.attempts += 1;
    if (entry.attempts > this.maxAttempts) entry.blockedUntil = now + this.blockDurationMs;
    this.rateLimitMap.set(key, entry);
    return {
      allowed: entry.blockedUntil <= now,
      remainingAttempts: Math.max(0, this.maxAttempts - entry.attempts + 1),
      blockedUntil: entry.blockedUntil,
    };
  }

  clearRateLimit(key: string) { this.rateLimitMap.delete(key); }

  isRateLimited(key: string) {
    const entry = this.rateLimitMap.get(key);
    return !!entry && entry.blockedUntil > Date.now();
  }

  isValidRedirectUrl(url: string): boolean {
    if (!url || typeof window === 'undefined') return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin && !parsed.username && !parsed.password;
    } catch { return url.startsWith('/') && !url.startsWith('//'); }
  }

  sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
  }

  async logEvent(eventType: string, description: string, userId?: string) {
    const entry = { event_type: eventType, description: this.sanitizeInput(description), user_id: userId, created_at: Date.now() };
    this.logs.update((items) => [entry, ...items].slice(0, 100));
    this.logger.info(`Security event: ${eventType}`);
  }

  async fetchLogs() { return this.logs(); }
  async fetchSessions() { return this.sessions(); }
  async revokeSession(id: string) {
    if (!id) return false;
    this.sessions.update((items) => items.filter((session) => session.session_id !== id));
    await this.logEvent('SESSION_REVOKED', 'A session was revoked from Settings.');
    return true;
  }

  async exportUserData() {
    return {
      exportedAt: new Date().toISOString(),
      securityEvents: this.logs(),
      activeSessions: this.sessions(),
      note: 'Local security state only; no cloud data is fabricated or included.',
    };
  }

  // ─── Password policy ───────────────────────────────────────────────────────

  /**
   * Evaluate a candidate password against the same policy the API enforces
   * (8+ chars, upper, lower, digit, symbol). Keeping the rules in one place
   * means the UI can never accept a secret the server will reject.
   */
  evaluatePasswordPolicy(password: string): PasswordPolicyResult {
    const value = typeof password === 'string' ? password : '';
    const failures: string[] = [];

    if (value.length < 8) failures.push('Use at least 8 characters');
    if (value.length > 100) failures.push('Use 100 characters or fewer');
    if (!/[A-Z]/.test(value)) failures.push('Add an uppercase letter');
    if (!/[a-z]/.test(value)) failures.push('Add a lowercase letter');
    if (!/[0-9]/.test(value)) failures.push('Add a number');
    if (!/[^A-Za-z0-9]/.test(value)) failures.push('Add a symbol');

    const normalized = value.toLowerCase();
    if (value.length > 0 && /^(.)\1*$/.test(value)) {
      failures.push('Avoid a single repeated character');
    }
    if (COMMON_WEAK_PASSWORDS.has(normalized)) {
      failures.push('This password appears in breach lists');
    }
    // Obvious keyboard ramps / sequences (abc123, 123456, qwerty…).
    if (value.length > 0 && /^(?:0123|1234|abcd|qwer|asdf|zxcv)/i.test(value)) {
      failures.push('Avoid keyboard sequences');
    }

    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) =>
      r.test(value)
    ).length;
    const unique = new Set(value).size;
    let score = 0;
    score += Math.min(40, value.length * 3);
    score += classes * 12;
    score += Math.min(12, unique * 1.5);
    if (failures.length > 0) score = Math.min(score, 55);
    if (COMMON_WEAK_PASSWORDS.has(normalized)) score = Math.min(score, 10);
    if (value.length === 0) score = 0;

    return {
      valid: failures.length === 0,
      score: Math.max(0, Math.min(100, Math.round(score))),
      failures,
    };
  }

  // ─── Two-factor recovery codes ─────────────────────────────────────────────

  /** Human-readable strength of the currently enrolled 2FA state. */
  hasTwoFactorSecret(): boolean { return !!this.twoFactorSecret; }

  /**
   * Issue one-time recovery codes. The returned plaintext array is the only
   * copy the caller will ever see — hashes are all this service keeps.
   */
  async generateBackupCodes(count = 10): Promise<string[]> {
    const total = Math.max(4, Math.min(20, Math.floor(count) || 10));
    this.backupCodeSalt = this.randomHex(8);
    const codes: string[] = [];
    for (let i = 0; i < total; i++) codes.push(this.randomBackupCode());
    this.backupCodeHashes = await Promise.all(
      codes.map((code) => this.hashBackupCode(code))
    );
    this.backupCodesRemaining.set(this.backupCodeHashes.length);
    await this.logEvent(
      '2FA_BACKUP_CODES_ISSUED',
      `${this.backupCodeHashes.length} single-use recovery codes were generated.`
    );
    return codes;
  }

  hasBackupCodes(): boolean { return this.backupCodeHashes.length > 0; }

  /** Verify and burn a recovery code. A code can never be used twice. */
  async verifyBackupCode(code: string): Promise<boolean> {
    if (!code || this.backupCodeHashes.length === 0) return false;
    const hash = await this.hashBackupCode(code);
    const index = this.backupCodeHashes.indexOf(hash);
    if (index === -1) {
      await this.logEvent('2FA_BACKUP_CODE_REJECTED', 'An invalid recovery code was presented.');
      return false;
    }
    this.backupCodeHashes.splice(index, 1);
    this.backupCodesRemaining.set(this.backupCodeHashes.length);
    await this.logEvent(
      '2FA_BACKUP_CODE_USED',
      `A recovery code was consumed; ${this.backupCodeHashes.length} remain.`
    );
    return true;
  }

  clearBackupCodes(reason = 'Recovery codes were revoked from Settings.') {
    if (this.backupCodeHashes.length === 0) return false;
    this.backupCodeHashes = [];
    this.backupCodesRemaining.set(0);
    void this.logEvent('2FA_BACKUP_CODES_REVOKED', reason);
    return true;
  }

  /** Recovery-code file contents for the artist to store offline. */
  buildBackupCodeExport(codes: string[]): string {
    return [
      'S.M.U.V.E. 2.0 — TWO-FACTOR RECOVERY CODES',
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each code works once. Store this file somewhere offline and private.',
      'Anyone holding a code can bypass your authenticator — treat it like a key.',
      '',
      ...codes,
      '',
    ].join('\n');
  }

  // ─── Inactivity auto-lock ──────────────────────────────────────────────────

  configureAutoLock(enabled: boolean, timeoutMs?: number) {
    this.autoLockEnabled.set(!!enabled);
    if (typeof timeoutMs === 'number' && isFinite(timeoutMs)) {
      this.autoLockTimeoutMs.set(Math.max(60_000, Math.min(4 * 60 * 60 * 1000, timeoutMs)));
    }
    if (this.autoLockEnabled()) this.startInactivityWatch();
    else this.stopInactivityWatch();
  }

  /** Mark the session as active; keeps an idle session from locking. */
  registerActivity() {
    this.lastActivity.set(Date.now());
  }

  /** Milliseconds until the auto-lock fires; 0 when disabled or already locked. */
  autoLockRemainingMs(now = Date.now()): number {
    if (!this.autoLockEnabled() || this.isLocked()) return 0;
    const elapsed = Math.max(0, now - this.lastActivity());
    return Math.max(0, this.autoLockTimeoutMs() - elapsed);
  }

  lockNow(reason = 'manual'): boolean {
    if (this.isLocked()) return false;
    this.isLocked.set(true);
    this.invalidateVolatileSecrets();
    void this.logEvent(
      'SESSION_LOCKED',
      reason === 'inactivity'
        ? 'Session locked automatically after inactivity.'
        : 'Session locked from Settings.'
    );
    return true;
  }

  /**
   * Release the lock after the caller has re-verified the account holder
   * (password, biometrics, or a fresh token). Re-verification is the caller's
   * responsibility; this method only restores the session window.
   */
  unlock() {
    if (!this.isLocked()) return false;
    this.isLocked.set(false);
    this.refreshSession();
    void this.logEvent('SESSION_UNLOCKED', 'Session unlocked after re-verification.');
    return true;
  }

  /** Begin polling for inactivity. Safe to call repeatedly. */
  startInactivityWatch() {
    if (this.autoLockHandle || !this.autoLockEnabled()) return;
    if (typeof setInterval !== 'function') return;
    this.ngZone.runOutsideAngular(() => {
      this.autoLockHandle = setInterval(() => {
        if (!this.autoLockEnabled() || this.isLocked()) {
          this.stopInactivityWatch();
          return;
        }
        if (this.autoLockRemainingMs() <= 0) this.lockNow('inactivity');
      }, SecurityService.AUTO_LOCK_TICK_MS);
    });
  }

  stopInactivityWatch() {
    if (!this.autoLockHandle) return;
    clearInterval(this.autoLockHandle);
    this.autoLockHandle = null;
  }

  // ─── Sensitive-data handling ───────────────────────────────────────────────

  /**
   * Drop volatile in-memory secrets (CSRF token, rate-limit cache, session
   * timer) without destroying long-lived enrollment state. Used when a session
   * locks so a locked app cannot be driven with a pre-lock token.
   */
  invalidateVolatileSecrets(): string[] {
    const wiped: string[] = [];
    if (this.csrfToken) { this.csrfToken = null; wiped.push('csrf_token'); }
    if (this.rateLimitMap.size > 0) { this.rateLimitMap.clear(); wiped.push('rate_limit_cache'); }
    // A past timestamp — not 0/null, which `validateSession()` reads as
    // "no expiry configured" and therefore still valid.
    this.sessionExpiresAt.set(Date.now() - 1);
    wiped.push('session_window');
    return wiped;
  }

  /**
   * Full zeroization for session termination (logout, purge, account switch):
   * every secret this service holds is released and the local buffers that
   * could leak one account's data into the next are emptied.
   */
  zeroizeSensitiveData(): ZeroizationReport {
    const wiped: string[] = [];
    if (this.twoFactorSecret) { this.twoFactorSecret = null; wiped.push('totp_secret'); }
    if (this.backupCodeHashes.length > 0) {
      this.backupCodeHashes = [];
      this.backupCodesRemaining.set(0);
      wiped.push('backup_code_hashes');
    }
    wiped.push(...this.invalidateVolatileSecrets());
    if (this.logs().length > 0) { this.logs.set([]); wiped.push('security_log_buffer'); }
    if (this.sessions().length > 0) { this.sessions.set([]); wiped.push('session_cache'); }
    this.lastActivity.set(Date.now());
    this.isLocked.set(true);
    this.stopInactivityWatch();
    this.logger.info('SECURITY: sensitive in-memory state zeroized.');
    return { wiped, at: Date.now() };
  }

  /**
   * Overwrite a mutable string-ish buffer in place where the platform allows
   * it. JavaScript strings are immutable, so callers must also drop their
   * references — this helper exists so form state can be blanked loudly
   * instead of lingering in a signal after a sensitive flow completes.
   */
  wipeBuffer(buffer: { fill?: (value: unknown) => unknown } | null | undefined) {
    try {
      buffer?.fill?.(0);
    } catch {
      // Optional fill (typed arrays only) — a failure is not security-critical.
    }
  }

  async generateE2EKeys() {
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
    if (!subtle) return { publicKey: null, supported: false };
    try {
      const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
      const exported = await subtle.exportKey('jwk', pair.publicKey);
      return { publicKey: exported, supported: true };
    } catch (error) {
      this.logger.warn('E2E key generation unavailable', error);
      return { publicKey: null, supported: false };
    }
  }

  async setup2FA(): Promise<TwoFactorSetup> {
    const bytes = new Uint8Array(20);
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
      return { supported: false, secret: null, qrCodeUri: null };
    }
    crypto.getRandomValues(bytes);
    this.twoFactorSecret = this.toBase32(bytes);
    const issuer = 'SMUVE';
    const account = 'artist';
    return {
      supported: true,
      secret: this.twoFactorSecret,
      qrCodeUri: `otpauth://totp/${issuer}:${account}?secret=${this.twoFactorSecret}&issuer=${issuer}`,
    };
  }

  /** Forget the enrolled TOTP secret (called when 2FA is switched off). */
  destroyTwoFactor() {
    const hadSecret = !!this.twoFactorSecret;
    this.twoFactorSecret = null;
    this.clearBackupCodes('Recovery codes were revoked because 2FA was disabled.');
    return hadSecret;
  }

  async verify2FA(code: string): Promise<boolean> {
    if (!this.twoFactorSecret || !/^\d{6}$/.test(String(code))) return false;
    try {
      const counter = Math.floor(Date.now() / 30000);
      for (let offset = -1; offset <= 1; offset++) {
        if (await this.totp(this.twoFactorSecret, counter + offset) === code) return true;
      }
    } catch (error) { this.logger.warn('2FA verification unavailable', error); }
    return false;
  }

  getSecurityAudit(): SecurityAudit {
    const alerts: string[] = [];
    let score = 100;
    if (!this.validateSession()) { score -= 30; alerts.push('CRITICAL: SESSION_EXPIRED'); }
    if (!this.csrfToken) { score -= 15; alerts.push('CSRF token not initialized'); }
    if (!this.twoFactorSecret) { score -= 15; alerts.push('2FA is not enrolled'); }
    if (typeof crypto === 'undefined' || !crypto.subtle) { score -= 25; alerts.push('Web Crypto API unavailable'); }
    if (!this.backupCodeHashes.length) { score -= 10; alerts.push('No 2FA recovery codes issued'); }
    if (!this.autoLockEnabled()) { score -= 10; alerts.push('Auto-lock on inactivity is disabled'); }
    if (this.isLocked()) { score -= 5; alerts.push('Session is locked pending re-verification'); }
    score = Math.max(0, score);
    const status = score >= 90 ? 'FORTIFIED' : score >= 70 ? 'HARDENED' : score > 0 ? 'ATTENTION_REQUIRED' : 'UNAVAILABLE';
    return { score, status, alerts };
  }

  getRecommendedCSP() {
    return "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: wss:; script-src 'self'; style-src 'self' 'unsafe-inline';";
  }

  getSecurityConfig() {
    return { sessionTimeoutMs: 3600000, inactivityTimeoutMs: 1800000, requireReauthForSensitive: true };
  }

  setCSRFToken(token: string) { this.csrfToken = typeof token === 'string' && token.length >= 16 ? token : null; }
  getCSRFToken() {
    if (!this.csrfToken && typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
      this.csrfToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return this.csrfToken;
  }
  validateCSRFToken(token: string) { return !!token && token === this.csrfToken; }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private randomHex(bytes: number): string {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) return '';
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Recovery codes use an unambiguous alphabet (no I/O/0/1) so a code can be
   * read off paper without guessing which glyph it is.
   */
  private randomBackupCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const length = 10;
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
      return 'UNSUPPORTED0';
    }
    const bytes = new Uint8Array(length);
    const out: string[] = [];
    // Rejection sampling keeps the alphabet uniform instead of biased by
    // modulo on a non-power-of-two range.
    while (out.length < length) {
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (out.length >= length) break;
        if (byte < 256 - (256 % alphabet.length)) out.push(alphabet[byte % alphabet.length]);
      }
    }
    return `${out.slice(0, 5).join('')}-${out.slice(5).join('')}`;
  }

  private normalizeBackupCode(code: string): string {
    return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private async hashBackupCode(code: string): Promise<string> {
    const normalized = this.normalizeBackupCode(code);
    const payload = `smuve-2fa:${this.backupCodeSalt}:${normalized}`;
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
    if (subtle) {
      try {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(payload));
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch (error) {
        this.logger.warn('Recovery-code hashing fell back to a non-crypto digest', error);
      }
    }
    // Non-crypto contexts only (no window.crypto): a salted FNV-1a digest is
    // still better than keeping plaintext codes in memory.
    let hash = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv:${hash.toString(16).padStart(8, '0')}`;
  }

  private toBase32(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0; let value = 0; let output = '';
    for (const byte of bytes) {
      value = (value << 8) | byte; bits += 8;
      while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
    return output;
  }

  private async totp(secret: string, counter: number): Promise<string> {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0; let value = 0; const bytes: number[] = [];
    for (const char of secret) {
      value = (value << 5) | alphabet.indexOf(char); bits += 5;
      if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    const data = new ArrayBuffer(8); const view = new DataView(data);
    view.setUint32(0, Math.floor(counter / 0x100000000)); view.setUint32(4, counter >>> 0);
    const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
    const offset = hash[hash.length - 1] & 15;
    const binary = ((hash[offset] & 127) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
    return String(binary % 1000000).padStart(6, '0');
  }
}

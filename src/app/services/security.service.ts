import { Injectable, computed, inject, signal, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';

export interface SecurityAudit {
  score: number;
  status: 'FORTIFIED' | 'HARDENED' | 'ATTENTION_REQUIRED' | 'UNAVAILABLE';
  alerts: string[];
}

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

  async setup2FA() {
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

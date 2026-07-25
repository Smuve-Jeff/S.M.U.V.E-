import { Injectable, inject, signal, NgZone } from '@angular/core';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private logger = inject(LoggingService);
  private tokenService = inject(TokenService);
  private ngZone = inject(NgZone);

  sessionExpiresAt = signal<number | null>(null);
  isSessionValid = signal(true);
  lastActivity = signal(Date.now());
  logs = signal<any[]>([]);
  sessions = signal<any[]>([]);

  constructor() {}

  private rateLimitMap = new Map<
    string,
    { attempts: number; blockedUntil: number }
  >();
  private maxAttempts = 5;
  private blockDurationMs = 15 * 60 * 1000;

  validateSession(): boolean {
    if (typeof window === 'undefined') return true;
    const expires = this.sessionExpiresAt();
    return !expires || Date.now() < expires;
  }
  refreshSession() {
    this.sessionExpiresAt.set(Date.now() + 3600000);
    this.isSessionValid.set(true);
    this.lastActivity.set(Date.now());
  }
  recordAttempt(k: string) {
    const now = Date.now();
    const entry = this.rateLimitMap.get(k) || {
      attempts: 0,
      blockedUntil: 0,
    };
    if (entry.blockedUntil > now) {
      return { allowed: false, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    }
    entry.attempts += 1;
    if (entry.attempts > this.maxAttempts) {
      entry.blockedUntil = now + this.blockDurationMs;
      this.rateLimitMap.set(k, entry);
      return { allowed: false, remainingAttempts: 0, blockedUntil: entry.blockedUntil };
    }
    this.rateLimitMap.set(k, entry);
    return { allowed: true, remainingAttempts: this.maxAttempts - entry.attempts + 1, blockedUntil: 0 };
  }
  clearRateLimit(k: string) {
    this.rateLimitMap.delete(k);
  }
  isRateLimited(k: string) {
    const entry = this.rateLimitMap.get(k);
    if (!entry) return false;
    if (entry.blockedUntil > Date.now()) return true;
    return false;
  }
  isValidRedirectUrl(url: string): boolean {
    if (!url || typeof window === 'undefined') return false;
    const allowedOrigin = window.location.origin;
    try {
      const parsedUrl = new URL(url, allowedOrigin);
      return parsedUrl.origin === allowedOrigin;
    } catch (e) {
      return url.startsWith('/') && !url.startsWith('//');
    }
  }
  sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  async logEvent(t: string, d: string, u?: string) {}
  async fetchLogs() {}
  async fetchSessions() {}
  async revokeSession(id: string) {}
  async exportUserData() {}
  async generateE2EKeys() {
    return { publicKey: 'mock' };
  }
  async setup2FA() {
    return { secret: 'mock', qrCodeUri: 'mock' };
  }
  async verify2FA(code: string): Promise<boolean> {
    return code.length === 6;
  }
  getSecurityAudit() {
    return { score: 100, status: 'FORTIFIED', alerts: [] };
  }
  getRecommendedCSP() {
    return '';
  }
  getSecurityConfig() {
    return {
      sessionTimeoutMs: 3600000,
      inactivityTimeoutMs: 1800000,
      requireReauthForSensitive: true,
    };
  }
  private csrfToken: string | null = null;

  setCSRFToken(token: string) {
    this.csrfToken = token;
  }

  getCSRFToken() {
    return this.csrfToken || 'mock-token';
  }
  validateCSRFToken(t: string) {
    return t === this.csrfToken && !!t;
  }
}

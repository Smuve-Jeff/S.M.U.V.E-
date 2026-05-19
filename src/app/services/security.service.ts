import { APP_SECURITY_CONFIG } from '../app.security';
import { AuthService } from './auth.service';
import { Injector } from '@angular/core';

import { Injectable, inject, signal, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { LoggingService } from './logging.service';
import { UserProfileService } from './user-profile.service';

export interface SecurityLog {
  log_id: number;
  user_id: string;
  event_type: string;
  description: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export interface UserSession {
  session_id: string;
  user_id: string;
  device_name: string;
  location: string;
  last_active: string;
  is_current: boolean;
}

export interface SecurityConfig {
  sessionTimeoutMs: number;
  inactivityTimeoutMs: number;
  requireReauthForSensitive: boolean;
  maxConcurrentSessions: number;
  csrfEnabled: boolean;
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 30 * 60 * 1000, // 30 minutes
};

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  sessionTimeoutMs: 3600000, // 1 hour
  inactivityTimeoutMs: 1800000, // 30 minutes
  requireReauthForSensitive: true,
  maxConcurrentSessions: 3,
  csrfEnabled: true,
};

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  private logger = inject(LoggingService);
  private profileService = inject(UserProfileService);
  private ngZone = inject(NgZone);
  private http = inject(HttpClient);
  private injector = inject(Injector);

  private readonly API_URL = APP_SECURITY_CONFIG.api_url;
  private readonly XOR_KEY = APP_SECURITY_CONFIG.auth_salt;

  private getHeaders() {
    try {
      const token = this.injector.get(AuthService, null)?.jwtToken();
      const headers: { [header: string]: string } = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (this.csrfToken) {
        headers['X-CSRF-Token'] = this.csrfToken;
      }
      return { headers };
    } catch {
      return {};
    }
  }

  logs = signal<SecurityLog[]>([]);
  sessions = signal<UserSession[]>([]);
  isSessionValid = signal<boolean>(true);
  sessionExpiresAt = signal<number | null>(null);
  lastActivity = signal<number>(Date.now());

  private rateLimitCache = new Map<
    string,
    { attempts: number[]; blockedUntil: number }
  >();
  private rateLimitConfig = DEFAULT_RATE_LIMIT;
  private securityConfig = DEFAULT_SECURITY_CONFIG;
  private activityCheckInterval: ReturnType<typeof setInterval> | null = null;
  private csrfToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initActivityTracking();
      if (this.securityConfig.csrfEnabled) {
        void this.fetchCSRFToken();
      }
    }
  }

  /**
   * Initializes listeners to track user activity for inactivity timeout.
   */
  private initActivityTracking(): void {
    const updateActivity = () => {
      this.lastActivity.set(Date.now());
    };

    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('click', updateActivity, { passive: true });
      window.addEventListener('keypress', updateActivity, { passive: true });
      window.addEventListener('scroll', updateActivity, { passive: true });
      window.addEventListener('touchstart', updateActivity, { passive: true });

      this.activityCheckInterval = setInterval(() => {
        this.checkInactivity();
      }, 30000); // Check every 30 seconds
    });
  }

  /**
   * Fetches a CSRF token from the backend API.
   */
  async fetchCSRFToken(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ csrfToken: string }>(
          `${this.API_URL}/security/csrf-token`
        )
      );
      this.csrfToken = res.csrfToken;
    } catch (error) {
      this.logger.error('Failed to fetch CSRF token', error);
      // Fallback to a locally generated one, though this is less secure.
      if (!this.csrfToken) {
        this.csrfToken = this.generateSecureToken(32);
      }
    }
  }

  private generateSecureToken(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Checks if the user has been inactive for longer than the configured timeout.
   */
  private checkInactivity(): void {
    const now = Date.now();
    const lastActive = this.lastActivity();
    const inactiveMs = now - lastActive;

    if (inactiveMs > this.securityConfig.inactivityTimeoutMs) {
      this.ngZone.run(() => {
        if (this.isSessionValid()) {
          this.isSessionValid.set(false);
          this.logger.warn(
            'SecurityService: Session invalidated due to inactivity'
          );
          void this.logEvent(
            'SESSION_TIMEOUT',
            'Session expired due to inactivity'
          );
        }
      });
    }
  }

  /**
   * Checks if a specific action identified by a key is currently rate-limited.
   * @param key A unique string identifying the action (e.g., 'login-attempt').
   * @returns `true` if the action is blocked, `false` otherwise.
   */
  isRateLimited(key: string): boolean {
    const entry = this.rateLimitCache.get(key);
    const now = Date.now();

    if (!entry) return false;

    if (entry.blockedUntil > now) {
      return true;
    }

    entry.attempts = entry.attempts.filter(
      (t) => now - t < this.rateLimitConfig.windowMs
    );

    return entry.attempts.length >= this.rateLimitConfig.maxAttempts;
  }

  /**
   * Records an attempt for a rate-limited action.
   * @param key A unique string identifying the action.
   * @returns An object indicating if the attempt was allowed, remaining attempts, and when the block expires.
   */
  recordAttempt(key: string): {
    allowed: boolean;
    remainingAttempts: number;
    blockedUntil?: number;
  } {
    const now = Date.now();
    let entry = this.rateLimitCache.get(key);

    if (!entry) {
      entry = { attempts: [], blockedUntil: 0 };
      this.rateLimitCache.set(key, entry);
    }

    if (entry.blockedUntil > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        blockedUntil: entry.blockedUntil,
      };
    }

    entry.attempts = entry.attempts.filter(
      (t) => now - t < this.rateLimitConfig.windowMs
    );

    entry.attempts.push(now);

    if (entry.attempts.length >= this.rateLimitConfig.maxAttempts) {
      entry.blockedUntil = now + this.rateLimitConfig.blockDurationMs;
      this.logger.warn(`SecurityService: Rate limit exceeded for key: ${key}`);
      void this.logEvent(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit triggered for: ${key}`
      );
      return {
        allowed: false,
        remainingAttempts: 0,
        blockedUntil: entry.blockedUntil,
      };
    }

    return {
      allowed: true,
      remainingAttempts:
        this.rateLimitConfig.maxAttempts - entry.attempts.length,
    };
  }

  /**
   * Resets the rate limit for a specific key, for example, after a successful action.
   * @param key The unique string identifying the action to clear.
   */
  clearRateLimit(key: string): void {
    this.rateLimitCache.delete(key);
  }

  /**
   * Gets the current CSRF token.
   * @returns The CSRF token string, or null if not available.
   */
  getSecurityConfig() {
    return {
      sessionTimeoutMs: this.securityConfig.sessionTimeoutMs,
      inactivityTimeoutMs: this.securityConfig.inactivityTimeoutMs,
      requireReauthForSensitive: this.securityConfig.requireReauthForSensitive,
    };
  }

  getCSRFToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Validates a given CSRF token against the one stored in the service.
   * @param token The token to validate.
   * @returns `true` if the token is valid, `false` otherwise.
   */
  validateCSRFToken(token: string): boolean {
    if (!this.securityConfig.csrfEnabled || !this.csrfToken) {
      return true; // Don't validate if disabled or not present
    }
    return this.csrfToken === token;
  }

  /**
   * Resets the session inactivity timer and extends the session expiration.
   */
  refreshSession(): void {
    const now = Date.now();
    this.lastActivity.set(now);
    this.sessionExpiresAt.set(now + this.securityConfig.sessionTimeoutMs);
    if (!this.isSessionValid()) {
      this.isSessionValid.set(true);
      this.logEvent('SESSION_RECOVERED', 'Session recovered by user activity.');
    }
  }

  /**
   * Checks if the current session is still valid based on its expiration time.
   * @returns `true` if the session is valid, `false` otherwise.
   */
  validateSession(): boolean {
    const expiresAt = this.sessionExpiresAt();
    if (!expiresAt) {
      return true; // No expiration has been set yet.
    }

    const isValid = Date.now() < expiresAt;
    if (!isValid && this.isSessionValid()) {
      this.isSessionValid.set(false);
      this.logEvent(
        'SESSION_EXPIRED',
        'Session has expired based on absolute timeout.'
      );
    }
    return isValid;
  }

  /**
   * Sanitizes a string to prevent XSS by escaping HTML characters.
   * @param input The string to sanitize.
   * @returns The sanitized string.
   */
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

  /**
   * WARNING: THIS IS NOT A SECURE ENCRYPTION METHOD.
   * It provides simple obfuscation via XOR cipher and should not be used for sensitive data.
   * It is intended for demonstration purposes only.
   * @param data The string to obfuscate.
   * @returns The obfuscated string, base64-encoded.
   */
  obfuscate(data: string): string {
    if (!data) return '';
    const key = this.XOR_KEY;
    const encrypted = data
      .split('')
      .map((char, i) => {
        return String.fromCharCode(
          char.charCodeAt(0) ^ key.charCodeAt(i % key.length)
        );
      })
      .join('');
    return btoa(encrypted);
  }

  /**
   * WARNING: THIS IS NOT A SECURE DECRYPTION METHOD.
   * De-obfuscates a string that was obfuscated with the `obfuscate` method.
   * @param data The base64-encoded obfuscated string.
   * @returns The original string, or an empty string if de-obfuscation fails.
   */
  deobfuscate(data: string): string {
    if (!data) return '';
    try {
      const key = this.XOR_KEY;
      const decoded = atob(data);
      return decoded
        .split('')
        .map((char, i) => {
          return String.fromCharCode(
            char.charCodeAt(0) ^ key.charCodeAt(i % key.length)
          );
        })
        .join('');
    } catch (e) {
      this.logger.error('De-obfuscation failed', e);
      return '';
    }
  }

  /**
   * Validates if a URL is a safe, same-origin redirect target.
   * @param url The URL to validate.
   * @returns `true` if the URL is safe for redirection, `false` otherwise.
   */
  isValidRedirectUrl(url: string): boolean {
    if (!url || typeof window === 'undefined') return false;
    const allowedOrigin = window.location.origin;

    try {
      const parsedUrl = new URL(url, allowedOrigin);
      return parsedUrl.origin === allowedOrigin;
    } catch (e) {
      // Handles relative URLs, which are always same-origin.
      return url.startsWith('/') && !url.startsWith('//');
    }
  }

  /**
   * Logs a security-related event, both locally and to the remote API.
   * @param eventType A category for the event (e.g., 'LOGIN_SUCCESS').
   * @param description A detailed message about the event.
   * @param userId The ID of the user associated with the event.
   */
  async logEvent(
    eventType: string,
    description: string,
    userId?: string
  ): Promise<void> {
    const profile = this.profileService.profile();
    const resolvedUserId = userId || (profile as any)?.id || 'anonymous';

    const localLog: SecurityLog = {
      log_id: Date.now(),
      user_id: resolvedUserId,
      event_type: eventType,
      description,
      // NOTE: IP address and user agent are hardcoded for this client-side service.
      // In a real application, this would be determined by the server.
      ip_address: '127.0.0.1',
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      created_at: new Date().toISOString(),
    };

    this.logs.update((current) => [localLog, ...current.slice(0, 99)]);

    try {
      await firstValueFrom(
        this.http.post(
          `${this.API_URL}/security/log`,
          { eventType, description, userId: resolvedUserId },
          this.getHeaders()
        )
      );
    } catch (error) {
      this.logger.error('Failed to log remote security event', error);
    }
  }

  async fetchLogs(userId: string = 'anonymous'): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<SecurityLog[]>(
          `${this.API_URL}/security/logs/${userId}`,
          this.getHeaders()
        )
      );
      this.logs.set(data);
    } catch (error) {
      this.logger.error('Failed to fetch security logs', error);
    }
  }

  async fetchSessions(userId: string = 'anonymous'): Promise<void> {
    try {
      const data = await firstValueFrom(
        this.http.get<UserSession[]>(
          `${this.API_URL}/security/sessions/${userId}`,
          this.getHeaders()
        )
      );
      this.sessions.set(data);
    } catch (error) {
      this.logger.error('Failed to fetch active sessions', error);
    }
  }

  async revokeSession(
    sessionId: string,
    userId: string = 'anonymous'
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.API_URL}/security/session/${sessionId}`,
          this.getHeaders()
        )
      );
      await this.fetchSessions(userId);
      await this.logEvent(
        'SESSION_REVOKED',
        `Revoked session ${sessionId}`,
        userId
      );
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
    }
  }

  /**
   * Returns a recommended Content Security Policy (CSP) string.
   * This should be configured on the server-side via HTTP headers.
   */
  getRecommendedCSP(): string {
    const self = "'self'";
    const scripts = [self, 'https://trusted-scripts.com'];
    const styles = [self, 'https://trusted-styles.com'];
    const images = [self, 'data:'];
    const connect = [self, this.API_URL];

    return [
      `default-src ${self}`,
      `script-src ${scripts.join(' ')}`,
      `style-src ${styles.join(' ')}`,
      `img-src ${images.join(' ')}`,
      `connect-src ${connect.join(' ')}`,
      `frame-ancestors 'none'`,
      `object-src 'none'`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
  }

  /**
   * Performs a security audit of the current user session and profile.
   * @returns An object with a security score, status, and a list of alerts.
   */
  getSecurityAudit(): { score: number; status: string; alerts: string[] } {
    let authService: AuthService | null = null;
    try {
      authService = this.injector.get(AuthService, null);
    } catch {
      // In case AuthService is not available
    }
    const profile = this.profileService.profile();
    const user = authService?.currentUser();

    let score = 100;
    const alerts: string[] = [];

    if (!user?.emailVerified) {
      score -= 40;
      alerts.push('CRITICAL: Secure channel unverified. Identity at risk.');
    }

    if (!profile?.settings?.security?.twoFactorEnabled) {
      score -= 30;
      alerts.push('WARNING: Multi-factor authentication disabled.');
    }

    if (this.sessions().length > this.securityConfig.maxConcurrentSessions) {
      score -= 15;
      alerts.push('NOTICE: Multiple concurrent sessions detected.');
    }

    if (!this.validateSession()) {
      score -= 20;
      alerts.push('NOTICE: Session integrity compromised.');
    }

    return {
      score: Math.max(0, score),
      status:
        score >= 90 ? 'FORTIFIED' : score >= 60 ? 'VULNERABLE' : 'COMPROMISED',
      alerts,
    };
  }

  /**
   * Cleans up resources, such as intervals, to prevent memory leaks.
   */
  cleanup(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }
}

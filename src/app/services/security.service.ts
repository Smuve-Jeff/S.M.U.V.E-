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

  private getHeaders() {
    try {
      const token = this.injector.get(AuthService, null)?.jwtToken();
      return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
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
      this.initCSRFToken();
    }
  }

  private initActivityTracking(): void {
    const updateActivity = () => {
      this.lastActivity.set(Date.now());
    };

    // Track user activity
    window.addEventListener('click', updateActivity, { passive: true });
    window.addEventListener('keypress', updateActivity, { passive: true });
    window.addEventListener('scroll', updateActivity, { passive: true });
    window.addEventListener('touchstart', updateActivity, { passive: true });

    // Start inactivity check
    this.ngZone.runOutsideAngular(() => {
      this.activityCheckInterval = setInterval(() => {
        this.checkInactivity();
      }, 30000); // Check every 30 seconds
    });
  }

  private initCSRFToken(): void {
    // Generate a CSRF token for form submissions
    this.csrfToken = this.generateSecureToken(32);
    sessionStorage.setItem('_csrf', this.csrfToken);
  }

  private generateSecureToken(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private checkInactivity(): void {
    const now = Date.now();
    const lastActive = this.lastActivity();
    const inactiveMs = now - lastActive;

    if (inactiveMs > this.securityConfig.inactivityTimeoutMs) {
      this.ngZone.run(() => {
        this.isSessionValid.set(false);
        this.logger.warn(
          'SecurityService: Session invalidated due to inactivity'
        );
        void this.logEvent(
          'SESSION_TIMEOUT',
          'Session expired due to inactivity'
        );
      });
    }
  }

  /**
   * Checks if an action is rate limited.
   */
  isRateLimited(key: string): boolean {
    const entry = this.rateLimitCache.get(key);
    const now = Date.now();

    if (!entry) return false;

    // Check if currently blocked
    if (entry.blockedUntil > now) {
      return true;
    }

    // Clean old attempts
    entry.attempts = entry.attempts.filter(
      (t) => now - t < this.rateLimitConfig.windowMs
    );

    return entry.attempts.length >= this.rateLimitConfig.maxAttempts;
  }

  /**
   * Records an attempt for rate limiting.
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

    // Check if currently blocked
    if (entry.blockedUntil > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        blockedUntil: entry.blockedUntil,
      };
    }

    // Clean old attempts
    entry.attempts = entry.attempts.filter(
      (t) => now - t < this.rateLimitConfig.windowMs
    );

    // Add new attempt
    entry.attempts.push(now);

    // Check if should block
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
   * Clears rate limit for a key (e.g., after successful auth).
   */
  clearRateLimit(key: string): void {
    this.rateLimitCache.delete(key);
  }

  /**
   * Gets CSRF token for form submissions.
   */
  getCSRFToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Validates CSRF token.
   */
  validateCSRFToken(token: string): boolean {
    return this.csrfToken === token;
  }

  /**
   * Refreshes the session timeout.
   */
  refreshSession(): void {
    const now = Date.now();
    this.lastActivity.set(now);
    this.sessionExpiresAt.set(now + this.securityConfig.sessionTimeoutMs);
    this.isSessionValid.set(true);
  }

  /**
   * Validates current session.
   */
  validateSession(): boolean {
    const expiresAt = this.sessionExpiresAt();
    if (!expiresAt) {
      return true; // No expiration set
    }

    const isValid = Date.now() < expiresAt;
    this.isSessionValid.set(isValid);
    return isValid;
  }

  /**
   * Sanitizes user input to prevent XSS.
   */
  sanitizeInput(input: string): string {
    if (!input) return '';

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validates URL to prevent open redirect vulnerabilities.
   */
  encrypt(data: string): string {
    return btoa(data);
  }
  decrypt(data: string): string {
    return atob(data);
  }
  incrementRateLimit(key: string): void {
    this.recordAttempt(key);
  }
  isValidRedirectUrl(url: string): boolean {
    if (!url) return false;

    try {
      const parsed = new URL(url, window.location.origin);
      // Only allow same-origin redirects
      return parsed.origin === window.location.origin;
    } catch {
      // Relative URLs are fine
      return url.startsWith('/') && !url.startsWith('//');
    }
  }

  async logEvent(
    eventType: string,
    description: string,
    userId?: string
  ): Promise<void> {
    const profile = this.profileService.profile();
    const resolvedUserId = userId || (profile as any)?.id || 'anonymous';

    // Always log locally
    const localLog: SecurityLog = {
      log_id: Date.now(),
      user_id: resolvedUserId,
      event_type: eventType,
      description,
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
          {
            userId: resolvedUserId,
            eventType,
            description,
            ipAddress: '127.0.0.1',
            userAgent:
              typeof navigator !== 'undefined'
                ? navigator.userAgent
                : 'unknown',
          },
          this.getHeaders()
        )
      );
    } catch (error) {
      // Logging should never break the app.
      this.logger.error('Failed to log security event', error);
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

  async registerCurrentSession(
    sessionId: string,
    deviceName: string,
    location: string,
    userId: string
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${this.API_URL}/security/session`,
          {
            sessionId,
            userId,
            deviceName,
            location,
          },
          this.getHeaders()
        )
      );
    } catch (error) {
      this.logger.error('Failed to register session', error);
    }
  }

  /**
   * Gets security configuration.
   */
  getSecurityConfig(): SecurityConfig {
    return { ...this.securityConfig };
  }

  /**
   * Updates security configuration.
   */
  updateSecurityConfig(config: Partial<SecurityConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
  }

  getSecurityAudit(): { score: number; status: string; alerts: string[] } {
    let authService: AuthService | null = null;
    try {
      authService = this.injector.get(AuthService, null);
    } catch {
      authService = null;
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

    if (!this.validateSession()) {
      score -= 20;
      alerts.push('NOTICE: Session integrity compromised.');
    }

    return {
      score: Math.max(0, score),
      status:
        score >= 90 ? 'FORTIFIED' : score >= 70 ? 'VULNERABLE' : 'COMPROMISED',
      alerts,
    };
  }

  /**
   * Cleans up resources manually. Called explicitly when needed since root-level
   * services don't go through normal Angular lifecycle destruction.
   */
  cleanup(): void {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
  }
}

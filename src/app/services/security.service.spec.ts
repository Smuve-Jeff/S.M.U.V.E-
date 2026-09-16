import { TestBed } from '@angular/core/testing';
import { SecurityService } from './security.service';
import { LoggingService } from './logging.service';
import { TokenService } from './token.service';

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        { provide: LoggingService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
        { provide: TokenService, useValue: {} },
      ],
    });
    service = TestBed.inject(SecurityService);
  });

  it('invalidates an expired session instead of leaving the signal green', () => {
    service.sessionExpiresAt.set(Date.now() - 1);
    expect(service.validateSession()).toBe(false);
    expect(service.isSessionValid()).toBe(false);
  });

  it('creates a CSRF token only through the browser crypto path and validates exact matches', () => {
    const token = service.getCSRFToken();
    expect(token).toEqual(expect.any(String));
    expect(token).toHaveLength(64);
    expect(service.validateCSRFToken(token!)).toBe(true);
    expect(service.validateCSRFToken(`${token}x`)).toBe(false);
  });

  it('rejects external, protocol-relative, and credential-bearing redirects', () => {
    expect(service.isValidRedirectUrl('/settings')).toBe(true);
    expect(service.isValidRedirectUrl('//evil.example/settings')).toBe(false);
    expect(service.isValidRedirectUrl('https://evil.example/settings')).toBe(false);
    expect(service.isValidRedirectUrl('https://user:pass@example.test/')).toBe(false);
  });

  it('blocks only after the configured number of attempts and remains blocked', () => {
    for (let i = 0; i < 5; i++) expect(service.recordAttempt('login').allowed).toBe(true);
    const blocked = service.recordAttempt('login');
    expect(blocked.allowed).toBe(false);
    expect(service.isRateLimited('login')).toBe(true);
  });

  it('does not report a fully fortified audit before 2FA enrollment and CSRF setup', () => {
    const audit = service.getSecurityAudit();
    expect(audit.status).not.toBe('FORTIFIED');
    expect(audit.alerts).toEqual(expect.arrayContaining(['2FA is not enrolled']));
  });
});

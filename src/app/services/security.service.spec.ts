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

  it('enforces the same password policy the API enforces', () => {
    expect(service.evaluatePasswordPolicy('Sup3rSecret!').valid).toBe(true);
    expect(service.evaluatePasswordPolicy('weakpass1').valid).toBe(false);
    expect(service.evaluatePasswordPolicy('Password1!').valid).toBe(false);
    const short = service.evaluatePasswordPolicy('Ab1!');
    expect(short.valid).toBe(false);
    expect(short.failures).toEqual(
      expect.arrayContaining(['Use at least 8 characters'])
    );
    // A stronger secret must score higher than a merely acceptable one.
    expect(service.evaluatePasswordPolicy('Sup3rSecret!').score).toBeGreaterThan(
      service.evaluatePasswordPolicy('Abcdef1!').score
    );
  });

  it('issues single-use recovery codes and proves they cannot be replayed', async () => {
    const codes = await service.generateBackupCodes(4);
    expect(codes).toHaveLength(4);
    expect(service.backupCodesRemaining()).toBe(4);

    expect(await service.verifyBackupCode(codes[0])).toBe(true);
    expect(service.backupCodesRemaining()).toBe(3);
    // The same code must never be accepted twice.
    expect(await service.verifyBackupCode(codes[0])).toBe(false);
    expect(await service.verifyBackupCode('AAAAA-BBBBB')).toBe(false);
    expect(service.backupCodesRemaining()).toBe(3);

    service.clearBackupCodes();
    expect(service.backupCodesRemaining()).toBe(0);
    expect(await service.verifyBackupCode(codes[1])).toBe(false);
  });

  it('zeroizes every secret it holds when a session terminates', async () => {
    await service.generateBackupCodes(2);
    service.setCSRFToken('0123456789abcdef0123456789abcdef');
    service.recordAttempt('login');
    await service.logEvent('TEST', 'a logged event');

    const report = service.zeroizeSensitiveData();

    expect(report.wiped).toEqual(
      expect.arrayContaining(['csrf_token', 'backup_code_hashes'])
    );
    expect(service.getCSRFToken()).not.toBe('0123456789abcdef0123456789abcdef');
    expect(service.backupCodesRemaining()).toBe(0);
    expect(service.logs()).toHaveLength(0);
    expect(service.validateSession()).toBe(false);
  });

  it('locks the session once the idle window elapses and unlocks on demand', async () => {
    service.configureAutoLock(true, 60_000);
    const csrfBeforeLock = service.getCSRFToken();
    // Move the activity marker past the configured idle window.
    service.lastActivity.set(Date.now() - 61_000);

    expect(service.autoLockRemainingMs()).toBe(0);
    expect(service.lockNow('inactivity')).toBe(true);
    expect(service.isLocked()).toBe(true);
    expect(service.lockNow('inactivity')).toBe(false);

    // Locking drops the volatile secret a locked shell must not keep using.
    expect(service.validateSession()).toBe(false);
    expect(service.getCSRFToken()).not.toBe(csrfBeforeLock);

    expect(service.unlock()).toBe(true);
    expect(service.isLocked()).toBe(false);
    expect(service.validateSession()).toBe(true);
    service.configureAutoLock(false);
  });
});

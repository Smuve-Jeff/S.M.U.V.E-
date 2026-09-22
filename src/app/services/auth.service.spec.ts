import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';

import { AuthService } from './auth.service';
import { APP_SECURITY_CONFIG } from '../app.security';
import { ApiAuthService } from './api-auth.service';
import { LoggingService } from './logging.service';
import { SecurityService } from './security.service';
import { TokenService } from './token.service';
import { UserProfileService } from './user-profile.service';
import { UserStoreService } from './user-store.service';

/**
 * Storage-rejection hardening: private/restricted browser contexts expose the
 * storage APIs but throw on use. None of these paths may crash an auth flow —
 * and none may pass silently when persistence is lost.
 */
describe('AuthService', () => {
  const EMAIL = 'artist@smuve.dev';
  const PASSWORD = 'Mixing!4Life';

  let service: AuthService;
  let userStore: {
    user: ReturnType<typeof signal<any>>;
    isAuthenticated: ReturnType<typeof signal<boolean>>;
    setUser: jest.Mock;
  };
  let tokenService: { jwtToken: ReturnType<typeof signal<string | null>>; setToken: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  /** Seed an account record whose hash matches the real PBKDF2 path. */
  const seedAccount = async () => {
    const passwordHash = await (service as any).deriveKey(
      PASSWORD,
      APP_SECURITY_CONFIG.auth_salt
    );
    localStorage.setItem(
      `smuve_db_user_${EMAIL}`,
      JSON.stringify({
        id: 'usr_test',
        email: EMAIL,
        artistName: 'TEST_ARTIST',
        passwordHash,
        role: 'Artist',
        permissions: ['STANDARD'],
        createdAt: new Date('2026-01-01').toISOString(),
        profileCompleteness: 0,
        emailVerified: false,
        requires2FA: false,
      })
    );
  };

  /**
   * Blocks one storage operation everywhere (jsdom's Storage instances reject
   * per-instance spies). Every flow under test touches a single store per
   * operation, so this is equivalent to blocking the store it names.
   */
  const blockStorage = (method: 'getItem' | 'setItem' | 'removeItem') =>
    jest.spyOn(Storage.prototype, method).mockImplementation((() => {
      throw new Error('storage blocked');
    }) as any);

  /**
   * Blocks writes under one key namespace only. The capability probe writes a
   * private probe key, so it passes and the real write is what fails — the
   * path a full quota or a per-key rejection would actually take.
   */
  const blockKeyWrite = (prefix: string) => {
    const original = Storage.prototype.setItem;
    jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (
        this: Storage,
        key: string,
        value: string
      ) {
        if (String(key).startsWith(prefix)) throw new Error('storage blocked');
        original.call(this, key, value);
      });
  };

  beforeEach(() => {
    userStore = {
      user: signal<any>(null),
      isAuthenticated: signal(false),
      setUser: jest.fn((u: any) => userStore.user.set(u)),
    };
    tokenService = { jwtToken: signal<string | null>(null), setToken: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: UserStoreService, useValue: userStore },
        { provide: TokenService, useValue: tokenService },
        { provide: LoggingService, useValue: logger },
        { provide: SecurityService, useValue: {} },
        {
          provide: UserProfileService,
          useValue: { loadProfile: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ApiAuthService, useValue: { me: jest.fn() } },
        { provide: HttpClient, useValue: {} },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('login', () => {
    it('reports a storage rejection when the account store cannot be read', async () => {
      blockStorage('getItem');

      const result = await service.login({ email: EMAIL, password: PASSWORD });

      expect(result.success).toBe(false);
      expect(result.message).toBe('STORAGE UNAVAILABLE. NEURAL LINK FAILS.');
    });

    it(
      'grants access but warns when the session cannot be persisted',
      async () => {
        await seedAccount();
        blockKeyWrite('smuve_auth_session');

        const result = await service.login({ email: EMAIL, password: PASSWORD });

        expect(result.success).toBe(true);
        expect(result.message).toContain('ACCESS GRANTED');
        expect(result.message).toContain(
          'STORAGE REJECTED: THIS SESSION WILL NOT SURVIVE A RELOAD.'
        );
        expect(userStore.setUser).toHaveBeenCalledWith(
          expect.objectContaining({ email: EMAIL })
        );
        expect(logger.warn).toHaveBeenCalledWith(
          'AUTH_ALERT: SESSION PERSISTENCE REJECTED BY STORAGE.'
        );
      },
      15000
    );
  });

  describe('register', () => {
    it(
      'reports a storage rejection when the account record cannot be written',
      async () => {
        blockKeyWrite('smuve_db_user_');

        const result = await service.register(
          { email: EMAIL, password: PASSWORD },
          'TEST_ARTIST'
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe('STORAGE REJECTED. NEURAL LINK FAILS.');
      },
      15000
    );

    it(
      'reports a storage rejection when the account store cannot be read',
      async () => {
        blockStorage('getItem');

        const result = await service.register(
          { email: EMAIL, password: PASSWORD },
          'TEST_ARTIST'
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe('STORAGE REJECTED. NEURAL LINK FAILS.');
      },
      15000
    );

    it(
      'keeps going when only the verification code write is rejected',
      async () => {
        const original = Storage.prototype.setItem;
        jest
          .spyOn(Storage.prototype, 'setItem')
          .mockImplementation(function (
            this: Storage,
            key: string,
            value: string
          ) {
            if (String(key).startsWith('smuve_verification_')) {
              throw new Error('quota exceeded');
            }
            original.call(this, key, value);
          });

        const result = await service.register(
          { email: EMAIL, password: PASSWORD },
          'TEST_ARTIST'
        );

        // The account exists — only code delivery is degraded.
        expect(result.success).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          'AUTH_ALERT: VERIFICATION CODE PERSISTENCE REJECTED.'
        );
      },
      15000
    );
  });

  describe('verifyEmail', () => {
    it('marks the stored account verified and clears the code', async () => {
      await seedAccount();
      localStorage.setItem(`smuve_verification_${EMAIL}`, '123456');

      const result = await service.verifyEmail('123456', EMAIL);

      expect(result.success).toBe(true);
      const stored = JSON.parse(localStorage.getItem(`smuve_db_user_${EMAIL}`)!);
      expect(stored.emailVerified).toBe(true);
      expect(localStorage.getItem(`smuve_verification_${EMAIL}`)).toBeNull();
    });

    it('survives a corrupt account record instead of crashing', async () => {
      localStorage.setItem(`smuve_db_user_${EMAIL}`, '{not json');
      localStorage.setItem(`smuve_verification_${EMAIL}`, '123456');

      const result = await service.verifyEmail('123456', EMAIL);

      expect(result.success).toBe(true);
    });

    it('rejects with a storage message when the store cannot be read', async () => {
      blockStorage('getItem');

      const result = await service.verifyEmail('123456', EMAIL);

      expect(result.success).toBe(false);
      expect(result.message).toBe('STORAGE REJECTED. NEURAL LINK FAILS.');
    });

    it('still verifies when the verified flag cannot be written back', async () => {
      await seedAccount();
      localStorage.setItem(`smuve_verification_${EMAIL}`, '123456');
      const original = Storage.prototype.setItem;
      jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(function (
          this: Storage,
          key: string,
          value: string
        ) {
          if (String(key).startsWith('smuve_db_user_')) {
            throw new Error('quota exceeded');
          }
          original.call(this, key, value);
        });

      const result = await service.verifyEmail('123456', EMAIL);

      expect(result.success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'AUTH_ALERT: VERIFICATION WRITE REJECTED BY STORAGE.'
      );
    });
  });

  describe('session teardown and API hand-off', () => {
    it('clears state even when the session store refuses to be read', async () => {
      blockStorage('getItem');

      await service.loadSession();

      expect(userStore.setUser).toHaveBeenCalledWith(null);
      expect(tokenService.setToken).toHaveBeenCalledWith(null);
    });

    it('logs out cleanly when the session store refuses removal', () => {
      blockStorage('removeItem');

      expect(() => service.logout()).not.toThrow();
      expect(userStore.setUser).toHaveBeenCalledWith(null);
      expect(logger.info).toHaveBeenCalledWith('AUTH_LOG: SESSION TERMINATED.');
    });

    it('establishes an API session even when persistence is rejected', () => {
      blockStorage('setItem');

      const user = service.establishApiSession({
        token: 'jwt-token',
        user: {
          id: 7,
          name: 'TEST_ARTIST',
          email: EMAIL,
          role: 'artist',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      // A granted API login must not be turned into a failure (or a second
      // legacy login) by a storage rejection afterwards.
      expect(user.email).toBe(EMAIL);
      expect(userStore.setUser).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'AUTH_ALERT: SESSION PERSISTENCE REJECTED BY STORAGE.'
      );
    });
  });
});

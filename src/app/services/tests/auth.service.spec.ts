import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { AuthService } from '../auth.service';
import { SecurityService } from '../security.service';
import { LoggingService } from '../logging.service';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { LoginConfirmationService } from '../login-confirmation.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  let securityServiceMock: any;
  let profileServiceMock: any;
  let loginConfirmationServiceMock: any;

  const AUTH_SESSION_URL = 'https://s-m-u-v-e-2-0-fixed.onrender.com/api/auth/session';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    securityServiceMock = {
      validateSession: jest.fn().mockReturnValue(true),
      refreshSession: jest.fn(),
      recordAttempt: jest.fn().mockReturnValue({
        allowed: true,
        remainingAttempts: 4,
      }),
      clearRateLimit: jest.fn(),
      sanitizeInput: jest.fn((value: string) => value.trim()),
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    profileServiceMock = {
      profile: signal(initialProfile),
      loadProfile: jest.fn().mockResolvedValue(undefined),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };
    loginConfirmationServiceMock = {
      sendLoginConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SecurityService, useValue: securityServiceMock },
        {
          provide: LoggingService,
          useValue: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
        },
        { provide: UserProfileService, useValue: profileServiceMock },
        {
          provide: LoginConfirmationService,
          useValue: loginConfirmationServiceMock,
        },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);

    jest.spyOn(service as any, 'deriveKey').mockResolvedValue('mock-hash');
    jest.spyOn(service as any, 'encrypt').mockImplementation((s: string) => s);
    jest.spyOn(service as any, 'decrypt').mockImplementation((s: string) => s);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('registers profiles against the created user id', async () => {
    const resultPromise = service.register(
      { email: 'Artist@Example.com', password: 'Secret-pass123!' },
      '  Test Artist  '
    );

    // Flush microtasks to allow deriveKey to resolve and acquireJwt to start
    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne(AUTH_SESSION_URL);
    req.flush({ token: 'mock-jwt-token' });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(profileServiceMock.updateProfile).toHaveBeenCalled();
  });

  it('normalizes email casing and spacing during login', async () => {
    // Register
    const regPromise = service.register({ email: 'Artist@Example.com', password: 'Secret-pass123!' }, 'Test Artist');
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne(AUTH_SESSION_URL).flush({ token: 'mock-jwt-token' });
    await regPromise;

    // Login
    const loginPromise = service.login({
      email: '  artist@example.com  ',
      password: 'Secret-pass123!',
    });
    await Promise.resolve();
    await Promise.resolve();
    httpMock.expectOne(AUTH_SESSION_URL).flush({ token: 'mock-jwt-token-2' });

    const result = await loginPromise;
    expect(result.success).toBe(true);
    expect(service.currentUser()?.email).toBe('artist@example.com');
  });

  it('does not send a confirmation email when login fails', async () => {
     // Register first to have a user
     const regPromise = service.register({ email: 'artist@example.com', password: 'Secret-pass123!' }, 'Test Artist');
     await Promise.resolve();
     await Promise.resolve();
     httpMock.expectOne(AUTH_SESSION_URL).flush({ token: 'mock-jwt-token' });
     await regPromise;

     // Mock incorrect password hash
     jest.spyOn(service as any, 'deriveKey').mockResolvedValue('wrong-hash');

     const result = await service.login({
        email: 'artist@example.com',
        password: 'wrong-pass',
     });

     await Promise.resolve();
     await Promise.resolve();

     httpMock.expectNone(AUTH_SESSION_URL);
     expect(result.success).toBe(false);
     expect(loginConfirmationServiceMock.sendLoginConfirmation).not.toHaveBeenCalled();
  });
});

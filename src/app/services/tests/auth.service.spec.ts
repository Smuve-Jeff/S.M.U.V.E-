import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { AuthCredentials, AuthService } from '../auth.service';
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

  const AUTH_SESSION_URL =
    'https://s-m-u-v-e-2-0-fixed.onrender.com/api/auth/session';

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
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('registers profiles against the created user id', async () => {
    const resultPromise = service.register(
      { email: 'Artist@Example.com', password: 'Secret-pass123!' },
      '  Test Artist  '
    );

    // Flush microtasks so the pending session request can be observed.
    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne(AUTH_SESSION_URL);
    req.flush({ token: 'mock-jwt-token' });

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(profileServiceMock.updateProfile).toHaveBeenCalledWith({
      artistName: 'Test Artist',
    });
  });

  it('normalizes email casing and spacing during login', async () => {
    // Register
    const regPromise = service.register(
      { email: 'Artist@Example.com', password: 'Secret-pass123!' },
      'Test Artist'
    );
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
    expect(service.jwtToken()).toBe('mock-jwt-token-2');
  });

  it('does not send a confirmation email when login fails', async () => {
    const result = await service.login({
      email: 'artist@example.com',
      password: 'wrong-pass',
    });

    httpMock.expectNone(AUTH_SESSION_URL);
    expect(result.success).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.jwtToken()).toBeNull();
    expect(
      loginConfirmationServiceMock.sendLoginConfirmation
    ).not.toHaveBeenCalled();
  });

  it('does not update the profile when registration fails', async () => {
    const creds: AuthCredentials = {
      email: 'artist@example.com',
      password: 'wrong-pass',
    };

    const result = await service.register(creds, '  Test Artist  ');

    httpMock.expectNone(AUTH_SESSION_URL);
    expect(result.success).toBe(false);
    expect(profileServiceMock.updateProfile).not.toHaveBeenCalled();
  });
});

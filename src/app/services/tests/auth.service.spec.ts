import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { AuthService } from '../auth.service';
import { SecurityService } from '../security.service';
import { LoggingService } from '../logging.service';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { LoginConfirmationService } from '../login-confirmation.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  let securityServiceMock: {
    validateSession: jest.Mock;
    refreshSession: jest.Mock;
    recordAttempt: jest.Mock;
    clearRateLimit: jest.Mock;
    sanitizeInput: jest.Mock;
    logEvent: jest.Mock;
  };
  let profileServiceMock: {
    profile: ReturnType<typeof signal>;
    loadProfile: jest.Mock;
    updateProfile: jest.Mock;
  };
  let loginConfirmationServiceMock: {
    sendLoginConfirmation: jest.Mock;
  };

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
      loadProfile: jest.fn().mockImplementation(async (userId: string) => {
        profileServiceMock.profile.set({
          ...initialProfile,
          id: userId,
          settings: {
            ...initialProfile.settings,
            security: {
              twoFactorEnabled: false,
            },
          },
        });
      }),
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

  it('registers profiles against the created user id', fakeAsync(() => {
    let result: any;
    service.register(
      { email: 'Artist@Example.com', password: 'secret-pass' },
      '  Test Artist  '
    ).then(r => result = r);

    tick(1000);

    const req = httpMock.expectOne(r => r.url.endsWith('/auth/session'));
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'mock-jwt-token' });

    tick();

    expect(result.success).toBe(true);
    expect(profileServiceMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        artistName: 'Test Artist',
      })
    );
    expect(service.jwtToken()).toBe('mock-jwt-token');
  }));

  it('normalizes email casing and spacing during login', fakeAsync(() => {
    service.register(
      { email: 'Artist@Example.com', password: 'secret-pass' },
      'Test Artist'
    );

    tick(1000);
    let req = httpMock.expectOne(r => r.url.endsWith('/auth/session'));
    req.flush({ token: 'mock-jwt-token' });
    tick();

    let result: any;
    service.login({
      email: '  artist@example.com  ',
      password: 'secret-pass',
    }).then(r => result = r);

    tick(1000);
    req = httpMock.expectOne(r => r.url.endsWith('/auth/session'));
    req.flush({ token: 'mock-jwt-token-2' });
    tick();

    expect(result.success).toBe(true);
    expect(profileServiceMock.loadProfile).toHaveBeenCalledWith(
      expect.any(String)
    );
    expect(service.currentUser()?.email).toBe('artist@example.com');
    expect(service.jwtToken()).toBe('mock-jwt-token-2');
  }));

  it('does not send a confirmation email when login fails', fakeAsync(() => {
    service.register(
      { email: 'artist@example.com', password: 'secret-pass' },
      'Test Artist'
    );
    tick(1000);
    let req = httpMock.expectOne(r => r.url.endsWith('/auth/session'));
    req.flush({ token: 'mock-jwt-token' });
    tick();

    let result: any;
    service.login({
      email: 'artist@example.com',
      password: 'wrong-pass',
    }).then(r => result = r);

    tick(1000);
    httpMock.expectNone(r => r.url.endsWith('/auth/session') && r.method === 'POST');

    expect(result.success).toBe(false);
    expect(
      loginConfirmationServiceMock.sendLoginConfirmation
    ).not.toHaveBeenCalled();
  }));
});

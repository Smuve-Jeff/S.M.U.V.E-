import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';

import { AuthService } from '../auth.service';
import { SecurityService } from '../security.service';
import { LoggingService } from '../logging.service';
import { UserProfileService, initialProfile } from '../user-profile.service';
import { LoginConfirmationService } from '../login-confirmation.service';

describe('AuthService', () => {
  let service: AuthService;
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
  });

  it('registers profiles against the created user id', async () => {
    const result = await service.register(
      { email: 'Artist@Example.com', password: 'secret-pass' },
      '  Test Artist  '
    );

    expect(result.success).toBe(true);
    expect(profileServiceMock.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        artistName: 'Test Artist',
      }),
      expect.any(String)
    );
    const [[profileArg, userIdArg]] =
      profileServiceMock.updateProfile.mock.calls;
    expect(profileArg.id).toBe(userIdArg);
  });

  it('normalizes email casing and spacing during login', async () => {
    await service.register(
      { email: 'Artist@Example.com', password: 'secret-pass' },
      'Test Artist'
    );

    const result = await service.login({
      email: '  artist@example.com  ',
      password: 'secret-pass',
    });

    expect(result.success).toBe(true);
    expect(profileServiceMock.loadProfile).toHaveBeenCalledWith(
      expect.any(String)
    );
    expect(service.currentUser()?.email).toBe('artist@example.com');
    expect(
      loginConfirmationServiceMock.sendLoginConfirmation
    ).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'artist@example.com' })
    );
  });

  it('does not send a confirmation email when login fails', async () => {
    await service.register(
      { email: 'artist@example.com', password: 'secret-pass' },
      'Test Artist'
    );

    const result = await service.login({
      email: 'artist@example.com',
      password: 'wrong-pass',
    });

    expect(result.success).toBe(false);
    expect(
      loginConfirmationServiceMock.sendLoginConfirmation
    ).not.toHaveBeenCalled();
  });
});

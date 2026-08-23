import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { ApiAuthService } from '../../services/api-auth.service';
import { SecurityService } from '../../services/security.service';
import { OnboardingService } from '../../services/onboarding.service';
import { LoggingService } from '../../services/logging.service';
import { LoginConfirmationService } from '../../services/login-confirmation.service';

describe('LoginComponent', () => {
  const build = async () => {
    const authMock = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      currentUser: jest.fn().mockReturnValue(null),
      validatePassword: jest.fn().mockReturnValue({
        isValid: false,
        errors: ['PASSWORD TOO SHORT.'],
      }),
      login: jest.fn(),
      register: jest.fn(),
      verifyEmail: jest.fn(),
      resendVerificationCode: jest.fn(),
      establishApiSession: jest.fn(),
    };
    const apiAuthMock = {
      login: jest.fn().mockRejectedValue({ status: 0 }),
      register: jest.fn().mockRejectedValue({ status: 0 }),
    };
    const securityMock = {
      isValidRedirectUrl: jest.fn().mockReturnValue(false),
    };
    const onboardingMock = {
      shouldShow: jest.fn(() => false),
    };
    const loggerMock = {
      system: jest.fn(),
      error: jest.fn(),
    };
    const loginConfirmationMock = {
      sendLoginConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ApiAuthService, useValue: apiAuthMock },
        { provide: SecurityService, useValue: securityMock },
        { provide: OnboardingService, useValue: onboardingMock },
        { provide: LoggingService, useValue: loggerMock },
        { provide: LoginConfirmationService, useValue: loginConfirmationMock },
        {
          provide: Router,
          useValue: { navigate: jest.fn(), navigateByUrl: jest.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: jest.fn(() => null) } },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    return { fixture, authMock, loginConfirmationMock };
  };

  it('renders the authorization form without throwing', async () => {
    const { fixture } = await build();
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('S.M.U.V.E');
  });

  it('renders the primary CTA for the default login mode', async () => {
    const { fixture } = await build();
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    expect(buttons.some((b) => b.textContent?.includes('Authorize Access')))
      .toBe(true);
    // Registering flips the CTA label to the genesis action.
    fixture.componentInstance.isRegistering.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Initialize Genesis');
  });

  it('renders the password strength block while registering without throwing', async () => {
    const { fixture } = await build();
    fixture.componentInstance.isRegistering.set(true);
    fixture.componentInstance.credentials.password = 'x';

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('Cipher Strength');
  });

  it('establishes the API session after successful credential login', async () => {
    jest.useFakeTimers();
    const { fixture, authMock } = await build();
    const apiAuth = TestBed.inject(ApiAuthService) as unknown as {
      login: jest.Mock;
    };
    const response = {
      token: 'api-jwt-token',
      user: {
        id: 7,
        name: 'API Artist',
        email: 'artist@example.com',
        role: 'user',
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      },
    };
    const apiUser = {
      id: '7',
      email: response.user.email,
      artistName: response.user.name,
      role: 'Artist',
      permissions: ['STANDARD'],
      createdAt: new Date(response.user.createdAt),
      lastLogin: new Date(),
      profileCompleteness: 100,
      emailVerified: true,
    };
    apiAuth.login.mockResolvedValue(response);
    authMock.establishApiSession.mockReturnValue(apiUser);

    fixture.componentInstance.credentials = {
      email: response.user.email,
      password: 'Password1!',
    };

    await fixture.componentInstance.onSubmit();
    jest.runOnlyPendingTimers();

    expect(apiAuth.login).toHaveBeenCalledWith({
      email: response.user.email,
      password: 'Password1!',
    });
    expect(authMock.establishApiSession).toHaveBeenCalledWith(response);
    expect(authMock.login).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('sends a login confirmation before navigating after successful auth', async () => {
    jest.useFakeTimers();
    const { fixture, authMock, loginConfirmationMock } = await build();
    const router = TestBed.inject(Router);
    authMock.login.mockResolvedValue({ success: true, message: 'ok' });
    authMock.currentUser = jest.fn(() => ({
      id: 'u1',
      email: 'artist@example.com',
      artistName: 'Artist',
      lastLogin: new Date(),
    }));

    fixture.componentInstance.credentials = {
      email: 'artist@example.com',
      password: 'Password1!',
    };

    await fixture.componentInstance.onSubmit();
    jest.advanceTimersByTime(1000);

    expect(loginConfirmationMock.sendLoginConfirmation).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/hub');
    jest.useRealTimers();
  });
});

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

describe('LoginComponent', () => {
  const build = async () => {
    const authMock = {
      isAuthenticated: jest.fn().mockReturnValue(false),
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

    await TestBed.configureTestingModule({
      imports: [LoginComponent, HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ApiAuthService, useValue: apiAuthMock },
        { provide: SecurityService, useValue: securityMock },
        { provide: OnboardingService, useValue: onboardingMock },
        { provide: LoggingService, useValue: loggerMock },
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
    return { fixture, authMock };
  };

  it('renders the authorization form without throwing', async () => {
    const { fixture } = await build();
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('S.M.U.V.E');
  });

  it('renders the password strength block while registering without throwing', async () => {
    const { fixture } = await build();
    fixture.componentInstance.isRegistering.set(true);
    fixture.componentInstance.credentials.password = 'x';

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('Cipher Strength');
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../services/auth.service';
import { ApiAuthError, ApiAuthService } from '../../services/api-auth.service';
import { LoggingService } from '../../services/logging.service';

describe('ResetPasswordComponent', () => {
  const build = async () => {
    const authMock = {
      hasLocalAccount: jest.fn().mockReturnValue(true),
      validatePassword: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      resetLocalPassword: jest.fn().mockResolvedValue({
        success: true,
        message:
          'LOCAL CIPHER ROTATED FOR THIS BROWSER. NO OTHER DEVICE WAS CHANGED.',
      }),
    };
    const apiAuthMock = {
      // No recovery service in a local-only deployment.
      requestPasswordReset: jest
        .fn()
        .mockRejectedValue(new ApiAuthError(0, 'API unavailable')),
      resetPassword: jest.fn(),
    };
    const routerMock = { navigate: jest.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        { provide: AuthService, useValue: authMock },
        { provide: ApiAuthService, useValue: apiAuthMock },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
        { provide: Router, useValue: routerMock },
        { provide: LoggingService, useValue: { error: jest.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ResetPasswordComponent);
    fixture.detectChanges();
    return { fixture, authMock, apiAuthMock, routerMock };
  };

  it('offers local recovery when no service answers and a local record exists', async () => {
    const { fixture, authMock } = await build();
    const component = fixture.componentInstance;
    component.email.set('artist@smuve.dev');

    await component.onRequestLink();

    expect(authMock.hasLocalAccount).toHaveBeenCalledWith('artist@smuve.dev');
    expect(component.localResetAvailable()).toBe(true);
    expect(component.message()).toContain('NOTHING IS EMAILED');
  });

  it('does not claim a link was sent when no local record exists', async () => {
    const { fixture, authMock } = await build();
    const component = fixture.componentInstance;
    authMock.hasLocalAccount.mockReturnValue(false);
    component.email.set('nobody@smuve.dev');

    await component.onRequestLink();

    expect(component.localResetAvailable()).toBe(false);
    expect(component.message()).toContain('RECOVERY SERVICE UNAVAILABLE');
  });

  it('rotates the local cipher and returns to authorization', async () => {
    jest.useFakeTimers();
    try {
      const { fixture, authMock, routerMock } = await build();
      const component = fixture.componentInstance;
      component.email.set('artist@smuve.dev');
      component.password.set('Recover!2Now');
      component.confirmation.set('Recover!2Now');

      await component.onLocalReset();
      jest.runOnlyPendingTimers();

      expect(authMock.resetLocalPassword).toHaveBeenCalledWith(
        'artist@smuve.dev',
        'Recover!2Now'
      );
      expect(component.message()).toContain('LOCAL CIPHER ROTATED');
      expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to rotate when the two entries differ', async () => {
    const { fixture, authMock } = await build();
    const component = fixture.componentInstance;
    component.email.set('artist@smuve.dev');
    component.password.set('Recover!2Now');
    component.confirmation.set('Recover!3Now');

    await component.onLocalReset();

    expect(authMock.resetLocalPassword).not.toHaveBeenCalled();
    expect(component.message()).toContain('do not match');
  });
});

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GUEST_PERMISSIONS, GUEST_ROLE } from './guest-access';

describe('authGuard', () => {
  it('redirects unauthenticated users to login with the requested url', () => {
    const navigate = jest.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: jest.fn().mockReturnValue(false),
            currentUser: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate,
          },
        },
      ],
    });

    const result = TestBed.runInInjectionContext(() =>
      authGuard({ data: {} } as any, { url: '/profile' } as any)
    );

    expect(result).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/profile' },
      replaceUrl: true,
    });
  });

  describe('guest clearance', () => {
    const guestUser = {
      id: 'guest_123',
      email: 'guest@smuve.local',
      artistName: 'GUEST ARTIST',
      role: GUEST_ROLE,
      permissions: [...GUEST_PERMISSIONS],
      createdAt: new Date(),
      lastLogin: new Date(),
      profileCompleteness: 0,
      emailVerified: false,
      emailVerificationRequired: false,
    };

    const runGuard = (url: string, user: unknown) => {
      const navigate = jest.fn();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: AuthService,
            useValue: {
              isAuthenticated: jest.fn().mockReturnValue(true),
              currentUser: jest.fn().mockReturnValue(user),
            },
          },
          { provide: Router, useValue: { navigate } },
        ],
      });

      const result = TestBed.runInInjectionContext(() =>
        authGuard({ data: {} } as any, { url } as any)
      );
      return { result, navigate };
    };

    it('sends a guest off an account-only surface to the clearance page', () => {
      const { result, navigate } = runGuard('/business-suite', guestUser);

      expect(result).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/guest-access'], {
        queryParams: { from: '/business-suite' },
        replaceUrl: true,
      });
    });

    it('keeps the refused url so the clearance page can name the surface', () => {
      const { navigate } = runGuard('/release-pipeline?step=master', guestUser);

      expect(navigate).toHaveBeenCalledWith(['/guest-access'], {
        queryParams: { from: '/release-pipeline?step=master' },
        replaceUrl: true,
      });
    });

    it('lets a guest open an included creative surface', () => {
      const { result, navigate } = runGuard('/studio?view=mixer', guestUser);

      expect(result).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not limit a full account', () => {
      const { result, navigate } = runGuard('/business-suite', {
        ...guestUser,
        role: 'Artist',
        permissions: ['STANDARD'],
      });

      expect(result).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});

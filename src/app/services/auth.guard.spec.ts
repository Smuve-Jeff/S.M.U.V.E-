import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

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
});

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], {
      queryParams: { returnUrl: state.url || '/hub' },
      replaceUrl: true,
    });
    return false;
  }

  const user = authService.currentUser();

  // Enforce email verification for strategic/sensitive routes
  const isSensitive =
    state.url.includes('business') || state.url.includes('release');
  if (isSensitive && user && !user.emailVerified) {
    router.navigate(['/hub']);
    return false;
  }

  const requiredPermission = route.data['permission'] as string;
  if (requiredPermission) {
    if (
      !user ||
      (!user.permissions.includes(requiredPermission) &&
        !user.permissions.includes('ALL_ACCESS'))
    ) {
      router.navigate(['/hub']);
      return false;
    }
  }

  return true;
};

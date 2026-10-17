import { inject } from '@angular/core';
import { Router, CanActivateFn, CanActivateChildFn } from '@angular/router';
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

  // Enforce email verification for strategic/sensitive routes — but only when
  // verification is actually completable. `emailVerificationRequired` is set
  // from the API's own "can I send mail?" answer, so a deployment without a
  // mail provider never gates a route that cannot be unlocked.
  const isSensitive =
    state.url.includes('business') || state.url.includes('release');
  if (isSensitive && user?.emailVerificationRequired === true) {
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

export const authChildGuard: CanActivateChildFn = (route, state) =>
  authGuard(route, state);

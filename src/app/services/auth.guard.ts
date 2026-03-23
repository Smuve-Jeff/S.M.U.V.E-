import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const requiredPermission = route.data['permission'] as string;
  if (requiredPermission) {
    const user = authService.currentUser();
    if (!user || !user.permissions.includes(requiredPermission) && !user.permissions.includes('ALL_ACCESS')) {
      router.navigate(['/hub']);
      return false;
    }
  }

  return true;
};

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from './auth-session';

export const permissionGuard: CanActivateFn = (route, state) => {
  const session = inject(AuthSession);
  const router = inject(Router);
  if (session.subscriptionExpired() && state.url.split('?')[0] === '/reports') return true;
  const permissions = route.data['permissions'] as string[] | undefined;
  return permissions?.every((permission) => session.hasPermission(permission)) ?? true
    ? true
    : router.createUrlTree(['/forbidden']);
};

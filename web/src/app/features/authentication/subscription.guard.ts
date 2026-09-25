import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthSession } from './auth-session';

export const subscriptionGuard: CanActivateChildFn = (_route, state) => {
  const session = inject(AuthSession);
  const router = inject(Router);
  if (session.isApplicationOwner() || !session.subscriptionExpired() || state.url.split('?')[0] === '/reports') return true;
  return router.createUrlTree(['/reports']);
};

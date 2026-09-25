import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from './auth-session';

export const usersManageGuard: CanActivateFn = () =>
  inject(AuthSession).isApplicationOwner() || inject(Router).createUrlTree(['/forbidden']);

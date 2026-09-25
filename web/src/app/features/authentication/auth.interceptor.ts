import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthSession } from './auth-session';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSession);
  const router = inject(Router);
  const securedApi = request.url.startsWith('/api/') && request.url !== '/api/auth/login';
  const outgoing =
    securedApi && session.token()
      ? request.clone({ setHeaders: { Authorization: `Bearer ${session.token()}` } })
      : request;
  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (securedApi && error instanceof HttpErrorResponse && error.status === 401) {
        session.clear();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};

import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthSession } from './auth-session';
import { apiUrl, isApiUrl } from '../../core/api/api-url';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSession);
  const router = inject(Router);
  const loginUrl = apiUrl('/auth/login');
  const securedApi = isApiUrl(request.url) && request.url !== loginUrl;
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

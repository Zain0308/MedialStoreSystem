import { HttpErrorResponse } from '@angular/common/http';

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'Your session expired. Please sign in again.';
    if (typeof error.error === 'string' && error.error) return error.error;
    if (Array.isArray(error.error)) return error.error.join(' ');
    if (typeof error.error?.message === 'string') return error.error.message;
    return error.error?.title ?? `Request failed (${error.status || 'network'}). Please try again.`;
  }
  return 'Something went wrong. Please try again.';
}

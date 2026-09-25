import { Injectable, computed, signal } from '@angular/core';
import { LoginResponse } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly token = signal(sessionStorage.getItem('medical-token') ?? '');
  readonly email = signal(sessionStorage.getItem('medical-email') ?? '');
  readonly isAuthenticated = computed(() => this.token().length > 0);
  accept(result: LoginResponse): void {
    sessionStorage.setItem('medical-token', result.token);
    sessionStorage.setItem('medical-email', result.email);
    this.token.set(result.token);
    this.email.set(result.email);
  }
  clear(): void {
    sessionStorage.removeItem('medical-token');
    sessionStorage.removeItem('medical-email');
    this.token.set('');
    this.email.set('');
  }
}

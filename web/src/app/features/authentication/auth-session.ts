import { Injectable, computed, signal } from '@angular/core';
import { LoginResponse } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly token = signal(sessionStorage.getItem('medical-token') ?? '');
  readonly email = signal(sessionStorage.getItem('medical-email') ?? '');
  readonly roles = signal(this.readList('medical-roles'));
  readonly permissions = signal(this.readList('medical-permissions'));
  readonly isAuthenticated = computed(() => this.token().length > 0);
  accept(result: LoginResponse): void {
    sessionStorage.setItem('medical-token', result.token);
    sessionStorage.setItem('medical-email', result.email);
    sessionStorage.setItem('medical-roles', JSON.stringify(result.roles ?? []));
    sessionStorage.setItem('medical-permissions', JSON.stringify(result.permissions ?? []));
    this.token.set(result.token);
    this.email.set(result.email);
    this.roles.set(result.roles ?? []);
    this.permissions.set(result.permissions ?? []);
  }
  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }
  clear(): void {
    sessionStorage.removeItem('medical-token');
    sessionStorage.removeItem('medical-email');
    sessionStorage.removeItem('medical-roles');
    sessionStorage.removeItem('medical-permissions');
    this.token.set('');
    this.email.set('');
    this.roles.set([]);
    this.permissions.set([]);
  }
  private readList(key: string): string[] {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}

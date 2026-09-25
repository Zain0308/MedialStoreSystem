import { Injectable, computed, signal } from '@angular/core';
import { LoginResponse, StoreSummary } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly token = signal(sessionStorage.getItem('medical-token') ?? '');
  readonly email = signal(sessionStorage.getItem('medical-email') ?? '');
  readonly userId = signal(sessionStorage.getItem('medical-user-id') ?? '');
  readonly roles = signal(this.readList('medical-roles'));
  readonly permissions = signal(this.readList('medical-permissions'));
  readonly stores = signal(this.readStores());
  readonly activeStoreId = signal(Number(sessionStorage.getItem('medical-store-id') ?? 0));
  readonly isApplicationOwner = signal(sessionStorage.getItem('medical-app-owner') === 'true');
  private readonly expiryTick = signal(Date.now());
  private readonly expiredByServer = signal(sessionStorage.getItem('medical-subscription-expired') === 'true');
  readonly subscriptionExpiresAt = signal(sessionStorage.getItem('medical-subscription-expires-at') ?? '');
  readonly subscriptionExpired = computed(() => {
    const now = this.expiryTick();
    const expiry = this.subscriptionExpiresAt();
    return !this.isApplicationOwner() && (this.expiredByServer() || (!!expiry && Date.parse(expiry) <= now));
  });
  readonly activeStoreName = computed(() => this.stores().find(x => x.id === this.activeStoreId())?.name ?? '');
  readonly isAdministrator = computed(() => this.roles().includes('Administrator'));
  readonly isAuthenticated = computed(() => this.token().length > 0);
  constructor() { window.setInterval(() => this.expiryTick.set(Date.now()), 30_000); }
  accept(result: LoginResponse): void {
    sessionStorage.setItem('medical-token', result.token);
    sessionStorage.setItem('medical-email', result.email);
    sessionStorage.setItem('medical-user-id', result.userId ?? '');
    sessionStorage.setItem('medical-roles', JSON.stringify(result.roles ?? []));
    sessionStorage.setItem('medical-permissions', JSON.stringify(result.permissions ?? []));
    sessionStorage.setItem('medical-stores', JSON.stringify(result.stores ?? []));
    sessionStorage.setItem('medical-store-id', String(result.activeStoreId ?? result.stores?.[0]?.id ?? 0));
    sessionStorage.setItem('medical-app-owner', String(result.isApplicationOwner === true));
    sessionStorage.setItem('medical-subscription-expired', String(result.subscriptionExpired === true));
    sessionStorage.setItem('medical-subscription-expires-at', result.subscriptionExpiresAt ?? '');
    this.token.set(result.token);
    this.email.set(result.email);
    this.userId.set(result.userId ?? '');
    this.roles.set(result.roles ?? []);
    this.permissions.set(result.permissions ?? []);
    this.stores.set(result.stores ?? []);
    this.activeStoreId.set(result.activeStoreId ?? result.stores?.[0]?.id ?? 0);
    this.isApplicationOwner.set(result.isApplicationOwner === true);
    this.expiredByServer.set(result.subscriptionExpired === true);
    this.subscriptionExpiresAt.set(result.subscriptionExpiresAt ?? '');
    this.expiryTick.set(Date.now());
  }
  markSubscriptionExpired(): void {
    if (this.isApplicationOwner()) return;
    sessionStorage.setItem('medical-subscription-expired', 'true');
    this.expiredByServer.set(true);
  }
  updateStores(stores: StoreSummary[]): void {
    sessionStorage.setItem('medical-stores', JSON.stringify(stores));
    this.stores.set(stores);
  }
  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }
  clear(): void {
    sessionStorage.removeItem('medical-token');
    sessionStorage.removeItem('medical-email');
    sessionStorage.removeItem('medical-user-id');
    sessionStorage.removeItem('medical-roles');
    sessionStorage.removeItem('medical-permissions');
    sessionStorage.removeItem('medical-stores');
    sessionStorage.removeItem('medical-store-id');
    sessionStorage.removeItem('medical-app-owner');
    sessionStorage.removeItem('medical-subscription-expired');
    sessionStorage.removeItem('medical-subscription-expires-at');
    this.token.set('');
    this.email.set('');
    this.userId.set('');
    this.roles.set([]);
    this.permissions.set([]);
    this.stores.set([]);
    this.activeStoreId.set(0);
    this.isApplicationOwner.set(false);
    this.expiredByServer.set(false);
    this.subscriptionExpiresAt.set('');
  }
  private readList(key: string): string[] {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  private readStores(): StoreSummary[] {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem('medical-stores') ?? '[]');
      return Array.isArray(value) ? value.filter((item): item is StoreSummary =>
        !!item && typeof item === 'object' && typeof (item as StoreSummary).id === 'number' &&
        typeof (item as StoreSummary).name === 'string') : [];
    } catch {
      return [];
    }
  }
}

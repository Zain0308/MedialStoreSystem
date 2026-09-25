import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { LoginCredentials, LoginResponse, StoreRole, StoreSummary, StoreUser } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthenticationApi {
  private readonly api = inject(ApiClient);
  login(credentials: LoginCredentials) {
    return this.api.post<LoginResponse>('/auth/login', credentials);
  }
  switchStore(storeId: number) {
    return this.api.post<LoginResponse>('/auth/switch-store', { storeId });
  }
  stores() {
    return this.api.get<StoreSummary[]>('/stores');
  }
  allStores() {
    return this.api.get<StoreSummary[]>('/stores/all');
  }
  createStore(input: { name: string; code: string }) {
    return this.api.post<StoreSummary>('/stores', input);
  }
  setStoreActive(id: number, isActive: boolean) {
    return this.api.put<StoreSummary>(`/stores/${id}/status`, { isActive });
  }
  updateStoreSubscription(id: number, input: {
    planName: string; status: 'Trial' | 'Active' | 'Suspended';
    trialEndsAt: string | null; subscriptionExpiresAt: string | null;
  }) {
    return this.api.put<StoreSummary>(`/stores/${id}/subscription`, input);
  }
  updateStorePermissions(id: number, permissions: string[]) {
    return this.api.put<{ storeId: number; permissions: string[] }>(`/stores/${id}/permissions`, { permissions });
  }
  resetUserPassword(id: string, newPassword: string) {
    return this.api.put<{ userId: string; message: string }>(
      `/auth/users/${encodeURIComponent(id)}/password`, { newPassword },
    );
  }
  updateUserStores(id: string, storeIds: number[], defaultStoreId: number) {
    return this.api.put<{ userId: string; storeIds: number[]; defaultStoreId: number }>(
      `/auth/users/${encodeURIComponent(id)}/stores`, { storeIds, defaultStoreId },
    );
  }
  users() {
    return this.api.get<StoreUser[]>('/auth/users');
  }
  roles() {
    return this.api.get<StoreRole[]>('/auth/roles');
  }
  createUser(input: { email: string; password: string; roles: string[] }) {
    return this.api.post<StoreUser>('/auth/users', input);
  }
  updateUserRoles(id: string, roles: string[]) {
    return this.api.put<StoreUser>(`/auth/users/${encodeURIComponent(id)}/roles`, { roles });
  }
  setUserActive(id: string, isActive: boolean) {
    return this.api.put<StoreUser>(`/auth/users/${encodeURIComponent(id)}/status`, { isActive });
  }
  createRole(name: string) {
    return this.api.post<StoreRole>('/auth/roles', { name });
  }
  updateRolePermissions(id: string, permissions: string[]) {
    return this.api.put<StoreRole>(`/auth/roles/${encodeURIComponent(id)}/permissions`, { permissions });
  }
}

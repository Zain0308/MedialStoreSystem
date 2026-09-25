import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { LoginCredentials, LoginResponse, StoreRole, StoreUser } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthenticationApi {
  private readonly api = inject(ApiClient);
  login(credentials: LoginCredentials) {
    return this.api.post<LoginResponse>('/auth/login', credentials);
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

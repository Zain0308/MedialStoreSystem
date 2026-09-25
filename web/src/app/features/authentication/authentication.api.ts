import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { LoginCredentials, LoginResponse } from './authentication.models';

@Injectable({ providedIn: 'root' })
export class AuthenticationApi {
  private readonly api = inject(ApiClient);
  login(credentials: LoginCredentials) {
    return this.api.post<LoginResponse>('/auth/login', credentials);
  }
}

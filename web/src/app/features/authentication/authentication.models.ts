export interface LoginCredentials {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface StoreUser {
  id: string;
  email: string;
  roles: string[];
  isActive: boolean;
}

export interface StoreRole {
  id: string;
  name: string;
  permissions: string[];
  availablePermissions: { key: string; label: string }[];
  canAssign: boolean;
}

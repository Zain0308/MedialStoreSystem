export interface LoginCredentials {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  activeStoreId: number;
  stores: StoreSummary[];
  isApplicationOwner: boolean;
}

export interface StoreSummary {
  id: number;
  name: string;
  code: string;
  isDefault?: boolean;
  isActive?: boolean;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | null;
  subscriptionExpiresAt?: string | null;
  permissions?: string[];
}

export interface StoreUser {
  id: string;
  email: string;
  roles: string[];
  isActive: boolean;
  storeIds: number[];
}

export interface StoreRole {
  id: string;
  name: string;
  permissions: string[];
  availablePermissions: { key: string; label: string }[];
  canAssign: boolean;
}


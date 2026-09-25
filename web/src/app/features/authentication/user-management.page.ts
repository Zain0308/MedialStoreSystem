import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthenticationApi } from './authentication.api';
import { StoreRole, StoreSummary, StoreUser } from './authentication.models';
import { AuthSession } from './auth-session';

type SubscriptionDraft = {
  planName: string;
  status: 'Trial' | 'Active' | 'Suspended';
  trialEndsAt: string;
  subscriptionExpiresAt: string;
};

@Component({
  selector: 'app-user-management-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent],
  templateUrl: './user-management.page.html',
  styleUrl: './user-management.page.css',
})
export class UserManagementPage extends PageFeedback implements OnInit {
  private readonly api = inject(AuthenticationApi);
  readonly session = inject(AuthSession);
  readonly users = signal<StoreUser[]>([]);
  readonly roles = signal<StoreRole[]>([]);
  readonly stores = signal<StoreSummary[]>([]);
  readonly roleSelections = signal<Record<string, string[]>>({});
  readonly permissionDrafts = signal<Record<string, string[]>>({});
  readonly storeDrafts = signal<Record<string, number[]>>({});
  readonly storePermissionDrafts = signal<Record<number, string[]>>({});
  readonly subscriptionDrafts = signal<Record<number, SubscriptionDraft>>({});
  readonly passwordDrafts = signal<Record<string, string>>({});
  newUser = { email: '', password: '', roles: [] as string[], storeIds: [] as number[] };
  newRoleName = '';
  newStore = { name: '', code: '' };

  ngOnInit(): void {
    void this.perform(() => this.load());
  }

  private async load(): Promise<void> {
    const [users, roles, stores] = await Promise.all([
      this.api.users(), this.api.roles(), this.api.allStores(),
    ]);
    this.users.set(users);
    this.roles.set(roles);
    this.stores.set(stores);
    this.roleSelections.set(Object.fromEntries(users.map(user => [user.id, [...user.roles]])));
    this.storeDrafts.set(Object.fromEntries(users.map(user => [user.id, [...user.storeIds]])));
    this.permissionDrafts.set(Object.fromEntries(roles.map(role => [role.id, [...role.permissions]])));
    this.storePermissionDrafts.set(Object.fromEntries(stores.map(store => [store.id, [...(store.permissions ?? [])]])));
    this.subscriptionDrafts.set(Object.fromEntries(stores.map(store => [store.id, {
      planName: store.subscriptionPlan ?? 'Legacy',
      status: (store.subscriptionStatus === 'Trial' || store.subscriptionStatus === 'Suspended' ? store.subscriptionStatus : 'Active') as SubscriptionDraft['status'],
      trialEndsAt: this.asDateInput(store.trialEndsAt),
      subscriptionExpiresAt: this.asDateInput(store.subscriptionExpiresAt),
    }])));
  }

  toggleNewUserRole(role: string, checked: boolean): void {
    const selected = new Set(this.newUser.roles);
    checked ? selected.add(role) : selected.delete(role);
    this.newUser.roles = [...selected];
  }

  toggleNewUserStore(id: number, checked: boolean): void {
    const selected = new Set(this.newUser.storeIds);
    checked ? selected.add(id) : selected.delete(id);
    this.newUser.storeIds = [...selected];
  }

  selectUserRoles(id: string, values: string[]): void {
    this.roleSelections.update(current => ({ ...current, [id]: values }));
  }

  selectUserStores(id: string, values: string[]): void {
    this.storeDrafts.update(current => ({ ...current, [id]: values.map(Number).filter(Number.isFinite) }));
  }

  togglePermission(roleId: string, permission: string, checked: boolean): void {
    this.permissionDrafts.update(current => {
      const selected = new Set(current[roleId] ?? []);
      checked ? selected.add(permission) : selected.delete(permission);
      return { ...current, [roleId]: [...selected] };
    });
  }

  toggleStorePermission(storeId: number, permission: string, checked: boolean): void {
    this.storePermissionDrafts.update(current => {
      const selected = new Set(current[storeId] ?? []);
      checked ? selected.add(permission) : selected.delete(permission);
      return { ...current, [storeId]: [...selected] };
    });
  }

  setSubscriptionField(storeId: number, field: keyof SubscriptionDraft, value: string): void {
    this.subscriptionDrafts.update(current => ({
      ...current,
      [storeId]: { ...current[storeId], [field]: value },
    }));
  }

  addUser(): Promise<void> {
    return this.perform(async () => {
      if (this.newUser.storeIds.length === 0) throw new Error('Select at least one medical store.');
      await this.api.createUser(this.newUser);
      this.newUser = { email: '', password: '', roles: [], storeIds: [] };
      await this.load();
      this.message.set('User account created and assigned to the selected stores.');
    });
  }

  saveUserRoles(user: StoreUser): Promise<void> {
    return this.perform(async () => {
      await this.api.updateUserRoles(user.id, this.roleSelections()[user.id] ?? []);
      await this.load();
      this.message.set(`Permissions/roles updated for ${user.email}. They must sign in again.`);
    });
  }

  saveUserStores(user: StoreUser): Promise<void> {
    return this.perform(async () => {
      const storeIds = this.storeDrafts()[user.id] ?? [];
      const defaultStoreId = storeIds.includes(this.session.activeStoreId())
        ? this.session.activeStoreId() : storeIds[0];
      if (storeIds.length === 0 || !defaultStoreId) throw new Error('Assign at least one active store.');
      await this.api.updateUserStores(user.id, storeIds, defaultStoreId);
      await this.load();
      this.message.set(`Store access updated for ${user.email}. They must sign in again.`);
    });
  }

  setUserActive(user: StoreUser, isActive: boolean): Promise<void> {
    return this.perform(async () => {
      await this.api.setUserActive(user.id, isActive);
      await this.load();
      this.message.set(isActive ? 'User account activated.' : 'User account deactivated.');
    });
  }

  setPasswordDraft(userId: string, password: string): void {
    this.passwordDrafts.update(current => ({ ...current, [userId]: password }));
  }

  resetUserPassword(user: StoreUser): Promise<void> {
    return this.perform(async () => {
      const newPassword = this.passwordDrafts()[user.id] ?? '';
      if (newPassword.length < 12) throw new Error('Password must be at least 12 characters.');
      await this.api.resetUserPassword(user.id, newPassword);
      this.setPasswordDraft(user.id, '');
      this.message.set(`Password reset for ${user.email}. Share the new password with them securely.`);
    });
  }

  setStoreActive(store: StoreSummary, isActive: boolean): Promise<void> {
    return this.perform(async () => {
      await this.api.setStoreActive(store.id, isActive);
      await this.load();
      this.message.set(isActive ? `${store.name} activated.` : `${store.name} deactivated; its users can no longer sign in.`);
    });
  }

  saveStoreSubscription(store: StoreSummary): Promise<void> {
    return this.perform(async () => {
      const draft = this.subscriptionDrafts()[store.id];
      if (!draft?.planName.trim()) throw new Error('Enter a subscription name.');
      const trialEndsAt = draft.trialEndsAt ? this.toUtcEndOfDay(draft.trialEndsAt) : null;
      const subscriptionExpiresAt = draft.subscriptionExpiresAt ? this.toUtcEndOfDay(draft.subscriptionExpiresAt) : null;
      if (draft.status === 'Trial' && !trialEndsAt) throw new Error('Set the free trial end date.');
      await this.api.updateStoreSubscription(store.id, {
        planName: draft.planName, status: draft.status, trialEndsAt,
        subscriptionExpiresAt: draft.status === 'Active' ? subscriptionExpiresAt : null,
      });
      await this.load();
      this.message.set(`Subscription settings saved for ${store.name}.`);
    });
  }

  startFreeTrial(store: StoreSummary): Promise<void> {
    return this.perform(async () => {
      const end = new Date();
      end.setDate(end.getDate() + 14);
      await this.api.updateStoreSubscription(store.id, {
        planName: 'Free Trial', status: 'Trial', trialEndsAt: this.toUtcEndOfDay(this.asDateInput(end.toISOString())),
        subscriptionExpiresAt: null,
      });
      await this.load();
      this.message.set(`A 14-day free trial started for ${store.name}.`);
    });
  }

  saveStorePermissions(store: StoreSummary): Promise<void> {
    return this.perform(async () => {
      await this.api.updateStorePermissions(store.id, this.storePermissionDrafts()[store.id] ?? []);
      await this.load();
      this.message.set(`Store feature permissions saved for ${store.name}.`);
    });
  }

  addRole(): Promise<void> {
    return this.perform(async () => {
      await this.api.createRole(this.newRoleName);
      this.newRoleName = '';
      await this.load();
      this.message.set('Role created. Select its user permissions below.');
    });
  }

  addStore(): Promise<void> {
    return this.perform(async () => {
      const created = await this.api.createStore(this.newStore);
      this.newStore = { name: '', code: '' };
      await this.load();
      const memberships = await this.api.stores();
      this.session.updateStores(memberships);
      this.message.set(`${created.name} created with a 14-day free trial.`);
    });
  }

  savePermissions(role: StoreRole): Promise<void> {
    return this.perform(async () => {
      await this.api.updateRolePermissions(role.id, this.permissionDrafts()[role.id] ?? []);
      await this.load();
      this.message.set(`User permissions saved for ${role.name}. Assigned users must sign in again.`);
    });
  }

  private asDateInput(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  private toUtcEndOfDay(value: string): string {
    return new Date(`${value}T23:59:59.999`).toISOString();
  }
}


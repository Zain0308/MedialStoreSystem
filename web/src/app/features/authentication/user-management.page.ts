import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { AuthenticationApi } from './authentication.api';
import { StoreRole, StoreSummary, StoreUser } from './authentication.models';
import { AuthSession } from './auth-session';

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
  newUser = { email: '', password: '', roles: [] as string[] };
  newRoleName = '';
  newStore = { name: '', code: '' };

  ngOnInit(): void {
    void this.perform(() => this.load());
  }

  private async load(): Promise<void> {
    const [users, roles, stores] = await Promise.all([
      this.api.users(), this.api.roles(),
      this.session.isAdministrator() ? this.api.allStores() : Promise.resolve([]),
    ]);
    this.users.set(users);
    this.roles.set(roles);
    this.stores.set(stores);
    this.roleSelections.set(Object.fromEntries(users.map((user) => [user.id, [...user.roles]])));
    this.storeDrafts.set(Object.fromEntries(users.map((user) => [user.id, [...user.storeIds]])));
    this.permissionDrafts.set(Object.fromEntries(roles.map((role) => [role.id, [...role.permissions]])));
  }

  toggleNewUserRole(role: string, checked: boolean): void {
    const selected = new Set(this.newUser.roles);
    checked ? selected.add(role) : selected.delete(role);
    this.newUser.roles = [...selected];
  }

  selectUserRoles(id: string, values: string[]): void {
    this.roleSelections.update((current) => ({ ...current, [id]: values }));
  }

  selectUserStores(id: string, values: string[]): void {
    this.storeDrafts.update((current) => ({ ...current, [id]: values.map(Number).filter(Number.isFinite) }));
  }

  togglePermission(roleId: string, permission: string, checked: boolean): void {
    this.permissionDrafts.update((current) => {
      const selected = new Set(current[roleId] ?? []);
      checked ? selected.add(permission) : selected.delete(permission);
      return { ...current, [roleId]: [...selected] };
    });
  }

  addUser(): Promise<void> {
    return this.perform(async () => {
      await this.api.createUser(this.newUser);
      this.newUser = { email: '', password: '', roles: [] };
      await this.load();
      this.message.set('User created. Share the initial password securely.');
    });
  }

  saveUserRoles(user: StoreUser): Promise<void> {
    return this.perform(async () => {
      await this.api.updateUserRoles(user.id, this.roleSelections()[user.id] ?? []);
      await this.load();
      this.message.set(`Roles updated for ${user.email}. They must sign in again.`);
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
      this.message.set(isActive ? 'User access restored.' : 'User deactivated.');
    });
  }

  addRole(): Promise<void> {
    return this.perform(async () => {
      await this.api.createRole(this.newRoleName);
      this.newRoleName = '';
      await this.load();
      this.message.set('Role created. Select its permissions below.');
    });
  }

  addStore(): Promise<void> {
    return this.perform(async () => {
      const created = await this.api.createStore(this.newStore);
      this.newStore = { name: '', code: '' };
      await this.load();
      const memberships = await this.api.stores();
      this.session.updateStores(memberships);
      this.message.set(`${created.name} created. You can switch to it from the store selector.`);
    });
  }

  savePermissions(role: StoreRole): Promise<void> {
    return this.perform(async () => {
      await this.api.updateRolePermissions(role.id, this.permissionDrafts()[role.id] ?? []);
      await this.load();
      this.message.set(`Permissions saved for ${role.name}. Assigned users must sign in again.`);
    });
  }
}

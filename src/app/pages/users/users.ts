import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DxDataGridModule, DxTemplateModule } from 'devextreme-angular';
import { UserResponse } from '../../interfaces/interfaces';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';
import {
  canDeleteUser, canEditUser, canEditUserPermissions
  , canManageTasks
} from '../../helpers/permissions';
import { Auth } from '../../services/auth';

type SaveUserPayload = {
  id: number | null;
  name: string;
  email: string;
  contact: string | null;
  password: string | null;
  canReadUsers: boolean;
  canWriteUsers: boolean;
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DxDataGridModule, DxTemplateModule],
  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class Users implements OnInit {
  readonly auth = inject(Auth);
  private readonly http = inject(HttpClient);

  users = signal<UserResponse[]>([]);
  filteredUsers = signal<UserResponse[]>([]);
  loading = signal(false);
  savingUser = false;
  deletingUserId: number | null = null;
  showUserForm = signal(false);
  editingUserId: number | null = null;
  errorMessage = signal('');
  formError = signal('');

  userForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.maxLength(100)]),
    email: new FormControl('', [Validators.required, Validators.email, Validators.maxLength(255)]),
    contact: new FormControl('', Validators.maxLength(50)),
    password: new FormControl(''),
    canReadUsers: new FormControl(false),
    canWriteUsers: new FormControl(false),
  });

  ngOnInit(): void { this.loadUsers(); }

  loadUsers(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.http.get<UserResponse[]>(API.users, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: users => {
        this.users.set(users);
        this.filteredUsers.set(users);
        this.loading.set(false);
      },
      error: error => {
        console.error('Failed to load users:', error);
        this.errorMessage.set(getErrorMessage(error, 'Unable to load users.'));
        this.loading.set(false);
      },
    });
  }

  onSearchChange(value: Event): void {
    const search = (value.target as HTMLInputElement).value.trim().toLowerCase();
    this.filteredUsers.set(!search ? this.users() : this.users().filter(user =>
      [user.name, user.email, user.contact].some(value => (value ?? '').toLowerCase().includes(search)),
    ));
  }
  isCurrentUser = (user: UserResponse): boolean => user.id === this.auth.getCurrentUser()?.userId;

  canEditUser = (user: UserResponse): boolean => canEditUser(this.auth.getCurrentUser(), user);

  canEditUserPermissions = (user: UserResponse): boolean => canEditUserPermissions(this.auth.getCurrentUser(), user);

  canDeleteUser = (user: UserResponse): boolean => canDeleteUser(this.auth.getCurrentUser(),
    user);

  canCreateUser = (): boolean => canManageTasks(this.auth.getCurrentUser());

  canShowPermissionSection(): boolean {
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) { return false; }
    if (this.editingUserId === null) { return currentUser.isMasterAdmin === true; }
    const target = this.users().find(user => user.id === this.editingUserId);
    return !!target && this.canEditUserPermissions(target);
  }

  createUser(): void {
    this.openForm(null);
    this.userForm.get('email')?.enable();
    this.updatePermissionControls();
  }

  editUser(user: UserResponse): void {
    if (!this.canEditUser(user)) return;
    this.openForm(user);
    this.userForm.get('email')?.disable();
    this.updatePermissionControls();
  }

  private openForm(user: UserResponse | null): void {
    this.editingUserId = user?.id ?? null;
    this.showUserForm.set(true);
    this.formError.set('');
    this.userForm.reset({
      name: user?.name ?? '', email: user?.email ?? '', contact: user?.contact ?? '', password: '',
      canReadUsers: user?.canReadUsers ?? false, canWriteUsers: user?.canWriteUsers ?? false,
    });
  }

  private updatePermissionControls(): void {
    const target = this.users().find(user => user.id === this.editingUserId);
    const controls = [this.userForm.get('canReadUsers'), this.userForm.get('canWriteUsers')];
    const editable = this.editingUserId === null || (!!target && this.canEditUserPermissions(target));
    controls.forEach(control => editable ? control?.enable() : control?.disable());
  }

  cancelUserForm(): void {
    if (this.savingUser) return;
    this.showUserForm.set(false);
    this.editingUserId = null;
    this.formError.set('');
    this.userForm.reset();
    ['email', 'canReadUsers', 'canWriteUsers'].forEach(name => this.userForm.get(name)?.enable());
  }

  saveUser(): void {
    this.formError.set('');
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) {
      return;
    }

    this.savingUser = true;
    const value = this.userForm.getRawValue();

    const payload: SaveUserPayload = {
      id: this.editingUserId,
      name: value.name?.trim() ?? '',
      email: value.email?.trim() ?? '',
      contact: value.contact?.trim() || null,
      password: value.password?.trim() || null,
      canReadUsers: value.canReadUsers ?? false,
      canWriteUsers: value.canWriteUsers ?? false,
    };

    this.http.post<UserResponse>(`${API.users}/save`, payload, {
      headers: authHeaders(this.auth.getToken()),
    }).subscribe({
      next: () => { this.savingUser = false; this.cancelUserForm(); this.loadUsers(); },
      error: error => {
        this.savingUser = false;
        this.formError.set(getErrorMessage(
          error,
          this.editingUserId !== null ? 'Unable to update user.' : 'Unable to create user.',
        ));
      },
    });
  }

  deleteUser(user: UserResponse): void {
    if (!this.canDeleteUser(user)) return;
    this.deletingUserId = user.id;
    this.http.delete(`${API.users}/${user.id}`, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: () => { this.deletingUserId = null; this.loadUsers(); },
      error: error => { this.deletingUserId = null; this.errorMessage.set(getErrorMessage(error, 'Unable to delete user.')); },
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.userForm.get(fieldName);
    return !!(control?.invalid && (control.touched || control.dirty));
  }
}

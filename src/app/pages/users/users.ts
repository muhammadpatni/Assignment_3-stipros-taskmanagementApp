import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CreateUserRequest, UpdateUserRequest, UserResponse } from '../../interfaces/interfaces';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';
import { canDeleteUser, canEditUser, canEditUserPermissions, canManageTasks } from '../../helpers/permissions';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
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
  showUserForm = false;
  editingUserId: number | null = null;
  searchText = signal('');
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
        this.applySearch();
        this.loading.set(false);
      },
      error: error => {
        console.error('Failed to load users:', error);
        this.errorMessage.set(getErrorMessage(error, 'Unable to load users.'));
        this.loading.set(false);
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.applySearch();
  }

  private applySearch(): void {
    const search = this.searchText().trim().toLowerCase();
    this.filteredUsers.set(!search ? this.users() : this.users().filter(user =>
      [user.name, user.email, user.contact].some(value => (value ?? '').toLowerCase().includes(search)),
    ));
  }

  isCurrentUser = (user: UserResponse): boolean => user.id === this.auth.getCurrentUser()?.userId;
  canEditUser = (user: UserResponse): boolean => canEditUser(this.auth.getCurrentUser(), user);
  canEditUserPermissions = (user: UserResponse): boolean => canEditUserPermissions(this.auth.getCurrentUser(), user);
  canDeleteUser = (user: UserResponse): boolean => canDeleteUser(this.auth.getCurrentUser(), user);
  canCreateUser = (): boolean => canManageTasks(this.auth.getCurrentUser());

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
    this.showUserForm = true;
    this.formError.set('');
    this.userForm.reset({
      name: user?.name ?? '', email: user?.email ?? '', contact: user?.contact ?? '', password: '',
      canReadUsers: user?.canReadUsers ?? false, canWriteUsers: user?.canWriteUsers ?? false,
    });
  }

  private updatePermissionControls(): void {
    const target = this.users().find(user => user.id === this.editingUserId);
    const controls = [this.userForm.get('canReadUsers'), this.userForm.get('canWriteUsers')];
    const editable = !!target && this.canEditUserPermissions(target);
    controls.forEach(control => editable ? control?.enable() : control?.disable());
  }

  cancelUserForm(): void {
    if (this.savingUser) return;
    this.showUserForm = false;
    this.editingUserId = null;
    this.formError.set('');
    this.userForm.reset();
    ['email', 'canReadUsers', 'canWriteUsers'].forEach(name => this.userForm.get(name)?.enable());
  }

  saveUser(): void {
    this.formError.set('');
    if (this.userForm.invalid) return void this.userForm.markAllAsTouched();
    const currentUser = this.auth.getCurrentUser();
    if (!currentUser) return;

    this.savingUser = true;
    const value = this.userForm.getRawValue();
    const update = this.editingUserId !== null;
    const payload: CreateUserRequest | UpdateUserRequest = {
      name: value.name?.trim() ?? '',
      contact: value.contact?.trim() || null,
      password: value.password?.trim() || null,
    };

    if (update && this.editingUserId !== currentUser.userId && canManageTasks(currentUser)) {
      Object.assign(payload, { canReadUsers: value.canReadUsers ?? false, canWriteUsers: value.canWriteUsers ?? false });
    }
    if (!update) Object.assign(payload, {
      email: value.email?.trim() ?? '', password: value.password?.trim() ?? '',
      canReadUsers: value.canReadUsers ?? false, canWriteUsers: value.canWriteUsers ?? false,
    });

    const request = update
      ? this.http.put<UserResponse>(`${API.users}/${this.editingUserId}`, payload, { headers: authHeaders(this.auth.getToken()) })
      : this.http.post<UserResponse>(API.users, payload, { headers: authHeaders(this.auth.getToken()) });

    request.subscribe({
      next: () => { this.savingUser = false; this.cancelUserForm(); this.loadUsers(); },
      error: error => { this.savingUser = false; this.formError.set(getErrorMessage(error, `Unable to ${update ? 'update' : 'create'} user.`)); },
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

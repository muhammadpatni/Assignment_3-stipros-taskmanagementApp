import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

import {
  UserResponse,
  CreateUserRequest,
  UpdateUserRequest
} from '../../interfaces/interfaces';

import { Auth } from '../../services/auth';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './users.html',
  styleUrl: './users.css'
})
export class Users implements OnInit {

  /* =========================
     DATA
  ========================= */

  users = signal<UserResponse[]>([]);

  filteredUsers = signal<UserResponse[]>([]);

  loading = signal<boolean>(false);

  savingUser = false;

  deletingUserId: number | null = null;

  showUserForm = false;

  editingUserId: number | null = null;

  searchText = signal<string>('');

  errorMessage = signal<string>('');

  formError = signal<string>('');

  /* =========================
     API
  ========================= */

  private readonly apiUrl =
    'https://localhost:7253/Users';

  /* =========================
     SERVICES
  ========================= */

  public auth = inject(Auth);

  private http = inject(HttpClient);

  /* =========================
     FORM
  ========================= */

  userForm = new FormGroup({

    name: new FormControl(
      '',
      [
        Validators.required,
        Validators.maxLength(100)
      ]
    ),

    email: new FormControl(
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(255)
      ]
    ),

    contact: new FormControl(
      '',
      [
        Validators.maxLength(50)
      ]
    ),

    password: new FormControl(
      ''
    ),

    canReadUsers: new FormControl(
      false
    ),

    canWriteUsers: new FormControl(
      false
    )

  });

  /* =========================
     INIT
  ========================= */

  ngOnInit(): void {

    this.loadUsers();

  }

  /* =========================
     LOAD USERS
  ========================= */

  loadUsers(): void {

    this.loading.set(true);

    this.errorMessage.set('');

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .get<UserResponse[]>(
        this.apiUrl,
        { headers }
      )
      .subscribe({

        next: (response) => {

          this.users.set(response);

          this.applySearch();

          this.loading.set(false);

        },

        error: (error) => {

          console.error(
            'Failed to load users:',
            error
          );

          this.errorMessage.set(
            error?.error?.message ||
            'Unable to load users.'
          );

          this.loading.set(false);

        }

      });

  }

  /* =========================
     SEARCH
  ========================= */

  onSearchChange(value: string): void {

    this.searchText.set(value);

    this.applySearch();

  }

  applySearch(): void {

    const search =
      this.searchText()
        .trim()
        .toLowerCase();

    if (!search) {

      this.filteredUsers.set(
        this.users()
      );

      return;

    }

    const result =
      this.users().filter(user =>

        user.name
          .toLowerCase()
          .includes(search)

        ||

        user.email
          .toLowerCase()
          .includes(search)

        ||

        (user.contact ?? '')
          .toLowerCase()
          .includes(search)

      );

    this.filteredUsers.set(result);

  }

  /* =========================
     CURRENT USER
  ========================= */

  isCurrentUser(user: UserResponse): boolean {

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return false;

    }

    return user.id === currentUser.userId;

  }

  /* =========================
     EDIT PERMISSION
  ========================= */

  canEditUser(user: UserResponse): boolean {

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return false;

    }

    /*
      User can always edit
      his own basic profile.
    */

    if (
      user.id === currentUser.userId
    ) {

      return true;

    }

    /*
      Master Admin can edit
      other users.
    */

    if (
      currentUser.isMasterAdmin
    ) {

      return true;

    }

    /*
      CanWriteUsers can edit
      other users.
    */

    if (
      currentUser.canWriteUsers
    ) {

      return true;

    }

    return false;

  }

  /* =========================
     PERMISSION EDIT
  ========================= */

  canEditUserPermissions(
    user: UserResponse
  ): boolean {

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return false;

    }

    /*
      Nobody can change
      his own permissions.
    */

    if (
      user.id === currentUser.userId
    ) {

      return false;

    }

    /*
      Only Master Admin
      or CanWriteUsers.
    */

    return (
      currentUser.isMasterAdmin ||
      currentUser.canWriteUsers
    );

  }

  /* =========================
     DELETE PERMISSION
  ========================= */

  canDeleteUser(
    user: UserResponse
  ): boolean {

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return false;

    }

    /*
      Only Master Admin
      can delete users.
    */

    if (
      !currentUser.isMasterAdmin
    ) {

      return false;

    }

    /*
      Master Admin cannot
      delete himself.
    */

    if (
      user.id === currentUser.userId
    ) {

      return false;

    }

    return true;

  }

  /* =========================
     CREATE USER
  ========================= */

  canCreateUser(): boolean {

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return false;

    }

    return (
      currentUser.isMasterAdmin ||
      currentUser.canWriteUsers
    );

  }

  /* =========================
     CREATE
  ========================= */

  createUser(): void {

    this.editingUserId = null;

    this.showUserForm = true;

    this.formError.set('');

    this.userForm.reset({

      name: '',

      email: '',

      contact: '',

      password: '',

      canReadUsers: false,

      canWriteUsers: false

    });

    /*
      Email is editable only
      while creating.
    */

    this.userForm
      .get('email')
      ?.enable();

    /*
      Permissions available
      during create for users
      who have write access.
    */

    this.updatePermissionControls();

  }

  /* =========================
     EDIT
  ========================= */

  editUser(
    user: UserResponse
  ): void {

    if (
      !this.canEditUser(user)
    ) {

      return;

    }

    this.editingUserId = user.id;

    this.showUserForm = true;

    this.formError.set('');

    this.userForm.patchValue({

      name: user.name,

      email: user.email,

      contact: user.contact ?? '',

      password: '',

      canReadUsers: user.canReadUsers,

      canWriteUsers: user.canWriteUsers

    });

    /*
      Email is immutable.
    */

    this.userForm
      .get('email')
      ?.disable();

    this.updatePermissionControls();

  }

  /* =========================
     PERMISSION CONTROLS
  ========================= */

  updatePermissionControls(): void {

    const currentUser =
      this.auth.getCurrentUser();

    const canEditPermissions =
      this.editingUserId !== null &&
      currentUser !== null &&
      this.editingUserId !== currentUser.userId &&
      (
        currentUser.isMasterAdmin ||
        currentUser.canWriteUsers
      );

    const readControl =
      this.userForm.get('canReadUsers');

    const writeControl =
      this.userForm.get('canWriteUsers');

    if (canEditPermissions) {

      readControl?.enable();

      writeControl?.enable();

    }
    else {

      readControl?.disable();

      writeControl?.disable();

    }

  }

  /* =========================
     CANCEL
  ========================= */

  cancelUserForm(): void {

    if (this.savingUser) {

      return;

    }

    this.showUserForm = false;

    this.editingUserId = null;

    this.formError.set('');

    this.userForm.reset({

      name: '',

      email: '',

      contact: '',

      password: '',

      canReadUsers: false,

      canWriteUsers: false

    });

    this.userForm
      .get('email')
      ?.enable();

    this.userForm
      .get('canReadUsers')
      ?.enable();

    this.userForm
      .get('canWriteUsers')
      ?.enable();

  }

  /* =========================
     SAVE
  ========================= */

  saveUser(): void {

    this.formError.set('');

    if (this.userForm.invalid) {

      this.userForm.markAllAsTouched();

      return;

    }

    const currentUser =
      this.auth.getCurrentUser();

    if (!currentUser) {

      return;

    }

    this.savingUser = true;

    const formValue =
      this.userForm.getRawValue();

    const token =
      this.auth.getToken();

    const headers = {

      Authorization:
        `Bearer ${token}`

    };

    /* =========================
       UPDATE
    ========================= */

    if (
      this.editingUserId !== null
    ) {

      const isSelf =
        this.editingUserId ===
        currentUser.userId;

      const canEditPermissions =
        !isSelf &&
        (
          currentUser.isMasterAdmin ||
          currentUser.canWriteUsers
        );

      const payload:
        UpdateUserRequest = {

        name:
          formValue.name?.trim() ?? '',

        contact:
          formValue.contact?.trim() || null,

        password:
          formValue.password?.trim() || null

      };

      /*
        ONLY send permissions
        when editing another user
        and current user has permission.
      */

      if (canEditPermissions) {

        payload.canReadUsers =
          formValue.canReadUsers ?? false;

        payload.canWriteUsers =
          formValue.canWriteUsers ?? false;

      }

      this.http
        .put<UserResponse>(
          `${this.apiUrl}/${this.editingUserId}`,
          payload,
          { headers }
        )
        .subscribe({

          next: () => {

            this.savingUser = false;

            this.cancelUserForm();

            this.loadUsers();

          },

          error: (error) => {

            console.error(
              'Failed to update user:',
              error
            );

            this.savingUser = false;

            this.formError.set(
              error?.error?.message ||
              'Unable to update user.'
            );

          }

        });

      return;

    }

    /* =========================
       CREATE
    ========================= */

    const createPayload:
      CreateUserRequest = {

      name:
        formValue.name?.trim() ?? '',

      email:
        formValue.email?.trim() ?? '',

      contact:
        formValue.contact?.trim() || null,

      password:
        formValue.password?.trim() ?? '',

      canReadUsers:
        formValue.canReadUsers ?? false,

      canWriteUsers:
        formValue.canWriteUsers ?? false

    };

    this.http
      .post<UserResponse>(
        this.apiUrl,
        createPayload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.savingUser = false;

          this.cancelUserForm();

          this.loadUsers();

        },

        error: (error) => {

          console.error(
            'Failed to create user:',
            error
          );

          this.savingUser = false;

          this.formError.set(
            error?.error?.message ||
            'Unable to create user.'
          );

        }

      });

  }

  /* =========================
     DELETE
  ========================= */

  deleteUser(
    user: UserResponse
  ): void {

    if (
      !this.canDeleteUser(user)
    ) {

      return;

    }

    this.deletingUserId = user.id;

    const token =
      this.auth.getToken();

    const headers = {

      Authorization:
        `Bearer ${token}`

    };

    this.http
      .delete(
        `${this.apiUrl}/${user.id}`,
        { headers }
      )
      .subscribe({

        next: () => {

          this.deletingUserId = null;

          this.loadUsers();

        },

        error: (error) => {

          console.error(
            'Failed to delete user:',
            error
          );

          this.deletingUserId = null;

          this.errorMessage.set(
            error?.error?.message ||
            'Unable to delete user.'
          );

        }

      });

  }

  /* =========================
     VALIDATION
  ========================= */

  isFieldInvalid(
    fieldName: string
  ): boolean {

    const control =
      this.userForm.get(fieldName);

    return !!(
      control &&
      control.invalid &&
      (
        control.touched ||
        control.dirty
      )
    );

  }

}
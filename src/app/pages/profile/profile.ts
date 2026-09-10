import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Auth } from '../../services/auth';
import { CurrentUser, SaveUserRequest, UserResponse } from '../../interfaces/interfaces';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  public auth = inject(Auth);
  private http = inject(HttpClient);

  loading = false;
  successMessage = signal<string>('');
  errorMessage = signal<string>('');
  profileForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.maxLength(100)]),
    email: new FormControl({ value: '', disabled: true }),
    contact: new FormControl('', [Validators.pattern('^03[0-9]{9}$')]),
    password: new FormControl(''),
  });

  constructor() {
    this.loadUserDetails();
  }

  loadUserDetails(): void {
    const userId = this.auth.getCurrentUser()!.userId;
    const whereClause = `Id = ${userId}`;

    this.http
      .get<UserResponse[]>(`${API.users}`, {
        params: { whereClause },
        headers: authHeaders(this.auth.getToken()),
      })
      .subscribe({
        next: (response) => {
          const user = response[0];

          if (!user) return;

          this.profileForm.patchValue({
            name: user.name,
            email: user.email,
            contact: user.contact ?? '',
          });
        },
        error: (error) => {
          console.error('Failed to load profile:', error);
        },
      });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.profileForm.get(fieldName);
    return !!(field && field.invalid && (field.touched || field.dirty));
  }

  updateProfile(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.profileForm.markAllAsTouched();

    if (this.profileForm.invalid) {
      return;
    }

    const user = this.auth.getCurrentUser()!;

    this.loading = true;

    const value = this.profileForm.getRawValue();

    const payload: SaveUserRequest = {
      id: user.userId,
      name: value.name?.trim() ?? '',
      email: user.email,
      contact: value.contact?.trim() || null,
      password: value.password?.trim() || null,
      canReadUsers: user.canReadUsers,
      canWriteUsers: user.canWriteUsers,
    };

    this.http
      .post<UserResponse>(`${API.users}/save`, payload, {
        headers: authHeaders(this.auth.getToken()),
      })
      .subscribe({
        next: (response) => {
          const currentUser = this.auth.getCurrentUser();

          if (currentUser) {
            const updatedUser: CurrentUser = {
              ...currentUser,
              name: response.name,
            };

            this.auth.updateCurrentUser(updatedUser);
          }

          this.profileForm.patchValue({
            name: response.name,
            email: response.email,
            contact: response.contact ?? '',
            password: '',
          });

          this.loading = false;
          this.successMessage.set('Profile updated successfully.');
        },
        error: (error) => {
          console.error('Failed to update profile:', error);
          this.loading = false;
          this.errorMessage.set(getErrorMessage(error, 'Unable to update profile.'));
        },
      });
  }

  getAccessText(): string {
    const user = this.auth.getCurrentUser();

    if (!user) {
      return 'No Access';
    }

    if (user.isMasterAdmin) {
      return 'Master Admin';
    }

    if (user.canWriteUsers) {
      return 'Write Access';
    }

    if (user.canReadUsers) {
      return 'Read Access';
    }

    return 'Standard User';
  }

  getUserInitial(): string {
    const user = this.auth.getCurrentUser();
    return user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  }
}

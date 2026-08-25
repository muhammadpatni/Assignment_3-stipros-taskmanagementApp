import { HttpClient } from '@angular/common/http';
import { Component, inject, } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { CurrentUser, LoginResponse } from '../../interfaces/interfaces';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule,RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  loading = false;
  errorMessage = '';
  private readonly apiUrl = 'https://localhost:7253/auth';
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required)
  });
  private http = inject(HttpClient);
  private authService = inject(Auth);
  private router = inject(Router)
  login(): void {
    this.errorMessage = '';
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loading = true;
    const loginData = this.loginForm.getRawValue();
    this.http.post<LoginResponse>(`${this.apiUrl}/login`, loginData).subscribe({
      next: (response) => {
        const user: CurrentUser = {
          userId: response.userId,
          name: response.name,
          email: response.email,
          isMasterAdmin: response.isMasterAdmin,
          canReadUsers: response.canReadUsers,
          canWriteUsers: response.canWriteUsers
        };
        this.authService.setAuth(response.token, user);
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.loading = false;
        if (error.status === 401) { this.errorMessage = 'Invalid email or password.'; }
        else { this.errorMessage = 'Something went wrong. Please try again.'; }
      }
    });
  }
}

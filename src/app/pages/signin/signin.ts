import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-signin',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signin.html',
  styleUrl: './signin.css',
})
export class Signin {

  private http = inject(HttpClient);
  private router = inject(Router);

  loading = false;
  errorMessage = '';

  signupForm = new FormGroup({
    username: new FormControl('', Validators.required),
    email: new FormControl('', [Validators.required, Validators.email]),
    contact: new FormControl('', [Validators.required, Validators.pattern('^03[0-9]{9}$')]),
    password: new FormControl('', Validators.required),
  });

  isFieldInvalid(fieldName: string): boolean {
    const field = this.signupForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  onSubmit(): void {
    this.signupForm.markAllAsTouched();
    if (this.signupForm.valid) {
      this.loading = true;
      const signupData = {
        name: this.signupForm.value.username,
        email: this.signupForm.value.email,
        contact: this.signupForm.value.contact,
        password: this.signupForm.value.password
      };
      this.http.post<any>('https://localhost:7253/Auth/register', signupData).subscribe({
        next: () => {
          alert('Account created successfully.');
          this.loading = false;
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.log('Registration failed:', error);
          this.loading = false;
          if (error.error?.message) { alert(error.error.message); }
          else { alert('Registration failed.'); }
        }
      });
    }
  }
}
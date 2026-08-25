import { Injectable, signal } from '@angular/core';
import { CurrentUser } from '../interfaces/interfaces';

@Injectable({
  providedIn: 'root'
})
export class Auth {

  currentUser = signal<CurrentUser | null>(this.loadUser());

  setAuth(token: string, user: CurrentUser): void {
    localStorage.setItem('access_token', token);
    localStorage.setItem('current_user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  updateCurrentUser(user: CurrentUser): void {
    localStorage.setItem('current_user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    this.currentUser.set(null);
  }

  getToken(): string | null { return localStorage.getItem('access_token'); }

  getCurrentUser(): CurrentUser | null { return this.currentUser(); }

  isLoggedIn(): boolean { return this.getToken() !== null && this.currentUser() !== null; }

  isMasterAdmin(): boolean { return this.currentUser()?.isMasterAdmin === true; }

  canReadUsers(): boolean { return this.currentUser()?.canReadUsers === true; }

  canWriteUsers(): boolean { return this.currentUser()?.canWriteUsers === true; }

  canViewUsers(): boolean {
    const user = this.currentUser();
    return user?.isMasterAdmin === true || user?.canReadUsers === true || user?.canWriteUsers === true;
  }

  private loadUser(): CurrentUser | null {
    const storedUser = localStorage.getItem('current_user');
    if (!storedUser) { return null; }
    try { return JSON.parse(storedUser) as CurrentUser; }
    catch {
      localStorage.removeItem('current_user');
      return null;
    }
  }
}
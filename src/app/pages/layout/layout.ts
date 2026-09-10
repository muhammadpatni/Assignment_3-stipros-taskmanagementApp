import { Component, inject } from '@angular/core';
import { Auth } from '../../services/auth';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  public auth = inject(Auth);
  private router = inject(Router);
  sidebarOpen = true;
  toggleSidebar(): void { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebarOnMobile(): void { if (window.innerWidth <= 768) { this.sidebarOpen = false; } }
  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}

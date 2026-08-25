import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Auth } from '../../services/auth';
import { TaskResponse } from '../../interfaces/interfaces';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {

  public auth = inject(Auth);
  private http = inject(HttpClient);
  tasks = signal<TaskResponse[]>([]);

  pendingTasks = signal<number>(0);
  processTasks = signal<number>(0);
  completedTasks = signal<number>(0);
  totalUsers = signal<number>(0);

  ngOnInit(): void { this.loadDashboardData(); }

  loadDashboardData(): void {
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    this.http.get<TaskResponse[]>('https://localhost:7253/Task/my', { headers }).subscribe({
      next: (response) => {
        this.tasks.set(response);
        this.pendingTasks.set(response.filter(task => task.status === 1).length);
        this.processTasks.set(response.filter(task => task.status === 2).length);
        this.completedTasks.set(response.filter(task => task.status === 3).length);
      },
      error: (error) => { console.error('Failed to load dashboard tasks:', error); }
    });
    if (this.auth.canViewUsers()) {
      this.http.get<any[]>('https://localhost:7253/Users', { headers }).subscribe({
        next: (response) => { this.totalUsers .set(response.length); },
        error: (error) => { console.error('Failed to load users:', error); }
      });
    }
  }

  getStatusText(status: number): string {
    switch (status) {
      case 1:
        return 'Pending';
      case 2:
        return 'Process';
      case 3:
        return 'Completed';
      default:
        return 'Unknown';
    }
  }

  getStatusClass(status: number): string {
    switch (status) {
      case 1:
        return 'status-pending';
      case 2:
        return 'status-process';
      case 3:
        return 'status-completed';
      default:
        return '';
    }
  }

  getAssignedToName(task: TaskResponse): string {
    const currentUser = this.auth.getCurrentUser();
    if (currentUser && task.assignedToId === currentUser.userId) { return 'Myself'; }
    return task.assignedToName || 'Unassigned';
  }
}
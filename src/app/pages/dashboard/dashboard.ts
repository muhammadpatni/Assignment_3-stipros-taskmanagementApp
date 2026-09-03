import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Auth } from '../../services/auth';
import { TaskResponse } from '../../interfaces/interfaces';
import { API, authHeaders } from '../../helpers/api';
import { getAssignedToName, taskStatusClass, taskStatusText } from '../../helpers/task';

@Component({
  selector: 'app-dashboard',
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
  getStatusText = taskStatusText;
  getStatusClass = taskStatusClass;
  getAssignedToName = getAssignedToName;

  ngOnInit(): void { this.loadDashboardData(); }

  loadDashboardData(): void {
    const headers = authHeaders(this.auth.getToken());
    this.http.get<TaskResponse[]>(`${API.tasks}/my`, { headers }).subscribe({
      next: (response) => {
        this.tasks.set(response);
        this.pendingTasks.set(response.filter(task => task.status === 1).length);
        this.processTasks.set(response.filter(task => task.status === 2).length);
        this.completedTasks.set(response.filter(task => task.status === 3).length);
      },
      error: (error) => { console.error('Failed to load dashboard tasks:', error); }
    });
    if (this.auth.isMasterAdmin() || this.auth.canWriteUsers()||this.auth.canReadUsers()) {
      this.http.get<any[]>(API.users, { headers }).subscribe({
        next: (response) => { this.totalUsers.set(response.length); },
        error: (error) => { console.error('Failed to load users:', error); }
      });
    }
  }
}

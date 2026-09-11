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
    const user = this.auth.getCurrentUser();
    if (!user) {
      return;
    }

    const headers = authHeaders(this.auth.getToken());
    const whereClause =
      `(t.CreatedBy = ${user.userId} OR EXISTS(` +
      `SELECT 1 FROM OPENJSON(t.AssignedTo) j ` +
      `WHERE TRY_CONVERT(INT, j.value) = ${user.userId}))`;

    this.http.post<TaskResponse[]>(`${API.tasks}/my`, { whereClause }, { headers }).subscribe({
      next: (response) => {
        const activeTasks = response.filter(task => task.isDeleted !== true);
        this.tasks.set(activeTasks);
        this.pendingTasks.set(activeTasks.filter(task => task.status === 1).length);
        this.processTasks.set(activeTasks.filter(task => task.status === 2).length);
        this.completedTasks.set(activeTasks.filter(task => task.status === 3).length);
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

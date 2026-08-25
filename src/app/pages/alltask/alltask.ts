import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, UpdateTaskRequest, UpdateTaskStatusRequest } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';
import { API, authHeaders } from '../../helpers/api';
import { canChangeTaskStatus, canManageTasks } from '../../helpers/permissions';
import { filterTasks, taskStatusClass, taskStatusText, toDateInput } from '../../helpers/task';

@Component({
  selector: 'app-alltask',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './alltask.html',
  styleUrl: './alltask.css',
})
export class AllTask implements OnInit {

  public auth = inject(Auth);
  private http = inject(HttpClient);

  tasks = signal<TaskResponse[]>([]);
  filteredTasks = signal<TaskResponse[]>([]);
  assignableUsers = signal<AssignableUser[]>([]);
  todayDate = new Date().toISOString().split('T')[0];
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  formError = signal('');
  searchText = signal('');
  statusFilter = signal('all');
  showEditForm = false;
  editingTaskId: number | null = null;
  deletingTaskId: number | null = null;
  updatingStatusId: number | null = null;
  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl('', [Validators.maxLength(5000)]),
    dueDate: new FormControl<string | null>(null),
    assignedToId: new FormControl<number | null>(null)
  });

  ngOnInit(): void {
    this.loadTasks();
    if (this.canManageTasks()) { this.loadUsers(); }
  }

  canViewTasks(): boolean { return this.auth.canViewUsers(); }

  canManageTasks(): boolean { return canManageTasks(this.auth.getCurrentUser()); }

  canEditTask(task: TaskResponse): boolean { return canManageTasks(this.auth.getCurrentUser()); }

  canChangeStatus(task: TaskResponse): boolean {
    return canChangeTaskStatus(this.auth.getCurrentUser(), task);
  }

  canDeleteTask(task: TaskResponse): boolean { return canManageTasks(this.auth.getCurrentUser()); }

  getAccessText(): string {
    const user = this.auth.getCurrentUser();
    if (!user) { return 'View Only'; }
    if (user.isMasterAdmin) { return 'Full Access'; }
    if (user.canWriteUsers) { return 'Full Task Access'; }
    if (user.canReadUsers) { return 'View Only'; }
    return 'Limited Access';
  }

  loadTasks(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.http.get<TaskResponse[]>(`${API.tasks}/all`, { headers: authHeaders(this.auth.getToken()) }
    ).subscribe({
      next: response => {
        this.tasks.set(response);
        this.applyFilters();
        this.loading.set(false);
      },
      error: error => {
        console.error('Failed to load tasks:', error);
        this.errorMessage.set(error?.error?.message || 'Unable to load tasks.');
        this.loading.set(false);
      }
    });
  }
  loadUsers(): void {
    this.http.get<AssignableUser[]>(API.users, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: response => { this.assignableUsers.set(response); },
      error: error => { console.error('Failed to load users:', error); }
    });
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.applyFilters();
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value);
    this.applyFilters();
  }

  applyFilters(): void {
    this.filteredTasks.set(filterTasks(this.tasks(), this.searchText(), this.statusFilter()));
  }

  editTask(task: TaskResponse): void {
    if (!this.canEditTask(task)) { return; }
    this.editingTaskId = task.id;
    this.showEditForm = true;
    this.formError.set('');
    this.taskForm.patchValue({
      title: task.title,
      description: task.description ?? '',
      dueDate: toDateInput(task.dueDate),
      assignedToId: task.assignedToId
    });
  }

  toDateLocal(date: string | null): string | null {
    if (!date) { return null; }
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) { return null; }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  saveTask(): void {
    this.formError.set('');
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    if (this.editingTaskId === null) { return; }
    this.saving.set(true);
    const value = this.taskForm.getRawValue();
    const payload: UpdateTaskRequest = {
      title: value.title?.trim() ?? '',
      description: value.description?.trim() || null,
      dueDate: value.dueDate || null,
      assignedToId: value.assignedToId ?? null
    };
    this.http.put<TaskResponse>(`${API.tasks}/${this.editingTaskId}`, payload, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditForm();
        this.loadTasks();
      },
      error: error => {
        console.error('Failed to update task:', error);
        this.saving.set(false);
        this.formError.set(error?.error?.message || 'Unable to update task.');
      }
    });
  }

  changeStatus(task: TaskResponse, event: Event): void {
    if (!this.canChangeStatus(task)) { return; }
    const select = event.target as HTMLSelectElement;
    const status = Number(select.value);
    const payload: UpdateTaskStatusRequest = { status };
    this.updatingStatusId = task.id;
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/status`, payload, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: () => {
        this.updatingStatusId = null;
        this.loadTasks();
      },
      error: error => {
        console.error('Failed to update status:', error);
        this.updatingStatusId = null;
        this.errorMessage.set(error?.error?.message || 'Unable to update task status.');
      }
    });

  }

  deleteTask(task: TaskResponse): void {
    if (!this.canDeleteTask(task)) { return; }
    this.deletingTaskId = task.id;
    this.http.delete(`${API.tasks}/${task.id}`, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: () => {
        this.deletingTaskId = null;
        this.loadTasks();
      },
      error: error => {
        console.error('Failed to delete task:', error);
        this.deletingTaskId = null;
        this.errorMessage.set(error?.error?.message || 'Unable to delete task.');
      }
    });
  }

  closeEditForm(): void {
    if (this.saving()) { return; }
    this.showEditForm = false;
    this.editingTaskId = null;
    this.formError.set('');
    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: null,
      assignedToId: null

    });
  }

  getStatusText = taskStatusText;
  getStatusClass = taskStatusClass;

  isFieldInvalid(fieldName: string): boolean {
    const control = this.taskForm.get(fieldName);
    return !!(control && control.invalid && (control.touched || control.dirty));
  }
}

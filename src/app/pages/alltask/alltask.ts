import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, CreateTaskRequest, UpdateTaskRequest, UpdateTaskStatusRequest } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';

@Component({
  selector: 'app-alltask',
  imports: [CommonModule,
    FormsModule,
    ReactiveFormsModule],
  templateUrl: './alltask.html',
  styleUrl: './alltask.css',
})
export class AllTask implements OnInit {

  public auth = inject(Auth);
  private http = inject(HttpClient);

  private readonly taskApi = 'https://localhost:7253/Task';
  private readonly userApi = 'https://localhost:7253/Users';

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

  /* =========================
     PERMISSIONS
  ========================= */

  canViewTasks(): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (user.isMasterAdmin || user.canReadUsers || user.canWriteUsers);
  }

  canManageTasks(): boolean {
    const user = this.auth.getCurrentUser();

    if (!user) {
      return false;
    }

    return (
      user.isMasterAdmin ||
      user.canWriteUsers
    );
  }

  canEditTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();

    if (!user) {
      return false;
    }

    return (
      user.isMasterAdmin ||
      user.canWriteUsers
    );
  }

  canChangeStatus(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();

    if (!user) {
      return false;
    }

    return (
      user.isMasterAdmin || user.canWriteUsers || task.createdById === user.userId || task.assignedToId == user.userId
    );
  }

  canDeleteTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (user.isMasterAdmin || user.canWriteUsers);
  }

  getAccessText(): string {
    const user = this.auth.getCurrentUser();
    if (!user) { return 'View Only'; }
    if (user.isMasterAdmin) { return 'Full Access'; }
    if (user.canWriteUsers) { return 'Full Task Access'; }
    if (user.canReadUsers) { return 'View Only'; }
    return 'Limited Access';
  }

  /* =========================
     LOAD TASKS
  ========================= */

  loadTasks(): void {

    this.loading.set(true);
    this.errorMessage.set('');

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .get<TaskResponse[]>(
        `${this.taskApi}/all`,
        { headers }
      )
      .subscribe({

        next: response => {

          this.tasks.set(response);
          this.applyFilters();
          this.loading.set(false);

        },

        error: error => {

          console.error(
            'Failed to load tasks:',
            error
          );

          this.errorMessage.set(
            error?.error?.message ||
            'Unable to load tasks.'
          );

          this.loading.set(false);

        }

      });
  }

  /* =========================
     LOAD USERS
  ========================= */

  loadUsers(): void {

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .get<AssignableUser[]>(
        this.userApi,
        { headers }
      )
      .subscribe({

        next: response => {
          this.assignableUsers.set(response);
        },

        error: error => {
          console.error(
            'Failed to load users:',
            error
          );
        }

      });
  }

  /* =========================
     SEARCH / FILTER
  ========================= */

  onSearchChange(value: string): void {

    this.searchText.set(value);
    this.applyFilters();

  }

  onStatusChange(value: string): void {

    this.statusFilter.set(value);
    this.applyFilters();

  }

  applyFilters(): void {

    const search =
      this.searchText()
        .trim()
        .toLowerCase();

    const status =
      this.statusFilter();

    const result =
      this.tasks().filter(task => {

        const matchesSearch =
          !search ||
          task.title.toLowerCase().includes(search) ||
          (task.description ?? '')
            .toLowerCase()
            .includes(search) ||
          task.createdByName
            .toLowerCase()
            .includes(search) ||
          task.assignedToName
            .toLowerCase()
            .includes(search);

        const matchesStatus =
          status === 'all' ||
          Number(task.status) === Number(status);

        return matchesSearch && matchesStatus;

      });

    this.filteredTasks.set(result);

  }

  /* =========================
     EDIT
  ========================= */

  editTask(task: TaskResponse): void {

    if (!this.canEditTask(task)) {
      return;
    }

    this.editingTaskId = task.id;
    this.showEditForm = true;
    this.formError.set('');

    this.taskForm.patchValue({

      title: task.title,

      description:
        task.description ?? '',

      dueDate:
        this.toDateLocal(task.dueDate),

      assignedToId:
        task.assignedToId

    });

  }

  /* =========================
     DATE
  ========================= */

  toDateLocal(date: string | null): string | null {
  if (!date) {
    return null;
  }

  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return null;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
  /* =========================
     SAVE TASK
  ========================= */

  saveTask(): void {

    this.formError.set('');

    if (this.taskForm.invalid) {

      this.taskForm.markAllAsTouched();
      return;

    }

    if (this.editingTaskId === null) {
      return;
    }

    this.saving.set(true);

    const value =
      this.taskForm.getRawValue();

    const payload: UpdateTaskRequest = {

      title:
        value.title?.trim() ?? '',

      description:
        value.description?.trim() || null,

      dueDate:
        value.dueDate || null,

      assignedToId:
        value.assignedToId ?? null

    };

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .put<TaskResponse>(
        `${this.taskApi}/${this.editingTaskId}`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.saving.set(false);
          this.closeEditForm();
          this.loadTasks();

        },

        error: error => {

          console.error(
            'Failed to update task:',
            error
          );

          this.saving.set(false);

          this.formError.set(
            error?.error?.message ||
            'Unable to update task.'
          );

        }

      });

  }

  /* =========================
     STATUS
  ========================= */

  changeStatus(
    task: TaskResponse,
    event: Event
  ): void {

    if (!this.canChangeStatus(task)) {
      return;
    }

    const select =
      event.target as HTMLSelectElement;

    const status =
      Number(select.value);

    const payload: UpdateTaskStatusRequest = {
      status
    };

    this.updatingStatusId = task.id;

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .patch<TaskResponse>(
        `${this.taskApi}/${task.id}/status`,
        payload,
        { headers }
      )
      .subscribe({

        next: () => {

          this.updatingStatusId = null;
          this.loadTasks();

        },

        error: error => {

          console.error(
            'Failed to update status:',
            error
          );

          this.updatingStatusId = null;

          this.errorMessage.set(
            error?.error?.message ||
            'Unable to update task status.'
          );

        }

      });

  }

  /* =========================
     DELETE
  ========================= */

  deleteTask(task: TaskResponse): void {

    if (!this.canDeleteTask(task)) {
      return;
    }

    this.deletingTaskId = task.id;

    const token = this.auth.getToken();

    const headers = {
      Authorization: `Bearer ${token}`
    };

    this.http
      .delete(
        `${this.taskApi}/${task.id}`,
        { headers }
      )
      .subscribe({

        next: () => {

          this.deletingTaskId = null;
          this.loadTasks();

        },

        error: error => {

          console.error(
            'Failed to delete task:',
            error
          );

          this.deletingTaskId = null;

          this.errorMessage.set(
            error?.error?.message ||
            'Unable to delete task.'
          );

        }

      });

  }

  /* =========================
     CLOSE FORM
  ========================= */

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

  /* =========================
     STATUS TEXT
  ========================= */

  getStatusText(status: number): string {

    switch (status) {

      case 1:
        return 'Pending';

      case 2:
        return 'In Process';

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

  isFieldInvalid(
    fieldName: string
  ): boolean {

    const control =
      this.taskForm.get(fieldName);

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

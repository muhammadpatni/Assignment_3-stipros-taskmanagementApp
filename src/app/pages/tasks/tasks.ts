import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, FormControl } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, CreateTaskRequest } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';
import { canChangeTaskStatus, canDeleteTask, canEditTask } from '../../helpers/permissions';
import { filterTasks, taskStatusClass, taskStatusText } from '../../helpers/task';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './tasks.html',
  styleUrl: './tasks.css'
})
export class Tasks implements OnInit {

  tasks = signal<TaskResponse[]>([]);
  assignableUsers = signal<AssignableUser[]>([]);
  filteredAssignableUsers: AssignableUser[] = [];
  loading = signal<boolean>(false);
  loadingUsers = false;
  savingTask = false;
  showCreateForm = false;
  editingTaskId: number | null = null;
  showStatusForm = false;
  statusTaskId: number | null = null;
  deletingTaskId: number | null = null;
  assigneeDropdownOpen = false;
  errorMessage = signal<string>('');
  formError = signal<string>('');
  searchText = signal<string>('');
  todayDate = new Date().toISOString().split('T')[0];
  assigneeSearch = signal<string>('');
  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl(''),
    dueDate: new FormControl(''),
    assignedToId: new FormControl<number | null>(null)
  });

  public auth = inject(Auth);
  private http = inject(HttpClient);

  ngOnInit(): void { this.loadMyTasks(); }

  loadMyTasks(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.http.get<TaskResponse[]>(`${API.tasks}/my`, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: (response) => {
        this.tasks.set(response);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Failed to load tasks:', error);
        this.errorMessage.set(getErrorMessage(error, 'Unable to load tasks. Please try again.'));
        this.loading.set(false);
      }
    });
  }

  get filteredTasks(): TaskResponse[] { return filterTasks(this.tasks(), this.searchText()); }

  getStatusText = taskStatusText;

  getAssignedToDisplayName(task: TaskResponse): string {
    const currentUser = this.auth.getCurrentUser();
    if (currentUser && task.assignedToId === currentUser.userId) { return 'Myself'; }
    return task.assignedToName;
  }

  getStatusClass = taskStatusClass;

  canEditTask(task: TaskResponse): boolean { return canEditTask(this.auth.getCurrentUser(), task); }

  canChangeStatus(task: TaskResponse): boolean { return canChangeTaskStatus(this.auth.getCurrentUser(), task); }

  canDeleteTask(task: TaskResponse): boolean { return canDeleteTask(this.auth.getCurrentUser(), task); }

  createTask(): void {
    this.editingTaskId = null;
    this.showCreateForm = true;
    this.formError.set('');
    this.assigneeSearch.set('');
    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: '',
      assignedToId: null
    });
    this.loadAssignableUsers();
  }

  cancelCreateTask(): void {
    if (this.savingTask) { return; }
    this.showCreateForm = false;
    this.editingTaskId = null;
    this.assigneeDropdownOpen = false;
    this.formError.set('');
    this.assigneeSearch.set('');
    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: '',
      assignedToId: null
    });
  }

  loadAssignableUsers(): void {
    this.loadingUsers = true;
    this.formError.set('');
    this.http.get<AssignableUser[]>(`${API.users}/assignable`, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: (response) => {
        const currentUser = this.auth.getCurrentUser();
        let users = [...response];
        if (currentUser) {
          users = users.filter(user => user.id !== currentUser.userId);
          users.unshift({
            id: currentUser.userId,
            name: 'Myself',
            email: currentUser.email
          });
        }
        this.assignableUsers.set(users);
        this.filteredAssignableUsers = [...users];
        this.loadingUsers = false;
      },
      error: (error) => {
        console.error('Failed to load assignable users:', error);
        this.assignableUsers.set([]);
        this.filteredAssignableUsers = [];
        this.loadingUsers = false;
        this.formError.set(error?.error?.message || 'Unable to load available users.');
      }
    });
  }

  onAssigneeSearchChange(value: string): void {
    this.assigneeSearch.set(value);
    const search = value.trim().toLowerCase();
    if (!search) {
      this.filteredAssignableUsers = this.assignableUsers();
      return;
    }
    this.filteredAssignableUsers = this.assignableUsers().filter(user =>
      user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search));
  }

  openAssigneeDropdown(): void {
    this.assigneeDropdownOpen = true;
    this.filteredAssignableUsers = this.assignableUsers();
  }

  closeAssigneeDropdown(): void { this.assigneeDropdownOpen = false; }

  selectAssignee(user: AssignableUser): void {
    this.taskForm.patchValue({ assignedToId: user.id });
    this.assigneeSearch.set(user.name);
    this.assigneeDropdownOpen = false;
  }

  clearAssignee(): void {
    this.taskForm.patchValue({ assignedToId: null });
    this.assigneeSearch.set('');
    this.filteredAssignableUsers = this.assignableUsers();
  }

  getSelectedAssignee(): AssignableUser | null {
    const id = this.taskForm.get('assignedToId')?.value;
    if (!id) { return null; }
    return (this.assignableUsers().find(user => user.id === id) ?? null);
  }

  isTaskFieldInvalid(fieldName: string): boolean {
    const control = this.taskForm.get(fieldName);
    return !!(control && control.invalid && (control.touched || control.dirty));
  }

  saveTask(): void {
    this.formError.set('');
    if (this.taskForm.invalid) { this.taskForm.markAllAsTouched(); return; }
    this.savingTask = true;
    const formValue = this.taskForm.value;
    const payload: CreateTaskRequest = {
      title: formValue.title?.trim() ?? '',
      description: formValue.description?.trim() || null,
      dueDate: formValue.dueDate || null,
      assignedToId: formValue.assignedToId || null
    };
    const headers = authHeaders(this.auth.getToken());
    if (this.editingTaskId !== null) {
      this.http.put<TaskResponse>(`${API.tasks}/${this.editingTaskId}`, payload, { headers }).subscribe({
        next: () => {
          this.savingTask = false;
          this.showCreateForm = false;
          this.editingTaskId = null;
          this.assigneeDropdownOpen = false;
          this.taskForm.reset();
          this.assigneeSearch.set('');
          this.loadMyTasks();
        },
        error: (error) => {
          console.error('Failed to update task:', error);
          this.savingTask = false;
          this.formError.set(error?.error?.message || 'Unable to update task. Please try again.');
        }
      });
      return;
    }
    this.http.post<TaskResponse>(API.tasks, payload, { headers }).subscribe({
      next: () => {
        this.savingTask = false;
        this.showCreateForm = false;
        this.assigneeDropdownOpen = false;
        this.taskForm.reset();
        this.assigneeSearch.set('');
        this.editingTaskId = null;
        this.loadMyTasks();
      },
      error: (error) => {
        console.error('Failed to create task:', error);
        this.savingTask = false;
        this.formError.set(error?.error?.message || 'Unable to create task. Please try again.'
        );
      }
    });
  }

  editTask(task: TaskResponse): void {
    this.editingTaskId = task.id;
    this.showCreateForm = true;
    this.formError.set('');
    this.taskForm.patchValue({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ? task.dueDate.substring(0, 10) : '',
      assignedToId: task.assignedToId ?? null
    });
    this.assigneeSearch.set(task.assignedToId ? task.assignedToName : '');
    this.loadAssignableUsers();
  }

  changeStatus(task: TaskResponse): void { console.log('Change status:', task); }

  deleteTask(task: TaskResponse): void {
    this.deletingTaskId = task.id;
    const headers = authHeaders(this.auth.getToken());
    this.http.delete(`${API.tasks}/${task.id}`, { headers })
      .subscribe({
        next: () => {
          this.deletingTaskId = null;
          this.loadMyTasks();
        },
        error: (error) => {
          console.error('Failed to delete task:', error);
          this.deletingTaskId = null;
          this.errorMessage.set(error?.error?.message || 'Unable to delete task.');
        }
      });
  }

  canUpdateAssignedStatus(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return task.assignedToId === user.userId;
  }

  updateTaskStatus(task: TaskResponse, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newStatus = Number(select.value);
    if (!newStatus || newStatus === task.status) { return; }
    const headers = authHeaders(this.auth.getToken());
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/status`, { status: newStatus }, { headers })
      .subscribe({
        next: (response) => {
          this.tasks.update(tasks => tasks.map(item => item.id === task.id ? response : item));
        },
        error: (error) => {
          console.error('Failed to update task status:', error);
          this.errorMessage.set(error?.error?.message || 'Unable to update task status.');
        }
      });
  }
}

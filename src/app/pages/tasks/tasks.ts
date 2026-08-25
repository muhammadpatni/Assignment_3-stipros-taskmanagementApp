import { Component, inject, OnInit, Signal, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, CreateTaskRequest, UpdateTaskRequest } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';

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

  private readonly apiUrl = 'https://localhost:7253/Task';
  private readonly usersApiUrl = 'https://localhost:7253/Users';

  public auth = inject(Auth);
  private http = inject(HttpClient);

  ngOnInit(): void { this.loadMyTasks(); }

  loadMyTasks(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    this.http.get<TaskResponse[]>(`${this.apiUrl}/my`, { headers }).subscribe({
      next: (response) => {
        this.tasks.set(response);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Failed to load tasks:', error);
        this.errorMessage.set(error?.error?.message || 'Unable to load tasks. lease try again.');
        this.loading.set(false);
      }
    });
  }

  get filteredTasks(): TaskResponse[] {
    const search = this.searchText().trim().toLowerCase();
    if (!search) { return this.tasks(); }
    return this.tasks().filter(task =>
      task.title.toLowerCase().includes(search) || (task.description ?? '').toLowerCase().includes(search) || task.assignedToName.toLowerCase().includes(search) || task.createdByName.toLowerCase().includes(search));
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

  getAssignedToDisplayName(task: TaskResponse): string {
    const currentUser = this.auth.getCurrentUser();
    if (currentUser && task.assignedToId === currentUser.userId) { return 'Myself'; }
    return task.assignedToName;
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

  canEditTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (task.createdById === user.userId || user.isMasterAdmin || user.canWriteUsers);
  }

  canChangeStatus(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (task.createdById === user.userId || task.assignedToId === user.userId || user.isMasterAdmin || user.canWriteUsers);
  }

  canDeleteTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (task.createdById === user.userId || user.isMasterAdmin || user.canWriteUsers);
  }
  
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
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    this.http.get<AssignableUser[]>(`${this.usersApiUrl}/assignable`, { headers }).subscribe({
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
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (this.editingTaskId !== null) {
      this.http.put<TaskResponse>(`${this.apiUrl}/${this.editingTaskId}`, payload, { headers }).subscribe({
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
    this.http.post<TaskResponse>(this.apiUrl, payload, { headers }).subscribe({
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
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    this.http.delete(`${this.apiUrl}/${task.id}`, { headers })
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
    const token = this.auth.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    this.http.patch<TaskResponse>(`${this.apiUrl}/${task.id}/status`, { status: newStatus }, { headers })
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


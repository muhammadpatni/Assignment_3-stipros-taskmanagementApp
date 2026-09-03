import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, Validators, FormControl } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, CreateTaskRequest, UpdateTaskRequest, AuditLog } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';
import { canChangeTaskStatus, canEditTask } from '../../helpers/permissions';
import { filterTasks, getAssignedToName, taskStatusClass, taskStatusText } from '../../helpers/task';

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
  archivingTaskId: number | null = null;
  loadingUsers = false;
  savingTask = false;
  showCreateForm = false;
  previewMode = false;
  editingTaskId: number | null = null;
  showStatusForm = false;
  statusTaskId: number | null = null;
  deletingTaskId: number | null = null;
  assigneeDropdownOpen = false;
  parentTaskForCreate: TaskResponse | null = null;
  expandedTaskIds = signal<Set<number>>(new Set());
  errorMessage = signal<string>('');
  formError = signal<string>('');
  searchText = signal<string>('');
  activeTab = signal<'all' | 'created' | 'assigned' | 'archived'>('all');
  todayDate = new Date().toISOString().split('T')[0];
  getStatusClass = taskStatusClass;
  assigneeSearch = signal<string>('');
  getStatusText = taskStatusText;
  getAssignedToName = getAssignedToName;
  auditLogs = signal<AuditLog[]>([]);
  loadingAuditLogs = signal<boolean>(false);
  auditLogError = signal<string>('');
  private auditLogsLoadedForTask: number | null = null;
  activeModalTab: 'details' | 'logs' = 'details';
  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl(''),
    dueDate: new FormControl(''),
    assignedToIds: new FormControl<number[]>([])
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
        this.errorMessage.set(
          getErrorMessage(error, 'Unable to load tasks. Please try again.')
        );
        this.loading.set(false);
      }
    });
  }

  get filteredTasks(): TaskResponse[] {
    const currentUser = this.auth.getCurrentUser()!;
    let tasks = this.tasks();
    if (this.activeTab() === 'archived') { tasks = tasks.filter(task => task.isArchived); }
    else {
      tasks = tasks.filter(task => !task.isArchived);
      if (this.activeTab() === 'created') {
        tasks = tasks.filter(task => task.createdById === currentUser.userId);
      }
      else if (this.activeTab() === 'assigned') {
        tasks = tasks.filter(task => task.assignedToIds?.includes(currentUser.userId));
      }
    }
    return filterTasks(tasks, this.searchText());
  }

  canEditTask(task: TaskResponse): boolean { return canEditTask(this.auth.getCurrentUser(), task); }

  loadAuditLogs(taskId: number): void {
    if (this.auditLogsLoadedForTask === taskId && !this.loadingAuditLogs()) { return; }
    this.loadingAuditLogs.set(true);
    this.auditLogError.set('');
    const headers = authHeaders(this.auth.getToken());
    this.http.get<AuditLog[]>(`${API.tasks}/${taskId}/audit-logs`, { headers }).subscribe({
      next: (response) => {
        this.auditLogs.set(response ?? []);
        this.auditLogsLoadedForTask = taskId;
        this.loadingAuditLogs.set(false);
      },
      error: (error) => {
        console.error('Failed to load audit logs:', error);
        this.auditLogs.set([]);
        this.auditLogsLoadedForTask = null;
        this.loadingAuditLogs.set(false);
        this.auditLogError.set(error?.error?.message || 'Unable to load audit logs.');
      }
    });
  }

  toggleExpand(taskId: number, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.expandedTaskIds());
    if (next.has(taskId)) { next.delete(taskId); }
    else { next.add(taskId); }
    this.expandedTaskIds.set(next);
  }

  expandTask(taskId: number): void {
    const next = new Set(this.expandedTaskIds());
    next.add(taskId);
    this.expandedTaskIds.set(next);
  }

  isExpanded(taskId: number): boolean { return this.expandedTaskIds().has(taskId); }

  getChildren(taskId: number): TaskResponse[] {
    return this.filteredTasks.filter(task => task.parentTaskId === taskId);
  }

  hasChildren(taskId: number): boolean { return this.getChildren(taskId).length > 0; }

  rootTasks(): TaskResponse[] { return this.filteredTasks.filter(task => task.parentTaskId === null); }

  getParentTaskTitle(task: TaskResponse): string | null {
    if (task.parentTaskId === null || task.parentTaskId === undefined) { return null; }
    return this.tasks().find(t => t.id === task.parentTaskId)?.title ?? null;
  }

  getCurrentTask(): TaskResponse | undefined {
    if (this.editingTaskId === null) { return undefined; }
    return this.tasks().find(t => t.id === this.editingTaskId);
  }

  setActiveTab(tab: 'all' | 'created' | 'assigned' | 'archived'): void {
    this.activeTab.set(tab);
  }

  isOverdue(task: TaskResponse): boolean {
    if (task.isArchived) { return false; }
    if (!task.dueDate) { return false; }
    if (task.status === 3) { return false; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  getTabCount(tab: 'all' | 'created' | 'assigned' | 'archived'): number {
    const userId = this.auth.getCurrentUser()!.userId;
    const tasks = this.tasks();
    if (tab === 'archived') return tasks.filter(t => t.isArchived).length;
    return tasks.filter(t => !t.isArchived &&
      (tab === 'all' || (tab === 'created' && t.createdById === userId) || (tab === 'assigned' && t.assignedToIds?.includes(userId)))).length;
  }

  getEmptyStateTitle(): string {
    switch (this.activeTab()) {
      case 'created':
        return 'No Created Tasks';
      case 'assigned':
        return 'No Assigned Tasks';
      case 'archived':
        return 'No Archived Tasks';
      default:
        return 'No Tasks Found';
    }
  }

  getEmptyStateMessage(): string {
    switch (this.activeTab()) {
      case 'created':
        return "You haven't created any tasks yet.";
      case 'assigned':
        return "No tasks have been assigned to you.";
      case 'archived':
        return "You currently don't have any archived tasks.";
      default:
        return "You currently don't have any tasks.";
    }
  }

  setModalTab(tab: 'details' | 'logs'): void {
    this.activeModalTab = tab;
    if (tab === 'logs' && this.editingTaskId !== null) {
      this.loadAuditLogs(this.editingTaskId);
    }
  }

  canChangeStatus(task: TaskResponse): boolean {
    return canChangeTaskStatus(this.auth.getCurrentUser(), task);
  }

  createTask(): void {
    this.editingTaskId = null;
    this.showCreateForm = true;
    this.previewMode = false;
    this.parentTaskForCreate = null;
    this.activeModalTab = 'details';

    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');

    this.formError.set('');
    this.assigneeSearch.set('');

    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: '',
      assignedToIds: []
    });

    this.loadAssignableUsers();
  }

  addSubTask(parentTask: TaskResponse): void {
    this.editingTaskId = null;
    this.showCreateForm = true;
    this.previewMode = false;
    this.parentTaskForCreate = parentTask;
    this.activeModalTab = 'details';

    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');

    this.formError.set('');
    this.assigneeSearch.set('');

    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: '',
      assignedToIds: []
    });

    this.loadAssignableUsers();
  }

  cancelCreateTask(): void {
    if (this.savingTask) { return; }
    this.showCreateForm = false;
    this.previewMode = false;
    this.editingTaskId = null;
    this.parentTaskForCreate = null;
    this.assigneeDropdownOpen = false;
    this.activeModalTab = 'details';

    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');

    this.formError.set('');
    this.assigneeSearch.set('');

    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: '',
      assignedToIds: []
    });
  }

  getSelectedAssigneeNames(): string[] {
    const ids = this.taskForm.get('assignedToIds')?.value ?? [];
    return this.assignableUsers().filter(user => ids.includes(user.id)).map(user => user.name);
  }

  getSelectedAssigneeInitials(): string[] {
    return this.getSelectedAssigneeNames().map(name => name.charAt(0).toUpperCase());
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
        this.formError.set(error?.error?.message || 'Unable to load available users.'
        );
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
    this.filteredAssignableUsers =
      this.assignableUsers().filter(user =>
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search)
      );
  }

  openAssigneeDropdown(): void {
    this.assigneeDropdownOpen = true;
    this.filteredAssignableUsers =
      this.assignableUsers();
  }

  closeAssigneeDropdown(): void {
    this.assigneeDropdownOpen = false;
  }

  selectAssignee(user: AssignableUser): void {
    const currentIds = this.taskForm.get('assignedToIds')?.value ?? [];
    const updatedIds = currentIds.includes(user.id) ? currentIds.filter(id => id !== user.id)
      : [...currentIds, user.id];
    this.taskForm.patchValue({ assignedToIds: updatedIds });
    this.assigneeSearch.set('');
    this.filteredAssignableUsers = this.assignableUsers();
  }
  clearAssignee(): void {
    this.taskForm.patchValue({ assignedToIds: [] });
    this.assigneeSearch.set('');
    this.filteredAssignableUsers =
      this.assignableUsers();
  }

  removeAssignee(userId: number): void {
    const currentIds = this.taskForm.get('assignedToIds')?.value ?? [];
    this.taskForm.patchValue({
      assignedToIds: currentIds.filter(id => id !== userId)
    });
  }

  getSelectedAssignees(): AssignableUser[] {
    const ids = this.taskForm.get('assignedToIds')?.value ?? [];
    return this.assignableUsers().filter(user => ids.includes(user.id));
  }

  isTaskFieldInvalid(fieldName: string): boolean {
    const control = this.taskForm.get(fieldName);
    return !!(control && control.invalid && (control.touched || control.dirty));
  }

  archiveTask(task: TaskResponse): void {
    this.archivingTaskId = task.id;
    this.errorMessage.set('');
    const headers = authHeaders(this.auth.getToken());
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/archive`, {}, { headers }).subscribe({
      next: () => {
        this.archivingTaskId = null;
        this.loadMyTasks();
      },

      error: (error) => {
        console.error(task.isArchived ? 'Failed to unarchive task:' : 'Failed to archive task:',
          error
        );
        this.archivingTaskId = null;
        this.errorMessage.set(error?.error?.message || (task.isArchived ? 'Unable to unarchive task.' : 'Unable to archive task.'));
      }
    });
  }

  saveTask(): void {
    if (this.previewMode) { return; }
    this.formError.set('');
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    this.savingTask = true;
    const formValue = this.taskForm.value;
    const assignedToIds = [...new Set(formValue.assignedToIds ?? [])];
    const headers = authHeaders(this.auth.getToken());
    if (this.editingTaskId !== null) {
      const currentTask = this.tasks().find(t => t.id === this.editingTaskId);
      const updatePayload: UpdateTaskRequest = {
        title: formValue.title?.trim() ?? '',
        description: formValue.description?.trim() || null,
        dueDate: formValue.dueDate || null,
        assignedToIds,
        parentTaskId: currentTask?.parentTaskId ?? null
      };
      this.http.put<TaskResponse>(`${API.tasks}/${this.editingTaskId}`, updatePayload, { headers }).subscribe({
        next: () => {
          this.savingTask = false;
          this.showCreateForm = false;
          this.editingTaskId = null;
          this.assigneeDropdownOpen = false;
          this.taskForm.reset();
          this.assigneeSearch.set('');
          this.auditLogs.set([]);
          this.auditLogsLoadedForTask = null;
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

    const parentId = this.parentTaskForCreate?.id ?? null;
    const createPayload: CreateTaskRequest = {
      title: formValue.title?.trim() ?? '',
      description: formValue.description?.trim() || null,
      dueDate: formValue.dueDate || null,
      assignedToIds,
      parentTaskId: parentId
    };
    this.http.post<TaskResponse>(API.tasks, createPayload, { headers }).subscribe({
      next: () => {
        this.savingTask = false;
        this.showCreateForm = false;
        this.assigneeDropdownOpen = false;
        this.taskForm.reset();
        this.assigneeSearch.set('');
        this.editingTaskId = null;
        this.parentTaskForCreate = null;
        this.auditLogs.set([]);
        this.auditLogsLoadedForTask = null;
        this.loadMyTasks();
        if (parentId !== null) { this.expandTask(parentId); }
      },
      error: (error) => {
        console.error('Failed to create task:', error);
        this.savingTask = false;
        this.formError.set(error?.error?.message || 'Unable to create task. Please try again.');
      }
    });
  }

  editTask(task: TaskResponse): void {
    if (task.isArchived) {
      this.previewTask(task);
      return;
    }

    this.previewMode = false;
    this.editingTaskId = task.id;
    this.parentTaskForCreate = null;
    this.showCreateForm = true;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.taskForm.patchValue({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ? task.dueDate.substring(0, 10) : '',
      assignedToIds: [...(task.assignedToIds ?? [])]
    });
    this.assigneeSearch.set('');
    this.loadAssignableUsers();
    this.loadAuditLogs(task.id);
  }

  previewTask(task: TaskResponse): void {
    this.previewMode = true;
    this.editingTaskId = task.id;
    this.parentTaskForCreate = null;
    this.showCreateForm = true;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.taskForm.patchValue({
      title: task.title,
      description: task.description ?? '',
      dueDate: task.dueDate ? task.dueDate.substring(0, 10) : '',
      assignedToIds: [...(task.assignedToIds ?? [])]
    });
    this.assigneeSearch.set('');
    this.loadAssignableUsers();
    this.loadAuditLogs(task.id);
  }

  canUpdateAssignedStatus(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return task.assignedToIds.includes(user.userId);
  }

  updateTaskStatus(task: TaskResponse, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const newStatus = Number(select.value);
    if (!newStatus || newStatus === task.status) { return; }
    const headers = authHeaders(this.auth.getToken());
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/status`, { status: newStatus },
      { headers }).subscribe({
        next: (response) => {
          this.tasks.update(tasks => tasks.map(item => item.id === task.id ? response : item));
        },
        error: (error) => {
          console.error('Failed to update task status:', error);
          this.errorMessage.set(error?.error?.message || 'Unable to update task status.');
        }
      });
  }

  parseAuditValues(value: string | null | undefined): { key: string; value: string }[] {
    if (!value) { return []; }
    const rawStr = value.trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawStr);
    } catch {
      if (!rawStr.startsWith('{') && rawStr.includes(':')) {
        try { parsed = JSON.parse(`{${rawStr}}`); } catch {
          parsed = null;
        }
      }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, val]) => ({
        key: this.formatAuditKey(key),
        value: this.formatAuditValue(val, key)
      }));
    }
    const strToParse = typeof parsed === 'string' ? parsed : rawStr;
    const colonIndex = strToParse.indexOf(':');
    if (colonIndex > -1) {
      const rawKey = strToParse.substring(0, colonIndex).replace(/^"|"$/g, '').trim();
      const rawVal = strToParse.substring(colonIndex + 1).replace(/^"|"$/g, '').trim();
      return [{
        key: this.formatAuditKey(rawKey),
        value: this.formatAuditValue(rawVal, rawKey)
      }
      ];
    }
    return [{ key: '', value: this.formatAuditValue(strToParse) }];
  }

  formatAuditKey(key: string): string { return key.replace(/-/g, ' ').trim(); }

  formatAuditValue(value: any, key?: string): string {
    if (value === null || value === undefined || value === '') { return '—'; }
    if (Array.isArray(value)) { return value.map(item => this.formatAuditValue(item)).join('\n'); }
    let strVal = String(value).replace(/^"|"$/g, '').trim();
    if (key && key.toLowerCase().includes('assigned')) {
      return strVal.split(',').map(item => item.trim()).filter(item => item.length > 0).join('\n');
    }
    if (key && (key.toLowerCase().includes('date') || key.toLowerCase().includes('due'))) {
      const date = new Date(strVal);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
    }
    if (typeof value === 'object') { return JSON.stringify(value); }
    return strVal;
  }
}
import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TaskResponse, AssignableUser, CreateTaskRequest, UpdateTaskRequest, UpdateTaskStatusRequest, AuditLog } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';
import { API, authHeaders } from '../../helpers/api';
import { canChangeTaskStatus, canManageTasks, canEditTask } from '../../helpers/permissions';
import { filterTasks, taskStatusClass, taskStatusText, toDateInput } from '../../helpers/task';

@Component({
  selector: 'app-alltask',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './alltask.html',
  styleUrl: './alltask.css'
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
  formMode: 'edit' | 'create' = 'edit';
  parentTaskForCreate: TaskResponse | null = null;
  activeModalTab: 'details' | 'logs' = 'details';
  auditLogs = signal<AuditLog[]>([]);
  loadingAuditLogs = signal<boolean>(false);
  auditLogError = signal<string>('');
  private auditLogsLoadedForTask: number | null = null;
  expandedTaskIds = signal<Set<number>>(new Set());
  updatingStatusId: number | null = null;
  archivingTaskId: number | null = null;
  activeTab = signal<'all' | 'archived'>('all');
  assigneeSearch = signal('');
  assigneeDropdownOpen = false;
  getStatusText = taskStatusText;
  getStatusClass = taskStatusClass;

  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl('', [Validators.maxLength(5000)]),
    dueDate: new FormControl<string | null>(null),
    assignedToIds: new FormControl<number[]>([])
  });

  ngOnInit(): void {
    this.loadTasks();
    this.loadUsers();
  }

  onModalContentClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.assigneeDropdownOpen) { return; }
    const target = event.target as HTMLElement;
    if (!target.closest('.assignee-dropdown')) { this.assigneeDropdownOpen = false; }
  }

  setActiveTab(tab: 'all' | 'archived'): void {
    this.activeTab.set(tab);
    this.applyFilters();
  }

  getActiveTaskCount(): number { return this.tasks().filter(task => !task.isArchived).length; }

  getArchivedTaskCount(): number {
    return this.tasks().filter(task => task.isArchived).length;
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

    return this.filteredTasks().filter(
      task => task.parentTaskId === taskId
    );
  }

  hasChildren(taskId: number): boolean { return this.getChildren(taskId).length > 0; }

  rootTasks(): TaskResponse[] {
    const visible = this.filteredTasks();
    const visibleIds = new Set(visible.map(task => task.id));
    return visible.filter(task => task.parentTaskId === null || task.parentTaskId === undefined || !visibleIds.has(task.parentTaskId));
  }

  getParentTaskTitle(task: TaskResponse): string | null {
    if (task.parentTaskId === null || task.parentTaskId === undefined) { return null; }
    return this.getTaskById(task.parentTaskId)?.title ?? null;
  }

  canViewTasks(): boolean {
    return this.auth.isMasterAdmin() || this.auth.canWriteUsers() || this.auth.canReadUsers();
  }

  canManageTasks(): boolean { return canManageTasks(this.auth.getCurrentUser()); }

  canEditTask(task: TaskResponse): boolean { return canEditTask(this.auth.getCurrentUser(), task); }

  canChangeStatus(task: TaskResponse): boolean {
    return canChangeTaskStatus(this.auth.getCurrentUser(), task);
  }

  isOwnTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) { return false; }
    return (task.createdById === user.userId || (task.assignedToIds?.includes(user.userId) ?? false));
  }

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
    this.http.get<TaskResponse[]>(`${API.tasks}/all`, { headers: authHeaders(this.auth.getToken()) }).subscribe({
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
    let result = filterTasks(this.tasks(), this.searchText(), this.statusFilter());
    if (this.activeTab() === 'archived') {
      result = result.filter(task => task.isArchived);
    }
    else { result = result.filter(task => !task.isArchived); }
    this.filteredTasks.set(result);
  }

  editTask(task: TaskResponse): void {
    this.formMode = 'edit';
    this.parentTaskForCreate = null;
    this.editingTaskId = task.id;
    this.showEditForm = true;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.assigneeSearch.set('');
    this.assigneeDropdownOpen = false;
    this.taskForm.patchValue({
      title: task.title,
      description: task.description ?? '',
      dueDate: toDateInput(task.dueDate),
      assignedToIds: task.assignedToIds ? [...task.assignedToIds] : []
    });
  }

  setModalTab(tab: 'details' | 'logs'): void {
    this.activeModalTab = tab;
    if (tab === 'logs' && this.editingTaskId !== null) {
      this.loadAuditLogs(this.editingTaskId);
    }
  }

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

  openCreateTask(parentTask: TaskResponse | null): void {
    this.formMode = 'create';
    this.parentTaskForCreate = parentTask;
    this.editingTaskId = null;
    this.showEditForm = true;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.assigneeSearch.set('');
    this.assigneeDropdownOpen = false;
    this.taskForm.reset({ title: '', description: '', dueDate: null, assignedToIds: [] });
  }

  addSubTask(parentTask: TaskResponse): void { this.openCreateTask(parentTask); }

  saveTask(): void {
    this.formError.set('');
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    if (this.formMode === 'create') {
      this.createTask();
      return;
    }
    if (this.editingTaskId === null) { return; }
    this.saving.set(true);
    const value = this.taskForm.getRawValue();
    const currentTask = this.getTaskById(this.editingTaskId);
    const payload: UpdateTaskRequest = {
      title: value.title?.trim() ?? '',
      description: value.description?.trim() || null,
      dueDate: value.dueDate || null,
      assignedToIds: value.assignedToIds ?? [],
      parentTaskId: currentTask?.parentTaskId ?? null
    };
    this.http.put<TaskResponse>(`${API.tasks}/${this.editingTaskId}`, payload,
      { headers: authHeaders(this.auth.getToken()) }).subscribe({
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

  private createTask(): void {
    this.saving.set(true);
    const value = this.taskForm.getRawValue();
    const parentId = this.parentTaskForCreate?.id ?? null;
    const payload: CreateTaskRequest = {
      title: value.title?.trim() ?? '',
      description: value.description?.trim() || null,
      dueDate: value.dueDate || null,
      assignedToIds: value.assignedToIds ?? [],
      parentTaskId: parentId
    };
    this.http.post<TaskResponse>(API.tasks, payload, { headers: authHeaders(this.auth.getToken()) }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditForm();
        this.loadTasks();
        if (parentId !== null) { this.expandTask(parentId); }
      },
      error: error => {
        console.error('Failed to create task:', error);
        this.saving.set(false);
        this.formError.set(error?.error?.message || 'Unable to create task.');
      }
    });
  }

  changeStatus(task: TaskResponse, event: Event): void {
    if (!this.canChangeStatus(task)) { return; }
    const select = event.target as HTMLSelectElement;
    const status = Number(select.value);
    const payload: UpdateTaskStatusRequest = { status };
    this.updatingStatusId = task.id;
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/status`, payload, {
      headers: authHeaders(this.auth.getToken())
    }).subscribe({
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

  archiveTask(task: TaskResponse): void {
    if (!this.canEditTask(task) && !this.isOwnTask(task)) { return; }
    this.archivingTaskId = task.id;
    this.errorMessage.set('');
    this.http.patch<TaskResponse>(`${API.tasks}/${task.id}/archive`, {}, {
      headers: authHeaders(this.auth.getToken())
    }).subscribe({
      next: () => {
        this.archivingTaskId = null;
        this.loadTasks();
      },
      error: error => {
        console.error(task.isArchived ? 'Failed to unarchive task:' : 'Failed to archive task:', error);
        this.archivingTaskId = null;
        this.errorMessage.set(error?.error?.message || (task.isArchived
          ? 'Unable to unarchive task.' : 'Unable to archive task.'));
      }
    });
  }

  closeEditForm(): void {
    if (this.saving()) { return; }
    this.showEditForm = false;
    this.editingTaskId = null;
    this.formMode = 'edit';
    this.parentTaskForCreate = null;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.assigneeSearch.set('');
    this.assigneeDropdownOpen = false;
    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: null,
      assignedToIds: []
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.taskForm.get(fieldName);
    return !!(control && control.invalid && (control.touched || control.dirty));
  }

  get filteredAssignableUsers(): AssignableUser[] {
    const search = this.assigneeSearch().trim().toLowerCase();
    if (!search) { return this.assignableUsers(); }
    return this.assignableUsers().filter(user => user.name.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search));
  }

  onAssigneeSearchChange(value: string): void {
    this.assigneeSearch.set(value);
    this.assigneeDropdownOpen = true;
  }

  openAssigneeDropdown(): void { this.assigneeDropdownOpen = true; }

  getSelectedAssignees(): AssignableUser[] {
    const ids = this.taskForm.get('assignedToIds')?.value ?? [];
    return this.assignableUsers().filter(user => ids.includes(user.id));
  }

  getSelectedAssigneeNames(): string[] {
    return this.getSelectedAssignees().map(user => user.name);
  }

  getSelectedAssigneeInitials(): string[] {
    return this.getSelectedAssignees().map(user => user.name ? user.name.charAt(0).toUpperCase() : '?');
  }

  selectAssignee(user: AssignableUser): void {
    const control = this.taskForm.get('assignedToIds')!;
    const current = control.value ?? [];
    if (current.includes(user.id)) {
      control.setValue(current.filter(id => id !== user.id));
    }
    else { control.setValue([...current, user.id]); }
    this.assigneeDropdownOpen = true;
  }

  removeAssignee(userId: number): void {
    const control = this.taskForm.get('assignedToIds');
    if (!control) { return; }
    control.setValue((control.value ?? []).filter(id => id !== userId));
  }

  clearAssignee(): void { this.taskForm.get('assignedToIds')?.setValue([]); }

  getTaskById(id: number | null): TaskResponse | undefined {
    if (id === null) { return undefined; }
    return this.tasks().find(task => task.id === id);
  }

  getAssignedNames(task: TaskResponse): string {
    if (task.assignedToNames && task.assignedToNames.length > 0) {
      return task.assignedToNames.join(', ');
    }
    return 'Unassigned';
  }

  getAssignedInitials(task: TaskResponse): string {
    if (task.assignedToNames && task.assignedToNames.length > 0) {
      return task.assignedToNames.map(name => name ? name.charAt(0).toUpperCase() : '?').join('');
    }
    return '?';
  }

  getCurrentTask(): TaskResponse | undefined { return this.getTaskById(this.editingTaskId); }
}
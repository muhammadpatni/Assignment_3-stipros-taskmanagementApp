import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DxDataGridModule, DxTemplateModule } from 'devextreme-angular';
import { TaskResponse, AssignableUser, AuditLog, SaveTaskPayload } from '../../interfaces/interfaces';
import { Auth } from '../../services/auth';
import { API, authHeaders, getErrorMessage } from '../../helpers/api';
import { canManageTasks, canEditTask } from '../../helpers/permissions';
import { filterTasks, taskStatusClass, taskStatusText, toDateInput } from '../../helpers/task';

@Component({
  selector: 'app-alltask',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DxDataGridModule, DxTemplateModule],
  templateUrl: './alltask.html',
  styleUrl: './alltask.css',
})
export class AllTask implements OnInit {
  public auth = inject(Auth);
  private http = inject(HttpClient);

  tasks = signal<TaskResponse[]>([]);
  filteredTasks = signal<TaskResponse[]>([]);
  assignableUsers = signal<AssignableUser[]>([]);
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
  loadingAuditLogs = signal(false);
  auditLogError = signal('');
  private auditLogsLoadedForTask: number | null = null;
  expandedTaskIds = signal<Set<number>>(new Set());
  updatingStatusId: number | null = null;
  archivingTaskId: number | null = null;
  activeTab = signal<'all' | 'archived'>('all');
  assigneeSearch = signal('');
  assigneeDropdownOpen = signal(false);
  selectedAssigneeIds = signal<number[]>([]);
  todayDate = new Date().toISOString().split('T')[0];

  getStatusText = taskStatusText;
  getStatusClass = taskStatusClass;

  taskForm = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.maxLength(200)]),
    description: new FormControl('', [Validators.maxLength(5000)]),
    dueDate: new FormControl<string | null>(null),
    assignedToIds: new FormControl<number[]>([]),
  });

  visibleTasks = computed<TaskResponse[]>(() => {
    const tasks = this.filteredTasks();
    const taskIds = new Set(tasks.map((task) => task.id));
    const children = new Map<number | null, TaskResponse[]>();
    const result: TaskResponse[] = [];

    tasks.forEach((task) => {
      const parentId = task.parentTaskId !== null && task.parentTaskId !== undefined &&
        taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
      children.set(parentId, [...(children.get(parentId) ?? []), task]);
    });

    const append = (task: TaskResponse): void => {
      result.push(task);
      if (this.isExpanded(task.id)) {
        children.get(task.id)?.forEach(append);
      }
    };

    children.get(null)?.forEach(append);
    return result;
  });

  filteredAssignableUsers = computed<AssignableUser[]>(() => {
    const search = this.assigneeSearch().trim().toLowerCase();

    if (!search) {
      return this.assignableUsers();
    }

    return this.assignableUsers().filter(
      (user) => user.name.toLowerCase().includes(search) || user.email.toLowerCase().includes(search),
    );
  });

  selectedAssignees = computed<AssignableUser[]>(() => {
    const ids = this.selectedAssigneeIds();
    return this.assignableUsers().filter((user) => ids.includes(user.id));
  });

  ngOnInit(): void {
    this.loadTasks();
    this.loadUsers();
  }

  getTaskDepth(task: TaskResponse): number {
    let depth = 0;
    let parentId = task.parentTaskId;
    const tasks = this.filteredTasks();

    while (parentId !== null && parentId !== undefined) {
      const parent = tasks.find((item) => item.id === parentId);

      if (!parent) {
        break;
      }

      depth++;
      parentId = parent.parentTaskId;
    }
    return depth;
  }

  toggleExpand(taskId: number, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.expandedTaskIds());

    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    this.expandedTaskIds.set(next);
  }

  expandTask(taskId: number): void {
    const next = new Set(this.expandedTaskIds());
    next.add(taskId);
    this.expandedTaskIds.set(next);
  }

  isExpanded(taskId: number): boolean {
    return this.expandedTaskIds().has(taskId);
  }

  hasChildren(taskId: number): { hasChildren: boolean, childrenCount: number } {
    const childrenCount = this.filteredTasks().filter(task => task.parentTaskId === taskId).length;
    return {
      hasChildren: childrenCount > 0,
      childrenCount
    };
  }

  isArchivedByParent(task: TaskResponse): boolean {
    let parentId = task.parentTaskId;
    const visited = new Set<number>();

    while (parentId !== null && parentId !== undefined && !visited.has(parentId)) {
      const parent = this.tasks().find((item) => item.id === parentId);

      if (!parent) {
        return false;
      }

      if (parent.isArchived) {
        return true;
      }

      visited.add(parentId);
      parentId = parent.parentTaskId;
    }
    return false;
  }

  getParentTaskTitle(task: TaskResponse): string | null {
    if (task.parentTaskId === null || task.parentTaskId === undefined) {
      return null;
    }
    return this.getTaskById(task.parentTaskId)?.title ?? null;
  }

  canManageTasks(): boolean {
    return canManageTasks(this.auth.getCurrentUser());
  }

  canEditTask(task: TaskResponse): boolean {
    return canEditTask(this.auth.getCurrentUser(), task);
  }

  isOwnTask(task: TaskResponse): boolean {
    const user = this.auth.getCurrentUser();
    if (!user) {
      return false;
    }
    return (task.createdById === user.userId || (task.assignedToIds?.includes(user.userId) ?? false));
  }

  getAccessText(): string {
    const user = this.auth.getCurrentUser();
    if (!user) {
      return 'View Only';
    }
    if (user.isMasterAdmin) {
      return 'Full Access';
    }
    if (user.canWriteUsers) {
      return 'Full Task Access';
    }
    if (user.canReadUsers) {
      return 'View Only';
    }
    return 'Limited Access';
  }

  onTaskRowClick(event: { data: TaskResponse; column?: { dataField?: string }; event?: Event; }): void {

    if (event.column?.dataField === 'status') {
      return;
    }

    this.openTaskModal(event.data);
  }

  prepareStatusDropdown(event: Event): void {
    event.stopImmediatePropagation();
  }

  onModalContentClick(event: MouseEvent): void {
    event.stopPropagation();

    if (!this.assigneeDropdownOpen()) {
      return;
    }

    const target = event.target as HTMLElement;

    if (!target.closest('.assignee-dropdown')) {
      this.assigneeDropdownOpen.set(false);
    }
  }

  setActiveTab(tab: 'all' | 'archived'): void {
    this.activeTab.set(tab);
    this.applyFilters();
  }

  getActiveTaskCount(): number {
    return this.tasks().filter((task) => !task.isArchived).length;
  }

  getArchivedTaskCount(): number {
    return this.tasks().filter((task) => task.isArchived).length;
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
    let result = filterTasks(this.tasks(), this.searchText(), this.statusFilter(),);

    if (this.activeTab() === 'archived') {
      result = result.filter((task) => task.isArchived);
    } else {
      result = result.filter((task) => !task.isArchived);
    }
    this.filteredTasks.set(result);
  }

  loadTasks(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.http.post<TaskResponse[]>(`${API.tasks}/all`, { whereClause: 't.IsDeleted = 0', },
      { headers: authHeaders(this.auth.getToken()), },).subscribe({
        next: (response) => {
          this.tasks.set(response.filter((task) => task.isDeleted !== true),);
          this.applyFilters();
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Failed to load tasks:', error);
          this.errorMessage.set(getErrorMessage(error, 'Unable to load tasks.'),);
          this.loading.set(false);
        },
      });
  }

  loadUsers(): void {
    this.http.get<AssignableUser[]>(`${API.users}/assignable`, {
      headers: authHeaders(this.auth.getToken()),
    }).subscribe({
      next: (response) => {
        const currentUser = this.auth.getCurrentUser();
        let users = [...response];

        if (currentUser) {
          const currentUserIndex = users.findIndex(
            (user) => user.id === currentUser.userId,
          );

          if (currentUserIndex >= 0) {
            users[currentUserIndex] = {
              ...users[currentUserIndex],
              name: 'Myself',
              email: currentUser.email,
            };
          } 
        }
        this.assignableUsers.set(users);
      },
      error: (error) => {
        console.error('Failed to load users:', error);
        this.assignableUsers.set([]);
      },
    });
  }

  openTaskModal(task: TaskResponse | null, parentTask: TaskResponse | null = null): void {
    this.formMode = task ? 'edit' : 'create';
    this.parentTaskForCreate = task ? null : parentTask;
    this.editingTaskId = task?.id ?? null;
    this.showEditForm = true;
    this.activeModalTab = 'details';
    this.auditLogs.set([]);
    this.auditLogsLoadedForTask = null;
    this.auditLogError.set('');
    this.formError.set('');
    this.assigneeSearch.set('');
    this.assigneeDropdownOpen.set(false);

    const assignedToIds = task?.assignedToIds ? [...task.assignedToIds] : [];

    this.selectedAssigneeIds.set(assignedToIds);

    this.taskForm.reset({
      title: task?.title ?? '',
      description: task?.description ?? '',
      dueDate: task ? toDateInput(task.dueDate) : null,
      assignedToIds,
    });
  }

  setModalTab(tab: 'details' | 'logs'): void {
    this.activeModalTab = tab;

    if (tab === 'logs' && this.editingTaskId !== null) {
      this.loadAuditLogs(this.editingTaskId);
    }
  }

  loadAuditLogs(taskId: number): void {

    if (this.auditLogsLoadedForTask === taskId && !this.loadingAuditLogs()) {
      return;
    }

    this.loadingAuditLogs.set(true);
    this.auditLogError.set('');
    const headers = authHeaders(this.auth.getToken());
    this.http.get<AuditLog[]>(`${API.tasks}/${taskId}/audit-logs`, { headers },)
      .subscribe({
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
          this.auditLogError.set(
            getErrorMessage(error, 'Unable to load audit logs.'),
          );
        },
      });
  }

  parseAuditValues(value: string | null | undefined,): { key: string; value: string }[] {

    if (!value) {
      return [];
    }

    const rawStr = value.trim();
    let parsed: any = null;

    try {
      parsed = JSON.parse(rawStr);
    } catch {
      if (!rawStr.startsWith('{') && rawStr.includes(':')) {
        try {
          parsed = JSON.parse(`{${rawStr}}`);
        } catch {
          parsed = null;
        }
      }
    }

    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([key, val]) => ({
        key: key,
        value: this.formatAuditValue(val, key),
      }));
    }
    return [];
  }

  formatAuditValue(value: any, key?: string): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.formatAuditValue(item)).join('\n');
    }

    let strVal = String(value)

    if (key && key.toLowerCase().includes('assigned')) {
      return strVal
    }

    if (key && (key.toLowerCase().includes('date') || key.toLowerCase().includes('due'))) {
      const date = new Date(strVal);

      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    return strVal;
  }

  private postTaskSave(payload: SaveTaskPayload, defaultErrorMessage: string,
    onSuccess: (task: TaskResponse) => void, onError: (message: string) => void,): void {
    this.http.post<TaskResponse>(`${API.tasks}/save`, payload, {
      headers: authHeaders(this.auth.getToken()),
    }).subscribe({
      next: (response) => onSuccess(response),
      error: (error) => {
        console.error('Failed to save task:', error);
        onError(getErrorMessage(error, defaultErrorMessage));
      },
    });
  }

  saveTask(task?: TaskResponse, changes?: Partial<SaveTaskPayload>,): void {
    this.formError.set('');

    if (task && changes) {
      if (changes.status !== undefined && !this.canEditTask(task)) {
        return;
      }
      if (changes.isArchived !== undefined && !this.canEditTask(task) && !this.isOwnTask(task)) {
        return;
      }
      const payload: SaveTaskPayload = {
        id: task.id,
        ...changes,
      };

      if (changes.status !== undefined) {
        this.updatingStatusId = task.id;
      }

      if (changes.isArchived !== undefined) {
        this.archivingTaskId = task.id;
      }

      this.saving.set(true);

      this.postTaskSave(payload, 'Unable to save task.', (response) => {
        this.saving.set(false);

        if (changes.status !== undefined) {
          this.updatingStatusId = null;
          this.tasks.update((tasks) => tasks.map((item) => item.id === task.id ? response : item,),);
          this.applyFilters();
        }
        if (changes.isArchived !== undefined) {
          this.archivingTaskId = null;
          this.expandedTaskIds.set(new Set());
          this.loadTasks();
        }
      },
        (message) => {
          this.saving.set(false);
          this.updatingStatusId = null;
          this.archivingTaskId = null;
          this.errorMessage.set(message);
        },
      );
      return;
    }

    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const value = this.taskForm.getRawValue();
    const assignedToIds = [
      ...new Set(this.selectedAssigneeIds()),
    ];

    const parentId = this.formMode === 'create' ? (this.parentTaskForCreate?.id ?? null)
      : (this.getTaskById(this.editingTaskId)?.parentTaskId ?? null);

    const payload: SaveTaskPayload = {
      id: this.formMode === 'edit' ? this.editingTaskId : null,
      title: value.title?.trim() ?? '',
      description: value.description?.trim() || null,
      dueDate: value.dueDate || null,
      assignedToIds,
      parentTaskId: parentId,
    };

    const parentIdForExpand = this.parentTaskForCreate?.id ?? null;
    const isCreating = this.formMode === 'create';

    this.postTaskSave(payload, isCreating ? 'Unable to create task.' : 'Unable to update task.',
      () => {
        this.saving.set(false);
        this.closeEditForm();
        this.loadTasks();

        if (parentIdForExpand !== null) {
          this.expandTask(parentIdForExpand);
        }
      },
      (message) => {
        this.saving.set(false);
        this.formError.set(message);
      },
    );
  }

  loadStatus(task: TaskResponse, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = Number(select.value);

    if (!status || status === task.status) {
      return;
    }
    this.saveTask(task, { status });
  }

  archiveTask(task: TaskResponse): void {
    this.saveTask(task, {
      isArchived: !task.isArchived,
    });
  }

  closeEditForm(): void {
    if (this.saving()) {
      return;
    }

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
    this.assigneeDropdownOpen.set(false);
    this.selectedAssigneeIds.set([]);

    this.taskForm.reset({
      title: '',
      description: '',
      dueDate: null,
      assignedToIds: [],
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.taskForm.get(fieldName);

    return !!(
      control &&
      control.invalid &&
      (control.touched || control.dirty)
    );
  }

  onAssigneeSearchChange(value: string): void {
    this.assigneeSearch.set(value);
    this.assigneeDropdownOpen.set(true);
  }

  openAssigneeDropdown(): void {
    this.assigneeDropdownOpen.set(true);
  }

  selectAssignee(user: AssignableUser): void {
    const control = this.taskForm.get('assignedToIds');

    if (!control) {
      return;
    }

    const current = [...(control.value ?? [])];

    const updated = current.includes(user.id)
      ? current.filter((id) => id !== user.id)
      : [...current, user.id];

    control.setValue(updated);
    control.markAsDirty();

    this.selectedAssigneeIds.set(updated);

    this.assigneeSearch.set('');
    this.assigneeDropdownOpen.set(true);
  }

  removeAssignee(userId: number): void {
    const control = this.taskForm.get('assignedToIds');

    if (!control) {
      return;
    }

    const current = control.value ?? [];

    const updated = current.filter(
      (id) => id !== userId,
    );

    control.setValue(updated);
    control.markAsDirty();

    this.selectedAssigneeIds.set(updated);
  }

  clearAssignee(): void {
    const control = this.taskForm.get('assignedToIds');

    if (!control) {
      return;
    }

    control.setValue([]);
    control.markAsDirty();

    this.selectedAssigneeIds.set([]);

    this.assigneeSearch.set('');
    this.assigneeDropdownOpen.set(true);
  }

  getTaskById(id: number | null): TaskResponse | undefined {
    if (id === null) {
      return undefined;
    }

    return this.tasks().find((task) => task.id === id);
  }

  getAssignedNames(task: TaskResponse): string {
    if (
      task.assignedToNames &&
      task.assignedToNames.length > 0
    ) {
      return task.assignedToNames.join(', ');
    }

    return 'Unassigned';
  }

  getCurrentTask(): TaskResponse | undefined {
    return this.getTaskById(this.editingTaskId);
  }
}
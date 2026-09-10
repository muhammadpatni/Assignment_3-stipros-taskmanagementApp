import { CurrentUser, TaskResponse } from '../interfaces/interfaces';

export const TASK_STATUS = { pending: 1, inProcess: 2, completed: 3 } as const;

const STATUS_DETAILS: Record<number, { label: string; cssClass: string }> = {
  [TASK_STATUS.pending]: { label: 'Pending', cssClass: 'status-pending' },
  [TASK_STATUS.inProcess]: { label: 'In Process', cssClass: 'status-process' },
  [TASK_STATUS.completed]: { label: 'Completed', cssClass: 'status-completed' },
};

export type AuditValue = { key: string; value: string };

export const taskStatusText = (status: number): string =>
  STATUS_DETAILS[status]?.label ?? 'Unknown';

export const taskStatusClass = (status: number): string => STATUS_DETAILS[status]?.cssClass ?? '';

export const getAssignedToName = (task: TaskResponse, currentUser: CurrentUser | null): string => {
  const assignedIds = task.assignedToIds ?? [];
  const assignedNames = task.assignedToNames ?? [];

  if (currentUser && assignedIds.includes(currentUser.userId)) {
    return 'Myself';
  }

  return assignedNames.length > 0 ? assignedNames.join(', ') : 'Unassigned';
};

export const toDateInput = (date: string | null): string | null => {
  if (!date) {
    return null;
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

export const filterTasks = (
  tasks: TaskResponse[],
  searchText: string,
  status?: string,
): TaskResponse[] => {
  const search = searchText.trim().toLowerCase();

  return tasks.filter((task) => {
    const assignedNames = task.assignedToNames ?? [];
    const matchesSearch =
      !search ||
      [task.title, task.description, task.createdByName, ...assignedNames].some((value) =>
        (value ?? '').toLowerCase().includes(search),
      );

    return matchesSearch && (!status || status === 'all' || task.status === Number(status));
  });
};

export const myTasksWhereClause = (userId: number): string =>
  `(t.CreatedBy = ${userId} OR EXISTS(SELECT 1 FROM OPENJSON(t.AssignedTo) j WHERE TRY_CONVERT(INT, j.value) = ${userId}))`;

export const taskDepth = (task: TaskResponse, tasks: TaskResponse[]): number => {
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const visited = new Set<number>();
  let depth = 0;
  let parentId = task.parentTaskId;

  while (parentId !== null && !visited.has(parentId)) {
    const parent = taskById.get(parentId);

    if (!parent) {
      break;
    }

    visited.add(parentId);
    depth++;
    parentId = parent.parentTaskId;
  }

  return depth;
};

export const visibleTaskTree = (
  tasks: TaskResponse[],
  expandedTaskIds: Set<number>,
): TaskResponse[] => {
  const taskByParentId = new Map<number | null, TaskResponse[]>();
  const taskIds = new Set(tasks.map((task) => task.id));
  const visibleTasks: TaskResponse[] = [];

  for (const task of tasks) {
    const parentId =
      task.parentTaskId !== null && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
    taskByParentId.set(parentId, [...(taskByParentId.get(parentId) ?? []), task]);
  }

  const append = (task: TaskResponse): void => {
    visibleTasks.push(task);

    if (expandedTaskIds.has(task.id)) {
      taskByParentId.get(task.id)?.forEach(append);
    }
  };

  taskByParentId.get(null)?.forEach(append);
  return visibleTasks;
};

export const childTasks = (tasks: TaskResponse[], taskId: number): TaskResponse[] =>
  tasks.filter((task) => task.parentTaskId === taskId);

export const isTaskArchivedByParent = (task: TaskResponse, tasks: TaskResponse[]): boolean => {
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const visited = new Set<number>();
  let parentId = task.parentTaskId;

  while (parentId !== null && !visited.has(parentId)) {
    const parent = taskById.get(parentId);

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
};

export const isTaskOverdue = (task: TaskResponse): boolean => {
  if (task.isArchived || !task.dueDate || task.status === TASK_STATUS.completed) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
};

const formatAuditKey = (key: string): string => key.replace(/-/g, ' ').trim();

const formatAuditValue = (value: unknown, key?: string): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatAuditValue(item)).join('\n');
  }

  const text = String(value).replace(/^"|"$/g, '').trim();

  if (key?.toLowerCase().includes('assigned')) {
    return text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join('\n');
  }

  if (key?.toLowerCase().match(/date|due/)) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }

  return typeof value === 'object' ? JSON.stringify(value) : text;
};

export const parseAuditValues = (value: string | null | undefined): AuditValue[] => {
  if (!value?.trim()) {
    return [];
  }

  const rawValue = value.trim();
  let parsed: unknown = rawValue;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    if (!rawValue.startsWith('{') && rawValue.includes(':')) {
      try {
        parsed = JSON.parse(`{${rawValue}}`);
      } catch {
        parsed = rawValue;
      }
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return Object.entries(parsed).map(([key, item]) => ({
      key: formatAuditKey(key),
      value: formatAuditValue(item, key),
    }));
  }

  const text = String(parsed);
  const separatorIndex = text.indexOf(':');

  if (separatorIndex === -1) {
    return [{ key: '', value: formatAuditValue(text) }];
  }

  const key = text.slice(0, separatorIndex).replace(/^"|"$/g, '').trim();
  const item = text
    .slice(separatorIndex + 1)
    .replace(/^"|"$/g, '')
    .trim();

  return [{ key: formatAuditKey(key), value: formatAuditValue(item, key) }];
};

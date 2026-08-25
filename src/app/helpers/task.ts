import { TaskResponse } from '../interfaces/interfaces';

export const TASK_STATUS = { pending: 1, inProcess: 2, completed: 3 } as const;
const STATUS_DETAILS: Record<number, { label: string; cssClass: string }> = {
  [TASK_STATUS.pending]: { label: 'Pending', cssClass: 'status-pending' },
  [TASK_STATUS.inProcess]: { label: 'In Process', cssClass: 'status-process' },
  [TASK_STATUS.completed]: { label: 'Completed', cssClass: 'status-completed' },
};
export const taskStatusText = (status: number): string => STATUS_DETAILS[status]?.label ?? 'Unknown';
export const taskStatusClass = (status: number): string => STATUS_DETAILS[status]?.cssClass ?? '';
export const toDateInput = (date: string | null): string | null => {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
export const filterTasks = (tasks: TaskResponse[], searchText: string, status?: string) => {
  const search = searchText.trim().toLowerCase();
  return tasks.filter(task => {
    const matchesSearch = !search || [task.title, task.description, task.createdByName, task.assignedToName].some(value => (value ?? '').toLowerCase().includes(search));
    return matchesSearch && (!status || status === 'all' || task.status === Number(status));
  });
};

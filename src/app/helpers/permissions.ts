import { CurrentUser, TaskResponse, UserResponse } from '../interfaces/interfaces';

export const canManageTasks = (user: CurrentUser | null): boolean =>
  Boolean(user?.isMasterAdmin || user?.canWriteUsers);

const canAccessTask = (user: CurrentUser | null, task: TaskResponse): boolean =>
  canManageTasks(user) ||
  task.createdById === user?.userId ||
  task.assignedToIds?.includes(user?.userId ?? -1) === true;

export const canEditTask = canAccessTask;
export const canChangeTaskStatus = canAccessTask;

export const canEditUser = (user: CurrentUser | null, target: UserResponse): boolean =>
  Boolean(
    user &&
    ((target.isMasterAdmin && user.isMasterAdmin) ||
      (!target.isMasterAdmin && (target.id === user.userId || canManageTasks(user)))),
  );

export const canEditUserPermissions = (user: CurrentUser | null, target: UserResponse): boolean =>
  Boolean(user && target.id !== user.userId && canManageTasks(user));

export const canDeleteUser = (user: CurrentUser | null, target: UserResponse): boolean =>
  Boolean(user && !target.isMasterAdmin && target.id !== user.userId && canManageTasks(user));

import { CurrentUser, TaskResponse, UserResponse } from '../interfaces/interfaces';

export const canManageTasks = (user: CurrentUser | null): boolean => !!(user?.isMasterAdmin || user?.canWriteUsers);

export const canEditTask = (user: CurrentUser | null, task: TaskResponse): boolean =>
    !!(canManageTasks(user) || task.createdById === user?.userId || task.assignedToIds?.includes(user?.userId ?? -1));

export const canChangeTaskStatus = (user: CurrentUser | null, task: TaskResponse): boolean =>
    !!(canManageTasks(user) || task.createdById === user?.userId || task.assignedToIds?.includes(user?.userId ?? -1));

// export const canDeleteTask = (user: CurrentUser | null, task: TaskResponse): boolean =>
//   !!(canManageTasks(user) || task.createdById === user?.userId);

export const canEditUser = (user: CurrentUser | null, target: UserResponse): boolean => !!(user && ((target.isMasterAdmin && user.isMasterAdmin) || (!target.isMasterAdmin && (target.id === user.userId || canManageTasks(user)))));

export const canEditUserPermissions = (user: CurrentUser | null, target: UserResponse): boolean => !!(user && target.id !== user.userId && canManageTasks(user));

export const canDeleteUser = (user: CurrentUser | null, target: UserResponse): boolean => !!(user &&
    !target.isMasterAdmin && target.id !== user.userId && canManageTasks(user));
import { CurrentUser, TaskResponse, UserResponse } from '../interfaces/interfaces';

export const canManageTasks = (user: CurrentUser | null): boolean => !!(user?.isMasterAdmin || user?.canWriteUsers);
export const canEditTask = (user: CurrentUser | null, task: TaskResponse): boolean => !!(canManageTasks(user) || task.createdById === user?.userId);
export const canChangeTaskStatus = (user: CurrentUser | null, task: TaskResponse): boolean => !!(canManageTasks(user) || task.createdById === user?.userId || task.assignedToId === user?.userId);
export const canDeleteTask = (user: CurrentUser | null, task: TaskResponse): boolean => !!(canManageTasks(user) || task.createdById === user?.userId);
export const canEditUser = (user: CurrentUser | null, target: UserResponse): boolean => !!(user && (target.id === user.userId || canManageTasks(user)));
export const canEditUserPermissions = (user: CurrentUser | null, target: UserResponse): boolean => !!(user && target.id !== user.userId && canManageTasks(user));
export const canDeleteUser = (user: CurrentUser | null, target: UserResponse): boolean => !!(user?.isMasterAdmin && target.id !== user.userId);

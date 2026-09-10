export interface LoginResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
  isMasterAdmin: boolean;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface RegisterRequest {
  name: string;
  email: string;
  contact: string;
  password: string;
}

export interface CurrentUser {
  userId: number;
  name: string;
  email: string;
  isMasterAdmin: boolean;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface AssignableUser {
  id: number;
  name: string;
  email: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  description: string | null;
  createdDate: string;
  dueDate: string | null;
  status: number;
  createdById: number;
  createdByName: string;
  assignedToIds: number[];
  assignedToNames: string[];
  isArchived: boolean;
  parentTaskId: number | null;
}

export interface SaveTaskRequest {
  id?: number | null;
  title?: string | null;
  description?: string | null;
  dueDate?: string | null;
  assignedToIds?: number[];
  parentTaskId?: number | null;
  status?: number | null;
  isArchived?: boolean | null;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  contact: string | null;
  isMasterAdmin: boolean;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface SaveUserRequest {
  id: number | null;
  name: string;
  email: string;
  contact: string | null;
  password: string | null;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface AuditLog {
  id: number;
  taskId: number;
  userId: number;
  userName: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdDate: string;
}

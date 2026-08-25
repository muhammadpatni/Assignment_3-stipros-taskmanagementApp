export interface LoginResponse {
  token: string;
  userId: number;
  name: string;
  email: string;
  isMasterAdmin: boolean;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface CurrentUser {
  userId: number;
  name: string;
  email: string;
  isMasterAdmin: boolean;
  canReadUsers: boolean;
  canWriteUsers: boolean;
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
  assignedToId: number;
  assignedToName: string;
}

export interface AssignableUser {
  id: number;
  name: string;
  email: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string | null;
  dueDate: string | null;
  assignedToId: number | null;
}

export interface UpdateTaskRequest {
  title: string;
  description: string | null;
  dueDate: string | null;
  assignedToId: number | null;
}

export interface UpdateTaskStatusRequest {
  status: number;
}

export interface UpdateTaskRequest {
  title: string;
  description: string | null;
  dueDate: string | null;
  assignedToId: number | null;
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

export interface CreateUserRequest {
  name: string;
  email: string;
  contact: string | null;
  password: string;
  canReadUsers: boolean;
  canWriteUsers: boolean;
}

export interface UpdateUserRequest {
  name?: string;
  contact?: string | null;
  password?: string | null;
  canReadUsers?: boolean;
  canWriteUsers?: boolean;
}
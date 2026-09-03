export const API_URL = 'https://localhost:7253';
export const API = {
  auth: `${API_URL}/Auth`,
  tasks: `${API_URL}/Task`,
  users: `${API_URL}/Users`,
} as const;

export const authHeaders = (token: string | null): Record<string, string> => ({
  Authorization: `Bearer ${token ?? ''}`,
});
export const getErrorMessage = (error: any, fallback: string): string => error?.error?.message || error?.error || fallback;

export const API_URL = 'https://localhost:7253';
export const API = {
  auth: `${API_URL}/Auth`,
  tasks: `${API_URL}/Task`,
  users: `${API_URL}/Users`,
} as const;

export const authHeaders = (token: string | null): Record<string, string> => ({
  Authorization: `Bearer ${token ?? ''}`,
});

export const getErrorMessage = (error: unknown, fallback: string): string => {
  const response = error as { error?: unknown };

  if (typeof response?.error === 'string') {
    return response.error;
  }

  const message = (response?.error as { message?: unknown })?.message;
  return typeof message === 'string' ? message : fallback;
};

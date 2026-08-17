const TOKEN_KEY = 'drickly_admin_token';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface ErrorBody {
  error?: string;
  details?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { ...init, headers });

  if (response.status === 401 && token) {
    clearToken();
    window.location.href = '/admin';
    throw new ApiError(401, 'Session expired');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const body: ErrorBody = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'Request failed', body.details);
  }

  return (await response.json()) as T;
}

function withBody(method: string, body?: unknown): RequestInit {
  return { method, body: body !== undefined ? JSON.stringify(body) : undefined };
}

export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('POST', body)),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('PATCH', body)),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('PUT', body)),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

function removeToken(): void {
  localStorage.removeItem('auth_token');
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || '请求失败');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const authApi = {
  async register(email: string, password: string, username: string) {
    const result = await request<{ user: { id: string; email: string; username: string }; token: string }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, username })
      }
    );
    setToken(result.token);
    return result;
  },

  async login(email: string, password: string) {
    const result = await request<{ user: { id: string; email: string; username: string }; token: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password })
      }
    );
    setToken(result.token);
    return result;
  },

  async getMe() {
    return request<{ user: { id: string; email: string; username: string } }>('/auth/me');
  },

  logout() {
    removeToken();
  },

  isAuthenticated() {
    return !!getToken();
  }
};

export const scoreApi = {
  async list() {
    return request<{ 
      scores: Array<{ 
        id: string; 
        title: string; 
        createdAt: string; 
        updatedAt: string 
      }> 
    }>('/scores');
  },

  async get(id: string) {
    return request<{ 
      id: string; 
      title: string; 
      data: any; 
      createdAt: string; 
      updatedAt: string;
      operations: any[]
    }>(`/scores/${id}`);
  },

  async create(title?: string) {
    return request<{ 
      id: string; 
      title: string; 
      data: any; 
      createdAt: string; 
      updatedAt: string 
    }>(
      '/scores',
      {
        method: 'POST',
        body: JSON.stringify({ title })
      }
    );
  },

  async update(id: string, data: { title?: string; data?: any }) {
    return request<{ 
      id: string; 
      title: string; 
      data: any; 
      updatedAt: string 
    }>(
      `/scores/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data)
      }
    );
  },

  async delete(id: string) {
    return request<void>(`/scores/${id}`, { method: 'DELETE' });
  },

  async getHistory(id: string) {
    return request<{ 
      history: Array<{ 
        id: string; 
        type: string; 
        operation: any; 
        timestamp: string; 
        version: number;
        user: { id: string; username: string }
      }> 
    }>(`/scores/${id}/history`);
  }
};

export { getToken };

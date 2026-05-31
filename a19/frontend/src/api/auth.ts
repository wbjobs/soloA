import { apiClient } from './client';
import { User, LoginCredentials, RegisterData, AuthState } from '@/types';

interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<AuthState> {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    const { user, token } = response.data;
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    return {
      user,
      token,
      isAuthenticated: true
    };
  },

  async register(data: RegisterData): Promise<AuthState> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    const { user, token } = response.data;
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    return {
      user,
      token,
      isAuthenticated: true
    };
  },

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.data.user;
  },

  async updateUser(data: Partial<User>): Promise<User> {
    const response = await apiClient.put<{ user: User }>('/auth/me', data);
    return response.data.user;
  },

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getStoredAuth(): AuthState {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        return {
          user,
          token,
          isAuthenticated: true
        };
      } catch {
        return {
          user: null,
          token: null,
          isAuthenticated: false
        };
      }
    }
    
    return {
      user: null,
      token: null,
      isAuthenticated: false
    };
  }
};

import { create } from 'zustand';
import { AuthState, User, LoginCredentials, RegisterData } from '@/types';
import { authApi } from '@/api/auth';

interface AuthStore extends AuthState {
  isLoading: boolean;
  error: string | null;
  
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set) => {
  const initialAuth = authApi.getStoredAuth();
  
  return {
    user: initialAuth.user,
    token: initialAuth.token,
    isAuthenticated: initialAuth.isAuthenticated,
    isLoading: false,
    error: null,
    
    login: async (credentials: LoginCredentials) => {
      set({ isLoading: true, error: null });
      try {
        const auth = await authApi.login(credentials);
        set({
          ...auth,
          isLoading: false
        });
      } catch (error: any) {
        set({
          isLoading: false,
          error: error.response?.data?.message || 'Login failed'
        });
        throw error;
      }
    },
    
    register: async (data: RegisterData) => {
      set({ isLoading: true, error: null });
      try {
        const auth = await authApi.register(data);
        set({
          ...auth,
          isLoading: false
        });
      } catch (error: any) {
        set({
          isLoading: false,
          error: error.response?.data?.message || 'Registration failed'
        });
        throw error;
      }
    },
    
    logout: () => {
      authApi.logout();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    },
    
    setUser: (user: User) => {
      localStorage.setItem('user', JSON.stringify(user));
      set({ user });
    },
    
    clearError: () => {
      set({ error: null });
    }
  };
});

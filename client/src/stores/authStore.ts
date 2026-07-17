import { create } from 'zustand';
import type { User, Role } from '../../../shared/types';
import { api } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithOtp: (token: string, diverId: number, diverName: string) => void;
  logout: () => void;
  init: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  login: async (username, password) => {
    const data = await api.post<{ token: string; user: User }>('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user, token: data.token });
  },

  loginWithOtp: (token, diverId, diverName) => {
    const user: User = {
      id: 0,
      username: '',
      full_name: diverName,
      role: 'diver',
      team_id: null,
      diver_id: diverId,
      phone: '',
      email: '',
      created_at: '',
    };
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },

  init: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        set({ user: JSON.parse(userStr), token, loading: false });
      } catch {
        set({ loading: false });
      }
    } else {
      set({ loading: false });
    }
  },

  hasRole: (...roles) => {
    const user = get().user;
    return !!user && roles.includes(user.role);
  },
}));

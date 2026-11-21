import { create } from 'zustand';
import { api } from '../lib/api';
import type { AuthUser } from '../lib/types';

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user, ready: true }),
  clear: () => set({ user: null, ready: true }),
  refresh: async () => {
    try {
      const { user } = await api.get<{ user: AuthUser }>('/auth/me');
      set({ user, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },
}));

import { create } from 'zustand';
import { api } from '../lib/api';
import type { BillingResponse } from '../lib/types';

interface BillingState {
  data: BillingResponse | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useBillingStore = create<BillingState>((set) => ({
  data: null,
  ready: false,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.get<BillingResponse>('/billing/subscription');
      set({ data, ready: true, loading: false, error: null });
    } catch (error) {
      set({ data: null, ready: true, loading: false, error: (error as Error).message });
    }
  },
  reset: () => set({ data: null, ready: false, loading: false, error: null }),
}));

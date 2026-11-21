import { create } from 'zustand';
import { api } from '../lib/api';
import type { BillingResponse } from '../lib/types';

interface BillingState {
  data: BillingResponse | null;
  ready: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useBillingStore = create<BillingState>((set) => ({
  data: null,
  ready: false,
  loading: false,
  refresh: async () => {
    set({ loading: true });
    try {
      const data = await api.get<BillingResponse>('/billing/subscription');
      set({ data, ready: true, loading: false });
    } catch {
      set({ data: null, ready: true, loading: false });
    }
  },
  reset: () => set({ data: null, ready: false, loading: false }),
}));

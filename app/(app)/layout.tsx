'use client';

import type { ReactNode } from 'react';
import { AppShell } from '../../src/components/AppShell';
import { useAuthStore } from '../../src/store/auth';
import { Navigate, OutletProvider } from '../router-shim';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <OutletProvider outlet={children}>
      <AppShell />
    </OutletProvider>
  );
}

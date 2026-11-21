'use client';

import type { ReactNode } from 'react';
import { useBillingStore } from '../../../src/store/billing';
import { Navigate } from '../../router-shim';
import { Splash } from '../../splash';

export default function ProLayout({ children }: { children: ReactNode }) {
  const data = useBillingStore((state) => state.data);
  const ready = useBillingStore((state) => state.ready);

  if (!ready) return <Splash />;
  if (!data?.view?.hasAccess) return <Navigate to="/billing" replace />;
  return <>{children}</>;
}

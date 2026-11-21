'use client';

import { useEffect, type ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { ToastHost } from '../src/components/ToastHost';
import { useAuthStore } from '../src/store/auth';
import { useBillingStore } from '../src/store/billing';
import { Splash } from './splash';

function Bootstrap({ children }: { children: ReactNode }) {
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.user);
  const refresh = useAuthStore((state) => state.refresh);
  const refreshBilling = useBillingStore((state) => state.refresh);
  const resetBilling = useBillingStore((state) => state.reset);

  useEffect(() => {
    if (!ready) void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    if (!ready) return;
    if (user) void refreshBilling();
    else resetBilling();
  }, [ready, user?.id, refreshBilling, resetBilling]);

  // The original SPA showed the same splash until /auth/me resolved.
  if (!ready) return <Splash />;

  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <Bootstrap>{children}</Bootstrap>
    </I18nProvider>
  );
}

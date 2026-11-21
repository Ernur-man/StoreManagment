'use client';

import { Loader2, PackageOpen } from 'lucide-react';
import { useI18n } from '../src/i18n';

export function Splash() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
      <PackageOpen className="h-9 w-9 animate-pulse text-indigo-600" />
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    </div>
  );
}

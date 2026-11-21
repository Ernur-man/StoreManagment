import { Badge } from './ui';
import { useI18n } from '../i18n';
import { availabilityStyles, statusDots, statusStyles } from '../lib/utils';
import type { Availability, RequestStatus } from '../lib/types';

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useI18n();
  return <Badge className={statusStyles[status]} dot={statusDots[status]}>{t(`status.${status}`)}</Badge>;
}

export function AvailabilityBadge({ status }: { status: Availability }) {
  const { t } = useI18n();
  return <Badge className={availabilityStyles[status]} dot={status === 'IN_STOCK' ? 'bg-emerald-500' : status === 'LOW_STOCK' ? 'bg-amber-500' : 'bg-red-500'}>{t(`availability.${status}`)}</Badge>;
}

export function CustomerStatusBadge({ status }: { status: 'ACTIVE' | 'VIP' | 'INACTIVE' }) {
  const { t } = useI18n();
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    VIP: 'bg-violet-50 text-violet-700 ring-violet-200',
    INACTIVE: 'bg-slate-100 text-slate-500 ring-slate-200',
  };
  return <Badge className={styles[status]}>{t(`customerStatus.${status}`)}</Badge>;
}

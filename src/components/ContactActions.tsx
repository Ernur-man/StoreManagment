import { CheckCheck, LockKeyhole, Phone, ShoppingBag, MessageCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';
import { can } from '../lib/shared';
import { phoneHref, whatsappHref, cn } from '../lib/utils';
import { Button } from './ui';
import type { CustomerRequest, RequestStatus } from '../lib/types';

export function ContactActions({
  request,
  onChanged,
  compact = false,
}: {
  request: CustomerRequest;
  onChanged?: (request: CustomerRequest) => void;
  compact?: boolean;
}) {
  const { t, error: translateError } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const canWrite = can(currentUser?.role, 'requests:write');

  async function changeStatus(status: RequestStatus, endpoint = `/requests/${request.id}/status`) {
    if (!canWrite) {
      toast.error(t('auth.errors.forbidden'));
      return;
    }
    try {
      const { request: updated } = endpoint.endsWith('/contact')
        ? await api.post<{ request: CustomerRequest }>(endpoint)
        : await api.patch<{ request: CustomerRequest }>(endpoint, { status });
      onChanged?.(updated);
      toast.success(status === 'CONTACTED' ? t('requests.contactRecorded') : t('common.saved'));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  const message = `${request.productName} · ${request.size} / ${request.color}`;
  const canContact = ['AVAILABLE', 'CONTACTED', 'RESERVED'].includes(request.status);
  const canCancel = ['WAITING', 'AVAILABLE', 'CONTACTED', 'RESERVED'].includes(request.status);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', compact && 'gap-1')}>
      {canContact && (
        <>
          <a href={phoneHref(request.customer.phone)} title={t('common.call')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">
            <Phone className="h-3.5 w-3.5" />{compact ? '' : t('common.call')}
          </a>
          <a href={whatsappHref(request.customer.phone, message)} target="_blank" rel="noopener noreferrer" title={t('common.whatsapp')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">
            <MessageCircle className="h-3.5 w-3.5" />{compact ? '' : t('common.whatsapp')}
          </a>
        </>
      )}
      {canWrite && request.status === 'AVAILABLE' && (
        <>
          <Button size="sm" variant="soft" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => changeStatus('CONTACTED', `/requests/${request.id}/contact`)}>{compact ? t('status.CONTACTED') : t('common.markContacted')}</Button>
          <Button size="sm" variant="secondary" icon={<LockKeyhole className="h-3.5 w-3.5" />} onClick={() => changeStatus('RESERVED')}>{compact ? t('status.RESERVED') : t('common.markReserved')}</Button>
          <Button size="sm" variant="primary" icon={<ShoppingBag className="h-3.5 w-3.5" />} onClick={() => changeStatus('PURCHASED')}>{compact ? t('status.PURCHASED') : t('common.markPurchased')}</Button>
        </>
      )}
      {canWrite && request.status === 'CONTACTED' && (
        <>
          <Button size="sm" variant="secondary" icon={<LockKeyhole className="h-3.5 w-3.5" />} onClick={() => changeStatus('RESERVED')}>{t('common.markReserved')}</Button>
          <Button size="sm" variant="primary" icon={<ShoppingBag className="h-3.5 w-3.5" />} onClick={() => changeStatus('PURCHASED')}>{t('common.markPurchased')}</Button>
        </>
      )}
      {canWrite && request.status === 'RESERVED' && (
        <Button size="sm" variant="primary" icon={<ShoppingBag className="h-3.5 w-3.5" />} onClick={() => changeStatus('PURCHASED')}>{t('common.markPurchased')}</Button>
      )}
      {canWrite && canCancel && (
        <Button
          size="sm"
          variant="ghost"
          icon={<XCircle className="h-3.5 w-3.5" />}
          onClick={() => {
            if (window.confirm(t('requests.cancelConfirm'))) void changeStatus('CANCELLED');
          }}
        >
          {compact ? t('status.CANCELLED') : t('requests.cancelRequest')}
        </Button>
      )}
    </div>
  );
}

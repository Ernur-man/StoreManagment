import { useCallback, useEffect, useState } from 'react';
import { Crown, Eye, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionTitle, Select, Table, TableWrap } from './ui';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import { api } from '../lib/api';
import type { BillingAdminOverview, BillingAdminSubscription, SubscriptionStatus } from '../lib/types';
import { toast } from '../store/toast';

const statusKeys: Record<SubscriptionStatus, TranslationKey> = {
  inactive: 'billing.status.inactive',
  pending: 'billing.status.pending',
  active: 'billing.status.active',
  past_due: 'billing.status.past_due',
  cancelled: 'billing.status.cancelled',
  expired: 'billing.status.expired',
};

const editableStatuses: SubscriptionStatus[] = ['active', 'pending', 'past_due', 'cancelled', 'expired', 'inactive'];

export function AdminBilling() {
  const { t, formatDate, formatNumber, error: translateError } = useI18n();
  const [overview, setOverview] = useState<BillingAdminOverview | null>(null);
  const [selected, setSelected] = useState<BillingAdminSubscription | null>(null);
  const [detail, setDetail] = useState<BillingAdminSubscription | null>(null);
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>('active');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<BillingAdminOverview>('/billing/admin/overview');
      setOverview(data);
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }, [translateError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function inspect(subscription: BillingAdminSubscription) {
    setSelected(subscription);
    setNewStatus(subscription.status);
    try {
      const data = await api.get<{ subscription: BillingAdminSubscription }>(`/billing/admin/subscriptions/${subscription.id}`);
      setDetail(data.subscription);
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  async function saveStatus() {
    if (!selected) return;
    setBusy(true);
    try {
      const data = await api.patch<{ subscription: BillingAdminSubscription }>(`/billing/admin/subscriptions/${selected.id}`, {
        status: newStatus,
      });
      toast.success(t('billing.admin.statusUpdated'));
      setDetail((current) => (current ? { ...current, ...data.subscription } : current));
      setSelected((current) => (current ? { ...current, ...data.subscription } : current));
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.post('/billing/admin/subscriptions', { email: email.trim(), status: 'active', durationDays: 30 });
      toast.success(t('billing.admin.granted'));
      setEmail('');
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const stats = overview?.stats;
  const cards = stats
    ? [
        { label: t('billing.admin.totalSubscribers'), value: formatNumber(stats.totalSubscribers), icon: Users, tone: 'text-indigo-600 bg-indigo-50' },
        { label: t('billing.admin.activeSubscriptions'), value: formatNumber(stats.active), icon: Crown, tone: 'text-emerald-600 bg-emerald-50' },
        { label: t('billing.admin.expiredSubscriptions'), value: formatNumber(stats.expired), icon: ShieldCheck, tone: 'text-red-600 bg-red-50' },
        { label: t('billing.admin.pendingPayments'), value: formatNumber(stats.pending), icon: RefreshCw, tone: 'text-amber-600 bg-amber-50' },
        { label: t('billing.admin.monthlyRevenue'), value: `${formatNumber(stats.monthlyRevenueKzt)} ₸`, icon: Crown, tone: 'text-violet-600 bg-violet-50' },
      ]
    : [];

  return (
    <div className="mt-8">
      <PageHeader
        eyebrow={t('billing.admin.eyebrow')}
        title={t('billing.admin.title')}
        subtitle={t('billing.admin.subtitle')}
        actions={
          <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>
            {t('common.refresh')}
          </Button>
        }
      />

      {!overview ? (
        <Card><p className="p-6 text-sm text-slate-500">{t('common.loading')}</p></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="p-4">
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${card.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">{card.value}</p>
                </Card>
              );
            })}
          </div>

          <Card className="mt-5">
            <SectionTitle title={t('billing.admin.historyTitle')} subtitle={t('billing.admin.historySub')} />
            <div className="border-t border-slate-100">
              {overview.subscriptions.length === 0 ? (
                <EmptyState title={t('billing.admin.noSubscriptions')} />
              ) : (
                <TableWrap>
                  <Table headers={[t('billing.admin.customer'), t('billing.planColumn'), t('common.status'), t('billing.startDate'), t('billing.expirationDate'), t('common.actions')]}>
                    {overview.subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{subscription.user.name}</p>
                          <p className="text-xs text-slate-400">{subscription.user.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{subscription.plan.name}</td>
                        <td className="px-4 py-3">
                          <Badge className={subscription.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
                            {t(statusKeys[subscription.status])}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(subscription.startedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(subscription.expiresAt)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => void inspect(subscription)}>
                            {t('billing.admin.inspect')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </TableWrap>
              )}
            </div>
          </Card>

          <Card className="mt-5 p-5">
            <div className="mb-4">
              <h2 className="font-bold text-slate-900">{t('billing.admin.grantTitle')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('billing.admin.grantSubtitle')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('billing.admin.grantEmail')} className="min-w-64 flex-1">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" />
              </Field>
              <Button variant="primary" onClick={() => void grant()} disabled={busy || !email.trim()}>
                {t('billing.admin.grant')}
              </Button>
            </div>
          </Card>

          <p className="mt-3 text-xs text-slate-400">{t('billing.admin.sensitiveNote')}</p>
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setDetail(null); }}
        title={t('billing.admin.detailsTitle')}
        subtitle={selected?.user.email}
        footer={
          <>
            <Button onClick={() => { setSelected(null); setDetail(null); }}>{t('common.close')}</Button>
            <Button variant="primary" onClick={() => void saveStatus()} disabled={busy}>{t('billing.admin.saveStatus')}</Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="text-xs text-slate-400">{t('billing.admin.customer')}</dt><dd className="font-semibold text-slate-800">{detail.user.name}</dd></div>
              <div><dt className="text-xs text-slate-400">{t('common.status')}</dt><dd className="font-semibold text-slate-800">{t(statusKeys[detail.status])}</dd></div>
              <div><dt className="text-xs text-slate-400">{t('billing.startDate')}</dt><dd className="font-semibold text-slate-800">{formatDate(detail.startedAt)}</dd></div>
              <div><dt className="text-xs text-slate-400">{t('billing.expirationDate')}</dt><dd className="font-semibold text-slate-800">{formatDate(detail.expiresAt)}</dd></div>
            </dl>
            <Field label={t('billing.admin.editStatus')}>
              <Select value={newStatus} onChange={(event) => setNewStatus(event.target.value as SubscriptionStatus)}>
                {editableStatuses.map((status) => (
                  <option key={status} value={status}>{t(statusKeys[status])}</option>
                ))}
              </Select>
            </Field>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">{t('billing.admin.paymentHistory')}</h3>
              {(detail.paymentTransactions ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">{t('billing.admin.noPayments')}</p>
              ) : (
                <div className="space-y-2">
                  {detail.paymentTransactions?.map((payment) => (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-slate-600">{formatDate(payment.createdAt, true)}</span>
                      <span className="text-slate-500">{payment.provider}</span>
                      <span className="font-semibold text-slate-800">{formatNumber(payment.amountKzt)} ₸</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

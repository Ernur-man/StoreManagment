import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, CreditCard, Crown, Info, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, SectionTitle, Table, TableWrap } from '../components/ui';
import { AdminBilling } from '../components/AdminBilling';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import { api } from '../lib/api';
import type { CheckoutResponse, PaymentStatus, SubscriptionStatus } from '../lib/types';
import { useAuthStore } from '../store/auth';
import { useBillingStore } from '../store/billing';
import { toast } from '../store/toast';

const statusKeys: Record<SubscriptionStatus, TranslationKey> = {
  inactive: 'billing.status.inactive',
  pending: 'billing.status.pending',
  active: 'billing.status.active',
  past_due: 'billing.status.past_due',
  cancelled: 'billing.status.cancelled',
  expired: 'billing.status.expired',
};

const statusStyles: Record<SubscriptionStatus, string> = {
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  past_due: 'bg-orange-50 text-orange-700 ring-orange-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
  expired: 'bg-red-50 text-red-700 ring-red-200',
};

const paymentKeys: Record<PaymentStatus, TranslationKey> = {
  pending: 'billing.paymentStatus.pending',
  succeeded: 'billing.paymentStatus.succeeded',
  failed: 'billing.paymentStatus.failed',
  cancelled: 'billing.paymentStatus.cancelled',
};

export function Billing() {
  const { t, formatDate, formatNumber, error: translateError } = useI18n();
  const data = useBillingStore((state) => state.data);
  const ready = useBillingStore((state) => state.ready);
  const refresh = useBillingStore((state) => state.refresh);
  const loadError = useBillingStore((state) => state.error);
  const user = useAuthStore((state) => state.user);
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);

  const paymentResult = params.get('payment');
  const demoResult = params.get('demo');

  useEffect(() => {
    void refresh();
  }, [refresh, paymentResult, demoResult]);

  async function subscribe() {
    setBusy(true);
    try {
      const result = await api.post<CheckoutResponse>('/billing/checkout', {});
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      toast.error(translateError((err as Error).message));
      setBusy(false);
    }
  }

  /** DEMO renewal: reuse the signed ticket flow, then apply only a simulated result. */
  async function simulateRenewal(outcome: 'success' | 'failure') {
    setBusy(true);
    try {
      const checkout = await api.post<CheckoutResponse>('/billing/checkout', {});
      const token = new URL(checkout.checkoutUrl).searchParams.get('token');
      if (!token) throw new Error('billing.errors.invalidPayment');
      await api.post('/billing/demo/confirm', { token, outcome });
      if (outcome === 'success') toast.success(t('billing.demoSimSuccessBody'));
      else toast.info(t('billing.demoSimFailureBody'));
      await refresh();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm(t('billing.cancelConfirm'))) return;
    setBusy(true);
    try {
      await api.post('/billing/cancel');
      toast.success(t('billing.cancelled'));
      await refresh();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !data) {
    return loadError ? (
      <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
        <p className="text-sm text-red-700">{t('common.loadError')} {translateError(loadError)}</p>
        <Button className="mt-4" onClick={() => void refresh()}>{t('common.retry')}</Button>
      </Card>
    ) : <Loading />;
  }

  const { plan, view, payments } = data;
  const status = view.status;
  const isAdmin = user?.role === 'ADMIN';

  return (
    <>
      <PageHeader
        eyebrow={t('billing.eyebrow')}
        title={t('billing.title')}
        subtitle={t('billing.subtitle')}
      />

      {data.demo && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('billing.demoBanner')}</span>
        </div>
      )}

      {(paymentResult === 'success' || demoResult === 'success') && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{data.demo ? t('billing.paymentSuccess') : t('billing.paymentSuccessReal')}</span>
        </div>
      )}
      {(paymentResult === 'cancelled' || demoResult === 'cancel') && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('billing.paymentCancelled')}</span>
        </div>
      )}
      {demoResult === 'failure' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('billing.demoFailureBody')}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="relative overflow-hidden border-indigo-200 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white sm:p-8">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <Crown className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-200">{t('billing.planEyebrow')}</p>
                <h2 className="text-2xl font-extrabold tracking-tight">{plan.name}</h2>
              </div>
              <Badge className="ml-auto bg-white/15 text-white ring-white/20" dot="bg-emerald-300">
                {t('billing.planAvailable')}
              </Badge>
            </div>

            <div className="mt-7 flex items-end gap-2">
              <span className="text-4xl font-black tracking-tight sm:text-5xl">{formatNumber(plan.priceKzt)} ₸</span>
              <span className="mb-1.5 text-sm font-semibold text-indigo-200">/ {t('billing.month')}</span>
            </div>
            <p className="mt-1 text-xs text-indigo-200">{data.demo ? t('billing.priceNote') : t('billing.priceNoteReal')}</p>

            <div className="mt-7">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-indigo-200">{t('billing.featuresTitle')}</p>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-white/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{t(feature as TranslationKey)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="md"
                icon={<Sparkles className="h-4 w-4 text-indigo-600" />}
                onClick={subscribe}
                disabled={busy}
                className="min-w-44 bg-white text-indigo-700 hover:bg-indigo-50"
              >
                {t('billing.subscribeNow')}
              </Button>
              <span className="text-xs text-indigo-200">{t('billing.renewNote')}</span>
              {data.demo && (
                <Link
                  to="/billing/payment-methods"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20"
                >
                  <CreditCard className="h-4 w-4" />
                  {t('billing.card.title')}
                </Link>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle title={t('billing.currentStatus')} subtitle={t('billing.currentStatusSub')} />
            <div className="border-t border-slate-100 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge className={statusStyles[status]} dot="bg-current">
                  {t(statusKeys[status])}
                </Badge>
                <span className={view.hasAccess ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-slate-500'}>
                  {view.hasAccess ? t('billing.accessActive') : t('billing.accessInactive')}
                </span>
              </div>

              <dl className="mt-5 space-y-3.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t('billing.startDate')}</dt>
                  <dd className="font-semibold text-slate-800">{formatDate(view.startedAt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t('billing.nextConditionalRenewal')}</dt>
                  <dd className="font-semibold text-slate-800">{formatDate(view.nextPaymentAt)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t('billing.expirationDate')}</dt>
                  <dd className="font-semibold text-slate-800">{formatDate(view.expiresAt)}</dd>
                </div>
              </dl>

              {!view.hasAccess && (
                <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                  {t('billing.accessInactiveSub')}
                </p>
              )}
            </div>
          </Card>

          {view.hasAccess && (
            <Card>
              <SectionTitle
                title={t('billing.manageSubscription')}
                subtitle={t('billing.manageSubscriptionSub')}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>{t('billing.managePaidThrough')} {formatDate(view.expiresAt)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
                  {t('billing.cancelSubscription')}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {data.demo && (
        <Card className="mt-5">
          <SectionTitle title={t('billing.demoSimulationTitle')} subtitle={t('billing.demoSimulationSub')} />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
            <Button icon={<RotateCw className="h-4 w-4" />} onClick={() => void simulateRenewal('success')} disabled={busy}>
              {t('billing.demoSimulateSuccess')}
            </Button>
            <Button variant="danger" icon={<RotateCw className="h-4 w-4" />} onClick={() => void simulateRenewal('failure')} disabled={busy}>
              {t('billing.demoSimulateFailure')}
            </Button>
            <span className="text-xs text-slate-400">{t('billing.demoSimulationNote')}</span>
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <SectionTitle
          title={data.demo ? t('billing.operationHistoryTitle') : t('billing.operationHistoryTitleReal')}
          subtitle={data.demo ? t('billing.operationHistorySub') : t('billing.operationHistorySubReal')}
        />
        <div className="border-t border-slate-100">
          {payments.length === 0 ? (
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title={t('billing.noHistory')} description={t('billing.noHistorySub')} />
          ) : (
            <TableWrap>
              <Table headers={[t('common.date'), t('billing.planColumn'), t('common.status'), t('billing.provider'), t('common.total')]}>
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(payment.createdAt, true)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{plan.name}</td>
                    <td className="px-4 py-3">
                      <Badge className={
                        payment.status === 'succeeded'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : payment.status === 'failed'
                            ? 'bg-red-50 text-red-700 ring-red-200'
                            : 'bg-slate-100 text-slate-600 ring-slate-200'
                      }>
                        {t(paymentKeys[payment.status])}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      <span>{payment.provider}</span>
                      {payment.demo && (
                        <Badge className="ml-2 bg-amber-50 text-amber-700 ring-amber-200">{t('billing.demoBadgeShort')}</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">{formatNumber(payment.amountKzt)} ₸</td>
                  </tr>
                ))}
              </Table>
            </TableWrap>
          )}
        </div>
      </Card>

      {isAdmin && <AdminBilling />}
    </>
  );
}

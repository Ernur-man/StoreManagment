import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { Badge, Button, Card } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import type { BillingPlanResponse, DemoCardResponse, SubscriptionPlan } from '../lib/types';
import { toast } from '../store/toast';

type Outcome = 'success' | 'failure' | 'cancel';

export function DemoCheckout() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { t, formatNumber, error: translateError } = useI18n();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [paymentsAvailable, setPaymentsAvailable] = useState<boolean | null>(null);
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null);
  const [card, setCard] = useState<DemoCardResponse['card']>(null);
  const [busy, setBusy] = useState<Outcome | null>(null);

  useEffect(() => {
    void api
      .get<BillingPlanResponse>('/billing/plan')
      .then((data) => {
        setPlan(data.plan);
        setDemoMode(data.demoMode);
        setPaymentsAvailable(data.paymentsAvailable);
        setUnavailableKey(data.paymentUnavailableKey);
      })
      .catch(() => { /* the page below still explains the problem */ });
    void api
      .get<DemoCardResponse>('/billing/card')
      .then((data) => setCard(data.card))
      .catch(() => { /* the demo checkout stays usable without a card */ });
  }, []);

  async function confirm(outcome: Outcome) {
    if (!token || demoMode !== true) return;
    setBusy(outcome);
    try {
      await api.post('/billing/demo/confirm', { token, outcome });
      navigate(`/billing?demo=${outcome === 'failure' ? 'failure' : outcome === 'cancel' ? 'cancel' : 'success'}`, { replace: true });
    } catch (err) {
      toast.error(translateError((err as Error).message));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {paymentsAvailable === false && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
          {translateError(unavailableKey ?? 'billing.errors.paymentsUnavailable')}
        </div>
      )}

      {paymentsAvailable === true && !demoMode && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {t('billing.errors.demoDisabled')}
        </div>
      )}

      {demoMode && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-bold">{t('billing.demoNoticeTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed">{t('billing.demoNoticeBody')}</p>
          </div>
        </div>
      )}

      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{t('billing.demoCheckoutTitle')}</h1>
            <p className="text-xs text-slate-500">{t('billing.demoCheckoutSubtitle')}</p>
          </div>
          <Badge className="ml-auto bg-amber-100 text-amber-800 ring-amber-200">{t('billing.demoBadge')}</Badge>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{plan?.name ?? 'WishStock Pro'}</p>
            <p className="text-xs text-slate-500">{t('billing.durationDays', { count: plan?.durationDays ?? 30 })}</p>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatNumber(plan?.priceKzt ?? 7_990)} ₸</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-xs ring-1 ring-slate-200">
          <span className="font-semibold text-slate-600">
            {card ? `${t('billing.card.badge')}: ${card.masked}` : t('billing.card.noCard')}
          </span>
          <Link to="/billing/payment-methods" className="font-semibold text-indigo-600 hover:underline">
            {t('billing.card.title')}
          </Link>
        </div>

        {!token && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('billing.errors.invalidPayment')}</p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void confirm('success')} disabled={!token || demoMode !== true || !!busy}>
            {busy === 'success' ? t('common.loading') : t('billing.demoPay')}
          </Button>
          <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => void confirm('failure')} disabled={!token || demoMode !== true || !!busy}>
            {busy === 'failure' ? t('common.loading') : t('billing.demoFail')}
          </Button>
          <Button icon={<CreditCard className="h-4 w-4" />} onClick={() => void confirm('cancel')} disabled={!token || demoMode !== true || !!busy}>
            {busy === 'cancel' ? t('common.loading') : t('billing.demoCancel')}
          </Button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-slate-400">{t('billing.demoFooter')}</p>
      </Card>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, CreditCard, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, SectionTitle } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import type { DemoCard, DemoCardInput, DemoCardResponse } from '../lib/types';
import { toast } from '../store/toast';

const emptyForm: DemoCardInput = { number: '', holderName: '', expiry: '', cvv: '' };

export function PaymentMethods() {
  const { t, error: translateError, formatDate } = useI18n();
  const navigate = useNavigate();
  const [card, setCard] = useState<DemoCard | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<DemoCardInput>(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .get<DemoCardResponse>('/billing/card')
      .then((data) => { setCard(data.card); setReady(true); })
      .catch((err) => {
        toast.error(translateError((err as Error).message));
        setReady(true);
      });
  }, [translateError]);

  function update(field: keyof DemoCardInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      // PAN and CVV are sent for transient demo validation only. The response
      // contains masked metadata; the sensitive values are never returned.
      const data = await api.post<DemoCardResponse>('/billing/card', form);
      setCard(data.card);
      setForm(emptyForm);
      toast.success(t('billing.card.saved'));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t('billing.card.removeConfirm'))) return;
    setBusy(true);
    try {
      const data = await api.delete<DemoCardResponse>('/billing/card');
      setCard(data.card);
      toast.success(t('billing.card.removed'));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t('billing.card.eyebrow')}
        title={t('billing.card.title')}
        subtitle={t('billing.card.subtitle')}
        actions={
          <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/billing')}>
            {t('billing.card.backToBilling')}
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-bold">{t('billing.card.noticeTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed">{t('billing.card.noticeBody')}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <SectionTitle title={t('billing.card.currentTitle')} subtitle={t('billing.card.currentSub')} />
          <div className="border-t border-slate-100 px-5 py-5">
            {!ready ? (
              <p className="text-sm text-slate-400">{t('common.loading')}</p>
            ) : !card ? (
              <EmptyState
                icon={<CreditCard className="h-6 w-6" />}
                title={t('billing.card.noCard')}
                description={t('billing.card.noCardSub')}
              />
            ) : (
              <>
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 p-5 text-white">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">DEMO CARD</p>
                      <p className="mt-6 font-mono text-lg tracking-[0.15em]">{card.masked}</p>
                    </div>
                    <Badge className="bg-amber-400/20 text-amber-200 ring-amber-300/30">{t('billing.card.badge')}</Badge>
                  </div>
                  <div className="relative mt-6 flex flex-wrap items-end justify-between gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-indigo-300">{t('billing.card.holder')}</p>
                      <p className="font-semibold">{card.holderName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-indigo-300">{t('billing.card.expiryShort')}</p>
                      <p className="font-semibold">{String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}</p>
                    </div>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 text-xs text-slate-500">
                  <div className="flex justify-between gap-3">
                    <dt>{t('billing.card.added')}</dt>
                    <dd>{formatDate(card.createdAt, true)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>{t('billing.card.brand')}</dt>
                    <dd className="font-semibold text-slate-700">{card.brand}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="soft" size="sm" onClick={() => document.getElementById('demo-card-number')?.focus()}>
                    {t('billing.card.replace')}
                  </Button>
                  <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} disabled={busy}>
                    {t('billing.card.remove')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle title={t('billing.card.attachTitle')} subtitle={t('billing.card.attachSub')} />
          <form onSubmit={(event) => void save(event)} className="space-y-4 border-t border-slate-100 px-5 py-5">
            <Field label={t('billing.card.number')} hint={t('billing.card.testHint')}>
              <Input
                id="demo-card-number"
                value={form.number}
                onChange={(event) => update('number', event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={23}
                placeholder="4242 4242 4242 4242"
                required
              />
            </Field>
            <Field label={t('billing.card.holder')}>
              <Input
                value={form.holderName}
                onChange={(event) => update('holderName', event.target.value)}
                autoComplete="off"
                maxLength={60}
                placeholder="TEST USER"
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('billing.card.expiry')}>
                <Input
                  value={form.expiry}
                  onChange={(event) => update('expiry', event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="12/29"
                  required
                />
              </Field>
              <Field label={t('billing.card.cvv')}>
                <Input
                  type="password"
                  value={form.cvv}
                  onChange={(event) => update('cvv', event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="123"
                  required
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" icon={<ShieldCheck className="h-4 w-4" />} disabled={busy} className="w-full">
              {busy ? t('common.loading') : card ? t('billing.card.replace') : t('billing.card.save')}
            </Button>
            <p className="text-xs leading-relaxed text-slate-400">{t('billing.card.safetyNote')}</p>
          </form>
        </Card>
      </div>
    </>
  );
}

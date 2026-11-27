import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PackageCheck, Plus, Phone, MessageCircle, Sparkles, Lightbulb, ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, TableWrap, Textarea, Badge } from '../components/ui';
import { isoDate, phoneHref, whatsappHref } from '../lib/utils';
import { can } from '../lib/shared';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';
import type { Arrival, ArrivalEmailNotification, AuthUser } from '../lib/types';

interface ArrivalForm {
  sku: string;
  productName: string;
  size: string;
  color: string;
  quantity: string;
  unitCost: string;
  supplier: string;
  notes: string;
  arrivalDate: string;
  employeeId: string;
}

interface MatchResult {
  matchedRequests: Array<{ id: string; requestNumber: string; customerName: string; phone: string }>;
  quantityBefore: number;
  quantityAfter: number;
  emailNotificationIds?: string[];
}

export function Arrivals() {
  const { t, td, formatDate, error: translateError } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const canWrite = can(currentUser?.role, 'arrivals:write');
  const canRetryEmail = can(currentUser?.role, 'notifications:write');
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [emailNotifications, setEmailNotifications] = useState<ArrivalEmailNotification[]>([]);
  const [retryingEmailId, setRetryingEmailId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [viewing, setViewing] = useState<Arrival | null>(null);
  const [form, setForm] = useState<ArrivalForm>({
    sku: '', productName: '', size: '', color: '', quantity: '1', unitCost: '',
    supplier: '', notes: '', arrivalDate: isoDate(new Date()), employeeId: currentUser?.id ?? '',
  });

  const loadEmailHistory = useCallback(async () => {
    try {
      const data = await api.get<{ notifications: ArrivalEmailNotification[] }>('/notifications/emails');
      setEmailNotifications(data.notifications);
    } catch { /* email history is optional for the arrivals workflow */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ arrivals: Arrival[] }>('/arrivals');
      setArrivals(data.arrivals);
      setLoadError(null);
      await loadEmailHistory();
      try {
        const usersData = await api.get<{ users: AuthUser[] }>('/settings/users');
        setUsers(usersData.users);
      } catch { /* keep default */ }
    } catch (err) {
      const message = translateError((err as Error).message);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [translateError, loadEmailHistory]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      toast.error(t('auth.errors.forbidden'));
      return;
    }
    setSaving(true);
    try {
      const data = await api.post<MatchResult>('/arrivals', {
        sku: form.sku,
        productName: form.productName,
        size: form.size,
        color: form.color,
        quantity: Number(form.quantity),
        unitCost: form.unitCost ? Number(form.unitCost) : null,
        supplier: form.supplier || null,
        notes: form.notes || null,
        arrivalDate: form.arrivalDate ? new Date(`${form.arrivalDate}T12:00:00`).toISOString() : new Date().toISOString(),
        employeeId: form.employeeId || currentUser?.id,
      });
      setResult(data);
      setFormOpen(false);
      setForm({ ...form, sku: '', productName: '', size: '', color: '', quantity: '1', notes: '', supplier: '' });
      const queued = data.emailNotificationIds?.length ?? 0;
      toast.success((data.matchedRequests.length > 0
        ? t('arrivals.successMatched', { count: data.matchedRequests.length })
        : t('arrivals.successNoMatch')) + (queued > 0 ? ` ${t('arrivals.emailQueued')}` : ''));
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  async function retryEmail(id: string) {
    if (!canRetryEmail) {
      toast.error(t('auth.errors.forbidden'));
      return;
    }
    setRetryingEmailId(id);
    try {
      await api.post(`/notifications/emails/${id}/retry`);
      toast.success(t('common.saved'));
      await loadEmailHistory();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setRetryingEmailId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.arrivals')}
        title={t('arrivals.title')}
        subtitle={t('arrivals.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => setFormOpen(true)} icon={<Plus className="h-4 w-4" />}>{t('arrivals.newArrival')}</Button> : undefined}
      />

      {loadError && !loading && (
        <Card className="mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('common.loadError')} {loadError}</span>
            <Button size="sm" onClick={() => void load()}>{t('common.retry')}</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div><h2 className="font-bold text-slate-900">{t('arrivals.history')}</h2><p className="mt-0.5 text-xs text-slate-500">{t('arrivals.subtitle')}</p></div>
            <Badge className="bg-slate-100 text-slate-600">{arrivals.length}</Badge>
          </div>
          <div className="space-y-2 p-4">
            {loading ? <p className="py-12 text-center text-sm text-slate-500">{t('common.loading')}</p> : arrivals.length === 0 ? (
              <EmptyState icon={<PackageCheck className="h-5 w-5" />} title={t('arrivals.noArrivals')} description={t('arrivals.noArrivalsSub')} />
            ) : arrivals.map((arrival) => {
              const matched = arrival.items.reduce((sum, item) => sum + (item.matches?.length ?? 0), 0);
              return (
                <button key={arrival.id} type="button" onClick={() => setViewing(arrival)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 text-left hover:border-indigo-200 hover:bg-indigo-50/30">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><PackageCheck className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {td(arrival.items[0]?.productName ?? '—')}
                      {arrival.items[0] && <span className="ml-1 font-medium text-slate-500">· {arrival.items[0].size} / {td(arrival.items[0].color)}</span>}
                    </p>
                    <p className="text-[11px] text-slate-400">{arrival.arrivalNumber} · SKU {arrival.items[0]?.sku} · {formatDate(arrival.arrivalDate)} · {arrival.supplier ?? '—'} · {arrival.employee?.name ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">+{arrival.items.reduce((sum, item) => sum + item.quantity, 0)} {t('common.pcs')}</span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${matched > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{matched} {t('arrivals.matchedCount')}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <div className="flex items-center gap-2 px-5 pt-5"><Sparkles className="h-4 w-4 text-indigo-500" /><h2 className="font-bold text-slate-900">{t('arrivals.matching')}</h2></div>
          <div className="space-y-3 p-5">
            {[
              { text: t('arrivals.matchRule1'), icon: '1' },
              { text: t('arrivals.matchRule2'), icon: '2' },
              { text: t('arrivals.matchRule3'), icon: '3' },
            ].map((step) => (
              <div key={step.icon} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">{step.icon}</span>
                <p className="text-xs leading-relaxed text-slate-600">{step.text}</p>
              </div>
            ))}
            <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><Lightbulb className="h-4 w-4 shrink-0" /><p>{t('requests.purchaseHint')}</p></div>
            {canWrite && <Button variant="primary" className="w-full" onClick={() => setFormOpen(true)} icon={<ArrowRight className="h-4 w-4" />}>{t('arrivals.newArrival')}</Button>}
          </div>
        </Card>
      </div>

      {/* Customer email outbox history */}
      <Card className="mt-5 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5">
          <Mail className="h-4 w-4 text-indigo-500" />
          <div>
            <h2 className="font-bold text-slate-900">{t('arrivals.emailHistory')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t('arrivals.emailHistorySub')}</p>
          </div>
          <Badge className="ml-auto bg-slate-100 text-slate-600">{emailNotifications.length}</Badge>
        </div>
        {emailNotifications.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Mail className="h-5 w-5" />} title={t('arrivals.noEmailNotifications')} /></div>
        ) : (
          <TableWrap>
            <Table headers={[
              t('arrivals.emailCustomer'), t('arrivals.emailAddress'), t('arrivals.emailProduct'),
              t('arrivals.emailStatus'), t('arrivals.emailSentAt'), t('common.actions'),
            ]}>
              {emailNotifications.map((notification) => (
                <tr key={notification.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-700">{notification.customerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{notification.recipientEmail}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{td(notification.productName)} <span className="text-slate-400">· {notification.sku} · {notification.size} / {td(notification.color)}</span></td>
                  <td className="px-4 py-3">
                    <Badge className={notification.status === 'SENT' ? 'bg-emerald-50 text-emerald-700' : notification.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>
                      {notification.status === 'SENT' ? t('emailStatus.SENT') : notification.status === 'FAILED' ? t('emailStatus.FAILED') : t('emailStatus.PENDING')}
                    </Badge>
                    <p className="mt-1 text-[11px] text-slate-400">{t('arrivals.emailAttempts', { count: notification.attempts })}</p>
                    {notification.error && <p className="mt-1 max-w-xs truncate text-[11px] text-red-600" title={notification.error}>{t('arrivals.emailError')}: {notification.error}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{notification.sentAt ? formatDate(notification.sentAt, true) : '—'}</td>
                  <td className="px-4 py-3">
                    {canRetryEmail && notification.status !== 'SENT' && (
                      <Button size="sm" onClick={() => void retryEmail(notification.id)} disabled={retryingEmailId === notification.id} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                        {retryingEmailId === notification.id ? t('common.loading') : t('arrivals.retryEmail')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* Arrival form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={t('arrivals.newArrival')} subtitle={t('requests.matchHint')}
        footer={<>
          <Button onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="arrival-form" variant="primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>
        </>}>
        <form id="arrival-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('common.product')} *`}><Input required value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></Field>
          <Field label={`${t('common.sku')} *`} hint={t('arrivals.manualEntry')}><Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SK-1024" /></Field>
          <Field label={`${t('common.size')} *`}><Input required value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="M" /></Field>
          <Field label={`${t('common.color')} *`}><Input required value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Black" /></Field>
          <Field label={`${t('common.quantity')} *`}><Input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
          <Field label={t('arrivals.unitCost')}><Input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></Field>
          <Field label={t('arrivals.arrivalDate')}><Input required type="date" value={form.arrivalDate} onChange={(e) => setForm({ ...form, arrivalDate: e.target.value })} /></Field>
          <Field label={t('arrivals.employee')}><Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}{users.length === 0 && currentUser && <option value={currentUser.id}>{currentUser.name}</option>}</Select></Field>
          <Field label={t('common.supplier')}><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          <Field label={t('requests.additionalNotes')} className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="rounded-xl bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900 sm:col-span-2">{t('requests.matchHint')}</div>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      {/* Result */}
      <Modal open={Boolean(result)} onClose={() => setResult(null)} title={t('arrivals.matching')} subtitle={result ? t('arrivals.resultSubtitle', { count: result.matchedRequests.length }) : ''}
        footer={<Button variant="primary" onClick={() => setResult(null)}>{t('common.close')}</Button>}>
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{t('common.quantity')}</p><p className="mt-1 text-xl font-extrabold text-slate-800">{result.quantityBefore} → {result.quantityAfter}</p></div>
              <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">{t('arrivals.matchedCount')}</p><p className="mt-1 text-xl font-extrabold text-emerald-700">{result.matchedRequests.length}</p></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('arrivals.matchedCustomers')}</p>
              {result.matchedRequests.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('arrivals.successNoMatch')}</p> : (
                <div className="space-y-2">
                  {result.matchedRequests.map((match) => (
                    <div key={match.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                      <div className="flex-1"><p className="text-sm font-bold text-slate-800">{match.customerName}</p><p className="text-xs text-slate-400">{match.requestNumber} · {match.phone}</p></div>
                      <a href={phoneHref(match.phone)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700" title={t('common.call')}><Phone className="h-4 w-4" /></a>
                      <a href={whatsappHref(match.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-50 p-2 text-emerald-700" title={t('common.whatsapp')}><MessageCircle className="h-4 w-4" /></a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Arrival details */}
      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={t('arrivals.viewArrival')} subtitle={viewing?.arrivalNumber} wide footer={<Button onClick={() => setViewing(null)}>{t('common.close')}</Button>}>
        {viewing && (
          <div className="space-y-4">
            <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p><span className="text-slate-400">{t('arrivals.arrivalDate')}:</span> <span className="font-semibold">{formatDate(viewing.arrivalDate)}</span></p>
              <p><span className="text-slate-400">{t('common.supplier')}:</span> <span className="font-semibold">{viewing.supplier ?? '—'}</span></p>
              <p><span className="text-slate-400">{t('common.employee')}:</span> <span className="font-semibold">{viewing.employee?.name ?? '—'}</span></p>
              <p><span className="text-slate-400">{t('arrivals.totalReceived')}:</span> <span className="font-semibold">{viewing.items.reduce((s, i) => s + i.quantity, 0)}</span></p>
              {viewing.notes && <p className="sm:col-span-2"><span className="text-slate-400">{t('common.notes')}:</span> {viewing.notes}</p>}
            </div>
            {viewing.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-slate-800">{td(item.productName)} · {item.size} / {td(item.color)}</p>
                <p className="text-xs text-slate-400">SKU {item.sku} · +{item.quantity} {t('common.pcs')}</p>
                <div className="mt-3 space-y-1.5">
                  {(item.matches ?? []).map((match) => (
                    <div key={match.request.id} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <span className="font-semibold">{match.request.customer.name}</span>
                      <span>{match.request.customer.phone}</span>
                      <a href={phoneHref(match.request.customer.phone)} className="ml-auto"><Phone className="h-3.5 w-3.5" /></a>
                    </div>
                  ))}
                  {(item.matches ?? []).length === 0 && <p className="text-xs text-slate-400">{t('arrivals.successNoMatch')}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

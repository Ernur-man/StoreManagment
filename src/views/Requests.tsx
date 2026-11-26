import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ClipboardList, Eye, Pencil, Phone, Plus, Trash2, Download, FileSpreadsheet, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import {
  Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, TableWrap, Textarea,
} from '../components/ui';
import { RequestStatusBadge } from '../components/Badges';
import { ContactActions } from '../components/ContactActions';
import { exportCsv, exportExcel, isoDate, phoneHref, whatsappHref } from '../lib/utils';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';
import { can, REQUEST_SOURCES, REQUEST_STATUSES } from '../lib/shared';
import type { CustomerRequest } from '../lib/types';
import type { TranslationKey } from '../i18n/translations';

interface RequestForm {
  customerName: string;
  phone: string;
  productName: string;
  sku: string;
  category: string;
  size: string;
  color: string;
  source: string;
  requestDate: string;
  notes: string;
  email: string;
  emailLanguage: 'en' | 'ru';
}
const emptyForm = (): RequestForm => ({
  customerName: '', phone: '', productName: '', sku: '', category: '', size: '', color: '',
  source: 'IN_STORE', requestDate: isoDate(new Date()), notes: '', email: '', emailLanguage: 'en',
});

export function Requests() {
  const { t, td, formatDate, error: translateError } = useI18n();
  const currentUser = useAuthStore((state) => state.user);
  const canWrite = can(currentUser?.role, 'requests:write');
  const canDelete = can(currentUser?.role, 'requests:delete');
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRequest | null>(null);
  const [form, setForm] = useState<RequestForm>(emptyForm());
  const [viewing, setViewing] = useState<CustomerRequest | null>(null);
  const [deleting, setDeleting] = useState<CustomerRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status !== 'ALL') params.set('status', status);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('sort', sort);
      const data = await api.get<{ requests: CustomerRequest[] }>(`/requests?${params}`);
      setRequests(data.requests);
      setLoadError(null);
    } catch (err) {
      const message = translateError((err as Error).message);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, from, to, sort, translateError]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openForm(request?: CustomerRequest) {
    if (!canWrite) {
      toast.error(t('auth.errors.forbidden'));
      return;
    }
    setViewing(null);
    if (request) {
      setEditing(request);
      setForm({
        customerName: request.customer.name, phone: request.customer.phone, productName: request.productName,
        sku: request.sku, category: request.category ?? '', size: request.size, color: request.color,
        source: request.source, requestDate: request.requestDate ? isoDate(request.requestDate) : isoDate(new Date()), notes: request.notes ?? '',
        email: request.email ?? '', emailLanguage: request.emailLanguage === 'ru' ? 'ru' : 'en',
      });
    } else {
      setEditing(null);
      setForm(emptyForm());
    }
    setFormOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        category: form.category || null,
        notes: form.notes || null,
        email: form.email.trim() || null,
        emailLanguage: form.emailLanguage,
        requestDate: form.requestDate ? new Date(`${form.requestDate}T12:00:00`).toISOString() : new Date().toISOString(),
      };
      if (editing) await api.patch(`/requests/${editing.id}`, payload);
      else await api.post('/requests', payload);
      toast.success(editing ? t('requests.successUpdated') : t('requests.successCreated'));
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    if (!canDelete) {
      toast.error(t('auth.errors.forbidden'));
      return;
    }
    try {
      await api.delete(`/requests/${deleting.id}`);
      toast.success(t('common.deleted'));
      setDeleting(null);
      setViewing(null);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    }
  }

  function onChanged(updated: CustomerRequest) {
    setRequests((items) => items.map((r) => (r.id === updated.id ? updated : r)));
    setViewing((current) => current?.id === updated.id ? updated : current);
  }

  function exportData(kind: 'csv' | 'xls') {
    const columns = [
      { key: 'requestNumber' as const, label: t('requests.requestId') },
      { key: 'productName' as const, label: t('common.product') },
      { key: 'sku' as const, label: t('common.sku') },
      { key: 'size' as const, label: t('common.size') },
      { key: 'color' as const, label: t('common.color') },
      { key: 'customerName' as const, label: t('requests.customerName') },
      { key: 'phone' as const, label: t('requests.customerPhone') },
      { key: 'requestDate' as const, label: t('requests.requestDate') },
      { key: 'status' as const, label: t('common.status') },
      { key: 'employee' as const, label: t('common.employee') },
    ];
    const rows = requests.map((r) => ({
      requestNumber: r.requestNumber,
      productName: td(r.productName),
      sku: r.sku,
      size: r.size,
      color: td(r.color),
      customerName: r.customer.name,
      phone: r.customer.phone,
      requestDate: formatDate(r.requestDate),
      status: t(`status.${r.status}`),
      employee: r.employee?.name ?? '',
    }));
    const filename = `WishStock_requests_${isoDate(new Date())}`;
    if (kind === 'csv') exportCsv(rows, columns, filename);
    else exportExcel(rows, columns, filename);
    toast.success(t('common.exportStarted'));
  }

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.requests')}
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
        actions={canWrite ? <Button variant="primary" onClick={() => openForm()} icon={<Plus className="h-4 w-4" />}>{t('requests.newRequest')}</Button> : undefined}
      />

      {loadError && !loading && (
        <Card className="mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('common.loadError')} {loadError}</span>
            <Button size="sm" onClick={() => void load()}>{t('common.retry')}</Button>
          </div>
        </Card>
      )}

      <Card className="mb-5 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Input placeholder={t('requests.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="lg:col-span-2" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">{t('requests.allStatuses')}</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title={t('common.from')} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title={t('common.to')} />
          <Select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">{t('requests.sortNewest')}</option>
            <option value="oldest">{t('requests.sortOldest')}</option>
            <option value="product">{t('requests.sortProduct')}</option>
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400">
          <span>{requests.length} {t('common.total').toLowerCase()}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => exportData('csv')} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"><Download className="h-3.5 w-3.5" />{t('common.exportCsv')}</button>
            <button type="button" onClick={() => exportData('xls')} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"><FileSpreadsheet className="h-3.5 w-3.5" />{t('common.exportExcel')}</button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? <div className="py-16 text-center text-sm text-slate-500">{t('common.loading')}</div> : requests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title={t('requests.noRequests')} description={t('requests.noRequestsSub')} />
        ) : (
          <TableWrap>
            <Table headers={[
              t('requests.requestId'), t('common.product'), t('common.sku'), t('common.size'), t('common.color'),
              t('requests.customerName'), t('requests.customerPhone'), t('requests.requestDate'),
              t('common.status'), t('common.employee'), t('common.actions'),
            ]}>
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500">{request.requestNumber}</td>
                  <td className="px-4 py-3"><p className="whitespace-nowrap font-semibold text-slate-800">{td(request.productName)}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{request.sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{request.size}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{td(request.color)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-700">{request.customer.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    <a href={phoneHref(request.customer.phone)} className="inline-flex items-center gap-1 hover:text-indigo-600"><Phone className="h-3 w-3" />{request.customer.phone}</a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(request.requestDate)}</td>
                  <td className="px-4 py-3"><RequestStatusBadge status={request.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{request.employee?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button type="button" title={t('requests.viewRequest')} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" onClick={() => setViewing(request)}><Eye className="h-4 w-4" /></button>
                      {canWrite && <button type="button" title={t('common.edit')} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" onClick={() => openForm(request)}><Pencil className="h-4 w-4" /></button>}
                      {canDelete && <button type="button" title={t('common.delete')} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => { setViewing(null); setDeleting(request); }}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </TableWrap>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? t('requests.editRequest') : t('requests.newRequest')} subtitle={t('requests.subtitle')} wide
        footer={<>
          <Button onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="request-form" variant="primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>
        </>}>
        <form id="request-form" onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('requests.customerName')} *`}><Input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
            <Field label={`${t('requests.customerPhone')} *`} hint={t('customers.phoneHint')}><Input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label={`${t('common.email')} (${t('common.optional')})`} hint={t('requests.emailHint')}><Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('requests.emailLanguage')}><Select value={form.emailLanguage} onChange={(e) => setForm({ ...form, emailLanguage: e.target.value === 'ru' ? 'ru' : 'en' })}><option value="en">English</option><option value="ru">Русский</option></Select></Field>
            <Field label={`${t('requests.productName')} *`}><Input required value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></Field>
            <Field label={`${t('common.sku')} *`}><Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label={t('common.category')}><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label={`${t('common.size')} *`}><Input required value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></Field>
            <Field label={`${t('common.color')} *`}><Input required value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
            <Field label={t('requests.requestSource')}><Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{REQUEST_SOURCES.map((s) => <option key={s} value={s}>{t(`source.${s}`)}</option>)}</Select></Field>
            <Field label={t('requests.requestDate')}><Input required type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} /></Field>
            <Field label={t('requests.additionalNotes')} className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('requests.additionalNotesPlaceholder')} /></Field>
          </div>
          <div className="rounded-xl bg-indigo-50/70 px-4 py-3 text-xs leading-relaxed text-indigo-900">{t('requests.formHint')}<br />{t('requests.matchHint')}</div>
          <button type="submit" className="hidden" />
        </form>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={t('requests.viewRequest')} subtitle={viewing?.requestNumber} wide
        footer={<>
          {canDelete && <Button variant="danger" onClick={() => { if (viewing) { setViewing(null); setDeleting(viewing); } }} icon={<Trash2 className="h-4 w-4" />}>{t('common.delete')}</Button>}
          {canWrite && <Button onClick={() => { if (viewing) openForm(viewing); }} icon={<Pencil className="h-4 w-4" />}>{t('common.edit')}</Button>}
        </>}>
        {viewing && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <RequestStatusBadge status={viewing.status} />
              <span className="text-xs text-slate-400">{t('requests.requestDate')}: {formatDate(viewing.requestDate, true)}</span>
            </div>
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p><span className="text-slate-400">{t('common.product')}:</span> <span className="font-semibold">{td(viewing.productName)}</span></p>
              <p><span className="text-slate-400">{t('common.sku')}:</span> <span className="font-semibold">{viewing.sku}</span></p>
              <p><span className="text-slate-400">{t('common.size')}:</span> <span className="font-semibold">{viewing.size}</span></p>
              <p><span className="text-slate-400">{t('common.color')}:</span> <span className="font-semibold">{td(viewing.color)}</span></p>
              <p><span className="text-slate-400">{t('requests.customerName')}:</span> <span className="font-semibold">{viewing.customer.name}</span></p>
              <p><span className="text-slate-400">{t('requests.customerPhone')}:</span> <span className="font-semibold">{viewing.customer.phone}</span></p>
              <p><span className="text-slate-400">{t('common.email')}:</span> <span className="font-semibold">{viewing.email || '—'}</span></p>
              {viewing.email && <p><span className="text-slate-400">{t('requests.emailLanguage')}:</span> <span className="font-semibold">{viewing.emailLanguage === 'ru' ? 'Русский' : 'English'}</span></p>}
              <p><span className="text-slate-400">{t('requests.requestSource')}:</span> <span className="font-semibold">{t(`source.${viewing.source}` as TranslationKey)}</span></p>
              <p><span className="text-slate-400">{t('common.employee')}:</span> <span className="font-semibold">{viewing.employee?.name ?? '—'}</span></p>
              {viewing.notes && <p className="sm:col-span-2"><span className="text-slate-400">{t('common.notes')}:</span> {viewing.notes}</p>}
            </div>
            {viewing.matches && viewing.matches.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500"><Link2 className="h-3.5 w-3.5" />{t('requests.matchedArrivals')}</p>
                <div className="space-y-1.5">
                  {viewing.matches.map((match) => (
                    <p key={match.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {match.arrivalItem.arrival.arrivalNumber} · {formatDate(match.arrivalItem.arrival.arrivalDate)}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t('common.contact')}</p>
              <div className="mb-3 flex gap-2">
                <a href={phoneHref(viewing.customer.phone)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Phone className="h-3.5 w-3.5" />{t('common.call')}</a>
                <a href={whatsappHref(viewing.customer.phone, `${viewing.productName} · ${viewing.size}/${viewing.color}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{t('common.whatsapp')}</a>
              </div>
              <ContactActions request={viewing} onChanged={onChanged} />
              <p className="mt-3 text-[11px] text-slate-400">{t('requests.purchaseHint')}</p>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title={t('common.delete')} subtitle={deleting?.requestNumber} footer={<>
        <Button onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
      </>}>
        <p className="text-sm text-slate-600">{t('requests.deleteConfirm')}</p>
      </Modal>
    </div>
  );
}

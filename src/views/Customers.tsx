import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ClipboardList, Eye, MessageCircle, Pencil, Phone, Plus, ShoppingBag, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import {
  Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, TableWrap, Textarea,
} from '../components/ui';
import { CustomerStatusBadge, RequestStatusBadge } from '../components/Badges';
import { phoneHref, whatsappHref } from '../lib/utils';
import { toast } from '../store/toast';
import type { Customer, CustomerRequest, Sale } from '../lib/types';

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  status: 'ACTIVE' | 'VIP' | 'INACTIVE';
  notes: string;
}

const emptyForm = (): CustomerForm => ({ name: '', phone: '', email: '', status: 'ACTIVE', notes: '' });
const customerStatuses = ['ACTIVE', 'VIP', 'INACTIVE'] as const;

export function Customers() {
  const { t, td, formatDate: formatI18nDate, formatMoney: formatI18nMoney, error: translateError } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ customers: Customer[] }>('/customers');
      setCustomers(data.customers);
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setLoading(false);
    }
  }, [translateError]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email ?? ''].some((value) => value.toLowerCase().includes(q)),
    );
  }, [customers, search]);

  function openForm(customer?: Customer) {
    setEditing(customer ?? null);
    setForm(customer ? {
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      status: customer.status,
      notes: customer.notes ?? '',
    } : emptyForm());
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/customers/${editing.id}`, form);
      } else {
        await api.post('/customers', form);
      }
      toast.success(t('common.saved'));
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setSaving(false);
    }
  }

  const profileRequests: CustomerRequest[] = viewing?.requests ?? [];
  const profileSales: Sale[] = viewing?.sales ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.customers')}
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm()}>{t('customers.addCustomer')}</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('customers.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-slate-500">{t('customers.demoHint')}</p>
      </div>

      <Card className="overflow-hidden">
        <TableWrap>
          <Table headers={[
            t('common.customer'),
            t('common.phone'),
            t('common.status'),
            t('customers.totalRequests'),
            t('customers.lastRequest'),
            t('customers.spent'),
            t('customers.purchases'),
            t('common.actions'),
          ]}>
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-500">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-0">
                <EmptyState icon={<Users className="h-6 w-6" />} title={t('customers.noCustomers')} description={t('customers.noCustomersSub')} />
              </td></tr>
            ) : filtered.map((customer) => (
              <tr key={customer.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={customer.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{customer.name}</p>
                      <p className="truncate text-xs text-slate-400">{customer.email || t('common.notes')}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{customer.phone}</td>
                <td className="px-4 py-3"><CustomerStatusBadge status={customer.status} /></td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-800">{customer.totalRequests ?? 0}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{formatI18nDate(customer.lastRequestDate)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-800">{formatI18nMoney(customer.totalSpent ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{customer.purchases ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setViewing(customer)}>{t('common.view')}</Button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openForm(customer)}>{t('common.edit')}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </TableWrap>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('customers.addCustomer')}
        subtitle={t('customers.phoneHint')}
        footer={<>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="customer-form" variant="primary" disabled={saving}>{t('common.save')}</Button>
        </>}
      >
        <form id="customer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.name')} className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('common.phone')}>
            <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={`${t('common.email')} (${t('common.optional')})`}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t('common.status')}>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CustomerForm['status'] })}>
              {customerStatuses.map((status) => <option key={status} value={status}>{t(`customerStatus.${status}`)}</option>)}
            </Select>
          </Field>
          <Field label={`${t('common.notes')} (${t('common.optional')})`} className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        subtitle={`${viewing?.phone ?? ''}${viewing?.email ? ` · ${viewing.email}` : ''}`}
        wide
      >
        {viewing && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: t('customers.totalRequests'), value: viewing.totalRequests ?? 0, icon: ClipboardList },
                { label: t('customers.purchases'), value: viewing.purchases ?? 0, icon: ShoppingBag },
                { label: t('customers.spent'), value: formatI18nMoney(viewing.totalSpent ?? 0), icon: ShoppingBag },
                { label: t('common.status'), value: t(`customerStatus.${viewing.status}`), icon: Users },
              ].map((item) => (
                <Card key={item.label} className="p-4">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{item.value}</p>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={phoneHref(viewing.phone)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">
                <Phone className="h-4 w-4" />{t('common.call')}
              </a>
              <a href={whatsappHref(viewing.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100">
                <MessageCircle className="h-4 w-4" />{t('common.whatsapp')}
              </a>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">{t('customers.requestedProducts')}</h3>
              <div className="flex flex-wrap gap-2">
                {(viewing.requestedProducts ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400">{t('common.noData')}</p>
                ) : viewing.requestedProducts!.map((name) => (
                  <span key={name} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{td(name)}</span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">{t('requests.title')}</h3>
              <div className="space-y-2">
                {profileRequests.length === 0 ? <p className="text-sm text-slate-400">{t('common.noData')}</p> : profileRequests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{td(request.productName)} · {request.size} / {td(request.color)}</p>
                      <p className="text-xs text-slate-400">{formatI18nDate(request.requestDate, true)} · {request.sku}</p>
                    </div>
                    <RequestStatusBadge status={request.status} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800">{t('customers.purchaseHistory')}</h3>
              <div className="space-y-2">
                {profileSales.length === 0 ? <p className="text-sm text-slate-400">{t('common.noData')}</p> : profileSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                    <p className="text-sm text-slate-700">{formatI18nDate(sale.soldAt)} · {sale.quantity} {t('common.pcs')}</p>
                    <p className="text-sm font-bold text-slate-900">{formatI18nMoney(sale.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

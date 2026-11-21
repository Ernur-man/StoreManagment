import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardList, Clock3, PackageCheck,
  PhoneCall, RefreshCw, ShoppingCart, Sparkles, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { Card, EmptyState, PageHeader, Table, TableWrap, Button } from '../components/ui';
import { RequestStatusBadge } from '../components/Badges';
import { ContactActions } from '../components/ContactActions';
import { chartColors, cn, formatRelative } from '../lib/utils';
import { toast } from '../store/toast';
import { useAuthStore } from '../store/auth';
import type { CustomerRequest, DashboardData, RequestStatus } from '../lib/types';

function StatCard({ icon, label, value, foot, tone }: { icon: ReactNode; label: string; value: number; foot: string; tone: string }) {
  return (
    <Card className="card-hover p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tone)}>{icon}</span>
      </div>
      <p className="mt-3 text-[28px] font-extrabold leading-none tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-[11px] text-slate-400">{foot}</p>
    </Card>
  );
}

export function Dashboard() {
  const { t, td, formatDate, language, error: translateError } = useI18n();
  const user = useAuthStore((state) => state.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await api.get<DashboardData>('/dashboard'));
    } catch (err) {
      toast.error(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }, [translateError]);

  useEffect(() => { void load(); }, [load]);

  function onRequestChanged(updated: CustomerRequest) {
    setData((current) => current ? {
      ...current,
      availableForContact: current.availableForContact.filter((r) => r.id !== updated.id),
      recentlyAvailable: current.recentlyAvailable.filter((r) => r.id !== updated.id),
      recentRequests: current.recentRequests.map((r) => (r.id === updated.id ? updated : r)),
    } : current);
  }

  if (!data) return <div className="py-16 text-center text-sm text-slate-500">{t('common.loading')}</div>;
  const stats = data.stats;

  const cards = [
    { label: t('dashboard.totalProducts'), value: stats.totalProducts, foot: t('dashboard.footProducts'), icon: <Boxes className="h-4 w-4" />, tone: 'bg-indigo-50 text-indigo-600' },
    { label: t('dashboard.productsInStock'), value: stats.inStock, foot: t('availability.IN_STOCK'), icon: <PackageCheck className="h-4 w-4" />, tone: 'bg-emerald-50 text-emerald-600' },
    { label: t('dashboard.outOfStock'), value: stats.outOfStock, foot: t('availability.OUT_OF_STOCK'), icon: <AlertTriangle className="h-4 w-4" />, tone: 'bg-red-50 text-red-600' },
    { label: t('dashboard.totalRequests'), value: stats.totalRequests, foot: t('dashboard.footRequests'), icon: <ClipboardList className="h-4 w-4" />, tone: 'bg-indigo-50 text-indigo-600' },
    { label: t('dashboard.waitingStock'), value: stats.waiting, foot: t('dashboard.footWaiting'), icon: <Clock3 className="h-4 w-4" />, tone: 'bg-amber-50 text-amber-600' },
    { label: t('dashboard.availableCustomers'), value: stats.available, foot: t('dashboard.footAvailable'), icon: <CheckCircle2 className="h-4 w-4" />, tone: 'bg-emerald-50 text-emerald-600' },
    { label: t('dashboard.customersToContact'), value: stats.toContact, foot: t('dashboard.readyFollowUpSub'), icon: <PhoneCall className="h-4 w-4" />, tone: 'bg-sky-50 text-sky-600' },
    { label: t('dashboard.completedSales'), value: stats.completedSales, foot: t('dashboard.footSales'), icon: <ShoppingCart className="h-4 w-4" />, tone: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.dashboard')}
        title={`${t('dashboard.greeting')}, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={t('dashboard.subtitle')}
        actions={
          <Button onClick={load} disabled={busy} icon={<RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h2 className="font-bold text-slate-900">{t('dashboard.demandChart')}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{t('dashboard.demandChartSub')}</p>
            </div>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="h-64 px-2 pb-4 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.demandTrend} margin={{ top: 5, right: 14, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value).replace(/ \d{4}$/, '')} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(value) => formatDate(String(value))} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="requests" name={t('analytics.totalRequests')} stroke="#4f46e5" strokeWidth={2.5} fill="url(#demandGradient)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="px-5 pt-5"><h2 className="font-bold text-slate-900">{t('dashboard.mostRequested')}</h2><p className="mt-0.5 text-xs text-slate-500">{t('analytics.subtitle')}</p></div>
          <div className="h-64 px-2 pb-4 pt-5">
            {data.topProducts.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProducts.map((item) => ({ ...item, name: td(item.name) }))} layout="vertical" margin={{ left: 8, right: 20, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f6" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="value" name={t('analytics.totalRequests')} fill="#6366f1" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-5 border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-indigo-500" />{t('dashboard.readyFollowUp')}
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{data.availableForContact.length}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{t('dashboard.readyFollowUpSub')}</p>
          </div>
          <Link to="/requests" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t('common.viewAll')}<ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="p-5 pt-3">
          {data.availableForContact.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title={t('dashboard.allCaughtUp')} description={t('dashboard.allCaughtUpSub')} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.availableForContact.slice(0, 6).map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{td(request.productName)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{t('common.size')}: {request.size} · {t('common.color')}: {td(request.color)}</p>
                    </div>
                    <RequestStatusBadge status={request.status} />
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-semibold text-slate-700">{request.customer.name}</p>
                    <p className="text-slate-500">{request.customer.phone} · SKU {request.sku}</p>
                    {request.availableAt && <p className="mt-1 text-[10px] text-slate-400">{formatRelative(request.availableAt, language)}</p>}
                  </div>
                  <div className="mt-3"><ContactActions request={request} onChanged={onRequestChanged} compact /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-bold text-slate-900">{t('dashboard.recentRequests')}</h2>
            <Link to="/requests" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t('common.viewAll')}</Link>
          </div>
          <div className="pt-3">
            <TableWrap>
              <Table headers={[t('common.product'), t('common.customer'), t('common.status'), t('common.date')]}>
                {data.recentRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{td(request.productName)}</p><p className="text-[11px] text-slate-400">{request.sku} · {request.size}/{td(request.color)}</p></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{request.customer.name}</td>
                    <td className="px-4 py-3"><RequestStatusBadge status={request.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(request.requestDate)}</td>
                  </tr>
                ))}
              </Table>
            </TableWrap>
          </div>
        </Card>

        <Card>
          <div className="px-5 pt-5"><h2 className="font-bold text-slate-900">{t('dashboard.recentArrivals')}</h2><p className="mt-0.5 text-xs text-slate-500">{t('arrivals.subtitle')}</p></div>
          <div className="space-y-2 p-4">
            {data.recentArrivals.length === 0 ? <EmptyState title={t('arrivals.noArrivals')} description={t('arrivals.noArrivalsSub')} /> : data.recentArrivals.map((arrival) => (
              <Link key={arrival.id} to="/arrivals" className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 hover:border-indigo-200 hover:bg-indigo-50/30">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><PackageCheck className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{td(arrival.items[0]?.productName ?? '—')}</p>
                  <p className="text-[11px] text-slate-400">{arrival.arrivalNumber} · {formatDate(arrival.arrivalDate)}</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600">+{arrival.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-bold text-slate-900">{t('analytics.statusDistribution')}</h2></div>
        <div className="grid items-center gap-4 p-5 md:grid-cols-[280px_1fr]">
          <div className="h-56">
            {data.statusDistribution.length === 0 ? <EmptyState title={t('common.noData')} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.statusDistribution.map((s) => ({ ...s, name: t(`status.${s.name as RequestStatus}`) }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {data.statusDistribution.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.statusDistribution.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                <span className="flex-1 text-xs font-medium text-slate-600">{t(`status.${item.name as RequestStatus}`)}</span>
                <span className="text-sm font-bold text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
        <h3 className="font-bold text-slate-800">{t('dashboard.flowTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('dashboard.flowSub')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/requests"><Button variant="primary" size="sm">{t('requests.newRequest')}</Button></Link>
          <Link to="/arrivals"><Button size="sm">{t('arrivals.newArrival')}</Button></Link>
        </div>
      </div>
    </div>
  );
}


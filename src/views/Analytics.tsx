import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3, ClipboardList, Percent, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import { Button, Card, EmptyState, PageHeader, SectionTitle } from '../components/ui';
import { chartColors, isoDate } from '../lib/utils';
import { toast } from '../store/toast';
import type { AnalyticsData } from '../lib/types';

type RangeKey = '7' | '30' | '90' | 'all';

export function Analytics() {
  const { t, td, formatNumber, error: translateError } = useI18n();
  const [range, setRange] = useState<RangeKey>('30');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range !== 'all') {
        const days = Number(range);
        params.set('from', isoDate(new Date(Date.now() - days * 86_400_000)));
        params.set('to', isoDate(new Date()));
      }
      const query = params.toString();
      setData(await api.get<AnalyticsData>(`/dashboard/analytics${query ? `?${query}` : ''}`));
      setLoadError(null);
    } catch (err) {
      const message = translateError((err as Error).message);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [range, translateError]);

  useEffect(() => { void load(); }, [load]);

  const ranges = useMemo<Array<{ key: RangeKey; label: string }>>(() => [
    { key: '7', label: t('analytics.last7') },
    { key: '30', label: t('analytics.last30') },
    { key: '90', label: t('analytics.last90') },
    { key: 'all', label: t('analytics.allTime') },
  ], [t]);

  if (!data) {
    return loadError ? (
      <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
        <p className="text-sm text-red-700">{t('common.loadError')} {loadError}</p>
        <Button className="mt-4" onClick={() => void load()}>{t('common.retry')}</Button>
      </Card>
    ) : <div className="py-16 text-center text-sm text-slate-500">{loading ? t('common.loading') : t('analytics.noData')}</div>;
  }

  const summary = data.summary;
  const statusData = data.statusDistribution
    .filter((item) => item.value > 0)
    .map((item) => ({ ...item, name: t(`status.${item.name}` as TranslationKey) }));
  const sourceData = data.sources.map((item) => ({ ...item, name: t(`source.${item.name}` as TranslationKey) }));
  const trendData = data.demandTrend.map((item) => ({ ...item, date: item.date.slice(5) }));

  const cards = [
    { label: t('analytics.totalRequests'), value: formatNumber(summary.totalRequests), icon: ClipboardList, tone: 'bg-indigo-50 text-indigo-600' },
    { label: t('analytics.conversionRate'), value: `${summary.conversionRate}%`, icon: Percent, tone: 'bg-emerald-50 text-emerald-600' },
    { label: t('analytics.recoveredSales'), value: formatNumber(summary.recoveredSales), icon: ShoppingCart, tone: 'bg-violet-50 text-violet-600' },
    { label: t('analytics.revenue'), value: `${formatNumber(summary.revenue)} ₸`, icon: TrendingUp, tone: 'bg-sky-50 text-sky-600' },
    { label: t('analytics.uniqueCustomers'), value: formatNumber(data.uniqueCustomers), icon: Users, tone: 'bg-amber-50 text-amber-600' },
    { label: t('analytics.avgPerDay'), value: formatNumber(summary.avgRequestsPerDay), icon: BarChart3, tone: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.analytics')}
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        actions={
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            {ranges.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRange(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${range === item.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      {loading && <p className="mb-3 text-xs text-slate-400">{t('common.loading')}</p>}

      {summary.totalRequests === 0 ? (
        <Card><EmptyState icon={<BarChart3 className="h-6 w-6" />} title={t('analytics.noData')} /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <Card key={card.label} className="p-5">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.tone}`}><card.icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{card.value}</p>
              </Card>
            ))}
          </div>

          <Card>
            <SectionTitle title={t('analytics.demandTrend')} subtitle={t('dashboard.demandChartSub')} />
            <div className="h-72 px-3 pb-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Area type="monotone" dataKey="requests" name={t('analytics.totalRequests')} stroke="#4f46e5" strokeWidth={2} fill="url(#analyticsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle title={t('analytics.topProducts')} />
              <div className="h-72 px-3 pb-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProducts} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(value: string) => td(value)} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(value) => [String(value), t('analytics.totalRequests')]} />
                    <Bar dataKey="value" fill="#4f46e5" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <SectionTitle title={t('analytics.statusDistribution')} />
              <div className="flex h-72 flex-col items-center justify-center gap-2 sm:flex-row">
                <div className="h-56 w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {statusData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-2 px-4 sm:w-1/2 sm:flex-col">
                  {statusData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                      <span className="flex-1">{item.name}</span>
                      <span className="font-bold text-slate-800">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              { title: t('analytics.topSizes'), items: data.topSizes, translate: false },
              { title: t('analytics.topColors'), items: data.topColors, translate: true },
              { title: t('analytics.sources'), items: sourceData, translate: false },
            ].map((block) => (
              <Card key={block.title}>
                <SectionTitle title={block.title} />
                <div className="space-y-3 px-5 pb-5">
                  {block.items.length === 0 ? <p className="text-sm text-slate-400">{t('common.noData')}</p> : block.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-slate-600">{block.translate ? td(item.name) : item.name}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { prisma } from '../lib/prisma.js';
import { availabilityFor } from '../lib/constants.js';

type DateRange = { from?: Date; to?: Date };

function countBy(items: Array<{ key: string }>): Array<{ name: string; value: number }> {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.key, (map.get(item.key) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function demandTrend(dates: Date[], days: number) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const buckets: Array<{ date: string; requests: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({ date: dayKey(d), requests: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const date of dates) {
    const i = index.get(dayKey(date));
    if (i !== undefined) buckets[i].requests += 1;
  }
  return buckets;
}

export async function getDashboard(storeId: string) {
  const [products, variants, inventory, requests, arrivals, sales] = await Promise.all([
    prisma.product.count({ where: { storeId } }),
    prisma.productVariant.findMany({
      where: { storeId },
      include: { inventory: true, product: true },
    }),
    prisma.inventory.findMany({ where: { storeId } }),
    prisma.customerRequest.findMany({
      where: { storeId },
      include: { customer: true, employee: { select: { name: true } }, matches: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockArrival.findMany({
      where: { storeId },
      include: { items: { include: { matches: true, variant: { include: { product: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.sale.findMany({ where: { storeId } }),
  ]);

  const statusCount = (status: string) => requests.filter((r) => r.status === status).length;
  const quantities = new Map(inventory.map((i) => [i.variantId, i.quantity]));
  const availability = variants.map((v) => {
    const quantity = quantities.get(v.id) ?? 0;
    return { ...v, quantity, status: availabilityFor(quantity, v.lowStockThreshold) };
  });

  const availableForContact = requests
    .filter((r) => r.status === 'AVAILABLE')
    .sort((a, b) => (b.availableAt?.getTime() ?? 0) - (a.availableAt?.getTime() ?? 0));

  return {
    stats: {
      totalProducts: products,
      totalVariants: variants.length,
      inStock: availability.filter((v) => v.status === 'IN_STOCK').length,
      lowStock: availability.filter((v) => v.status === 'LOW_STOCK').length,
      outOfStock: availability.filter((v) => v.status === 'OUT_OF_STOCK').length,
      totalRequests: requests.length,
      waiting: statusCount('WAITING'),
      available: statusCount('AVAILABLE'),
      contacted: statusCount('CONTACTED'),
      reserved: statusCount('RESERVED'),
      completedSales: statusCount('PURCHASED'),
      cancelled: statusCount('CANCELLED'),
      toContact: statusCount('AVAILABLE'),
      revenue: sales.reduce((sum, s) => sum + s.amount, 0),
      inventoryValue: availability.reduce((sum, v) => sum + v.quantity * v.price, 0),
    },
    demandTrend: demandTrend(
      requests.map((r) => r.requestDate),
      14,
    ),
    topProducts: countBy(requests.map((r) => ({ key: r.productName }))).slice(0, 6),
    statusDistribution: [
      { name: 'WAITING', value: statusCount('WAITING') },
      { name: 'AVAILABLE', value: statusCount('AVAILABLE') },
      { name: 'CONTACTED', value: statusCount('CONTACTED') },
      { name: 'RESERVED', value: statusCount('RESERVED') },
      { name: 'PURCHASED', value: statusCount('PURCHASED') },
      { name: 'CANCELLED', value: statusCount('CANCELLED') },
    ].filter((s) => s.value > 0),
    recentRequests: requests.slice(0, 6),
    recentArrivals: arrivals,
    availableForContact,
    recentlyAvailable: availableForContact.slice(0, 5),
  };
}

export async function getAnalytics(storeId: string, range: DateRange = {}) {
  const [requests, sales, variants, inventory] = await Promise.all([
    prisma.customerRequest.findMany({
      where: {
        storeId,
        ...(range.from || range.to
          ? { requestDate: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      include: { customer: true },
      orderBy: { requestDate: 'desc' },
    }),
    prisma.sale.findMany({
      where: {
        storeId,
        ...(range.from || range.to
          ? { soldAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
    }),
    prisma.productVariant.findMany({ where: { storeId }, include: { product: true } }),
    prisma.inventory.findMany({ where: { storeId } }),
  ]);

  const statusCount = (status: string) => requests.filter((r) => r.status === status).length;
  const purchased = statusCount('PURCHASED');
  const cancelled = statusCount('CANCELLED');
  const denominator = requests.length - cancelled;

  const quantities = new Map(inventory.map((i) => [i.variantId, i.quantity]));
  const stockByVariant = variants.map((v) => ({
    id: v.id,
    quantity: quantities.get(v.id) ?? 0,
    threshold: v.lowStockThreshold,
  }));

  const spanDays = Math.max(
    1,
    Math.ceil(
      ((range.to ?? new Date()).getTime() - (range.from ?? new Date(0)).getTime()) / 86_400_000,
    ),
  );

  return {
    summary: {
      totalRequests: requests.length,
      waiting: statusCount('WAITING'),
      available: statusCount('AVAILABLE'),
      contacted: statusCount('CONTACTED'),
      reserved: statusCount('RESERVED'),
      purchased,
      cancelled,
      recoveredSales: purchased,
      revenue: Math.round(sales.reduce((sum, s) => sum + s.amount, 0) * 100) / 100,
      conversionRate: denominator > 0 ? Math.round((purchased / denominator) * 1000) / 10 : 0,
      lowStockVariants: stockByVariant.filter((v) => v.quantity > 0 && v.quantity <= v.threshold).length,
      outOfStockVariants: stockByVariant.filter((v) => v.quantity <= 0).length,
      avgRequestsPerDay: requests.length > 0 ? Math.round((requests.length / spanDays) * 10) / 10 : 0,
    },
    demandTrend: demandTrend(requests.map((r) => r.requestDate), spanDays > 60 ? 12 : Math.min(spanDays, 30)),
    topProducts: countBy(requests.map((r) => ({ key: r.productName }))).slice(0, 10),
    topSizes: countBy(requests.map((r) => ({ key: r.size }))).slice(0, 10),
    topColors: countBy(requests.map((r) => ({ key: r.color }))).slice(0, 10),
    frequentlyUnavailable: countBy(
      requests
        .filter((r) => r.status === 'WAITING' || r.status === 'CANCELLED')
        .map((r) => ({ key: r.productName })),
    ).slice(0, 8),
    statusDistribution: [
      { name: 'WAITING', value: statusCount('WAITING') },
      { name: 'AVAILABLE', value: statusCount('AVAILABLE') },
      { name: 'CONTACTED', value: statusCount('CONTACTED') },
      { name: 'RESERVED', value: statusCount('RESERVED') },
      { name: 'PURCHASED', value: statusCount('PURCHASED') },
      { name: 'CANCELLED', value: statusCount('CANCELLED') },
    ],
    sources: countBy(requests.map((r) => ({ key: r.source }))),
    uniqueCustomers: new Set(requests.map((r) => r.customerId)).size,
  };
}

export function parseRange(from?: unknown, to?: unknown): DateRange {
  const result: DateRange = {};
  if (typeof from === 'string' && from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) result.from = d;
  }
  if (typeof to === 'string' && to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      result.to = d;
    }
  }
  return result;
}

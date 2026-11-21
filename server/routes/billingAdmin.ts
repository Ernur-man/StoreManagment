import { Router } from '../lib/router.js';
import { writeAudit } from '../lib/audit.js';
import { requirePermission } from '../lib/auth.js';
import { SUBSCRIPTION_DURATION_DAYS, SUBSCRIPTION_PLAN_CODE } from '../lib/constants.js';
import { asyncRoute } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { addDays, subscriptionView } from '../lib/subscription.js';
import { adminGrantSchema, adminSubscriptionStatusSchema } from '../lib/validation.js';

/** All admin billing endpoints are behind `billing:admin` (ADMIN has `*`). */
export const adminBillingRouter = new Router();
adminBillingRouter.use(requirePermission('billing:admin'));

const subscriptionInclude = {
  user: { select: { id: true, name: true, email: true, role: true } },
  plan: { select: { id: true, code: true, name: true, priceKzt: true, currency: true, durationDays: true } },
} as const;

interface SubscriptionForPresentation {
  id: string;
  status: string;
  startedAt: Date | null;
  expiresAt: Date | null;
  nextPaymentAt: Date | null;
  cancelledAt: Date | null;
  lastPaymentAt: Date | null;
  provider: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string; role: string };
  plan: { id: string; code: string; name: string; priceKzt: number; currency: string; durationDays: number };
}

function presentSubscription(subscription: SubscriptionForPresentation) {
  const view = subscriptionView(subscription);
  return {
    ...subscription,
    status: view.status,
    storedStatus: view.storedStatus,
    hasAccess: view.hasAccess,
    nextPaymentAtComputed: view.nextPaymentAt,
  };
}

adminBillingRouter.get(
  '/overview',
  asyncRoute(async (req, res) => {
    const storeId = req.authUser!.storeId;
    const subscriptions = await prisma.subscription.findMany({
      where: { storeId },
      include: subscriptionInclude,
      orderBy: { createdAt: 'desc' },
    });
    const views = subscriptions.map(presentSubscription);
    const count = (status: string) => views.filter((item) => item.status === status).length;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenue = await prisma.paymentTransaction.aggregate({
      where: { storeId, status: 'succeeded', completedAt: { gte: monthStart } },
      _sum: { amountKzt: true },
      _count: true,
    });
    res.json({
      stats: {
        totalSubscribers: views.length,
        active: count('active'),
        expired: count('expired'),
        pending: count('pending'),
        pastDue: count('past_due'),
        cancelled: count('cancelled'),
        inactive: count('inactive'),
        monthlyRevenueKzt: revenue._sum.amountKzt ?? 0,
        successfulPayments: revenue._count,
      },
      subscriptions: views.slice(0, 20),
    });
  }),
);

adminBillingRouter.get(
  '/subscriptions',
  asyncRoute(async (req, res) => {
    const { search, status } = req.query as Record<string, string | undefined>;
    const subscriptions = await prisma.subscription.findMany({
      where: { storeId: req.authUser!.storeId },
      include: subscriptionInclude,
      orderBy: { createdAt: 'desc' },
    });
    const q = search?.trim().toLowerCase();
    const views = subscriptions
      .map(presentSubscription)
      .filter((item) => !status || status === 'ALL' || item.status === status)
      .filter((item) => !q || [item.user.name, item.user.email, item.id, item.plan.name].some((value) => value.toLowerCase().includes(q)));
    res.json({ subscriptions: views });
  }),
);

adminBillingRouter.get(
  '/subscriptions/:id',
  asyncRoute(async (req, res) => {
    const subscription = await prisma.subscription.findFirst({
      where: { id: req.params.id, storeId: req.authUser!.storeId },
      include: {
        ...subscriptionInclude,
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            provider: true,
            amountKzt: true,
            currency: true,
            status: true,
            failureReason: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
    if (!subscription) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    res.json({ subscription: presentSubscription(subscription) });
  }),
);

adminBillingRouter.patch(
  '/subscriptions/:id',
  asyncRoute(async (req, res) => {
    const input = adminSubscriptionStatusSchema.parse(req.body);
    const auth = req.authUser!;
    const existing = await prisma.subscription.findFirst({
      where: { id: req.params.id, storeId: auth.storeId },
      include: subscriptionInclude,
    });
    if (!existing) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    let expiresAt = input.expiresAt;
    let startedAt = input.startedAt;
    if (expiresAt === undefined && input.status === 'active') {
      expiresAt = addDays(existing.expiresAt && existing.expiresAt > new Date() ? existing.expiresAt : new Date(), SUBSCRIPTION_DURATION_DAYS);
    }
    if (startedAt === undefined && input.status === 'active' && !existing.startedAt) startedAt = new Date();
    const updated = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        expiresAt,
        startedAt,
        nextPaymentAt: input.status === 'active' ? expiresAt : null,
        cancelledAt: input.status === 'cancelled' ? (existing.cancelledAt ?? new Date()) : null,
      },
      include: subscriptionInclude,
    });
    await writeAudit(prisma, auth, 'SUBSCRIPTION_STATUS_CHANGED', 'SUBSCRIPTION', updated.id, {
      from: existing.status,
      to: input.status,
      expiresAt,
      reason: input.reason,
    });
    res.json({ subscription: presentSubscription(updated) });
  }),
);

/** Administrator manually grants or repairs a subscription record. */
adminBillingRouter.post(
  '/subscriptions',
  asyncRoute(async (req, res) => {
    const input = adminGrantSchema.parse(req.body);
    const auth = req.authUser!;
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: SUBSCRIPTION_PLAN_CODE } });
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.storeId !== auth.storeId) {
      res.status(404).json({ message: 'errors.notFound' });
      return;
    }
    const now = new Date();
    const expiresAt = input.status === 'active' ? addDays(now, input.durationDays) : null;
    const subscription = await prisma.subscription.upsert({
      where: { storeId_userId_planId: { storeId: auth.storeId, userId: user.id, planId: plan.id } },
      create: {
        storeId: auth.storeId,
        userId: user.id,
        planId: plan.id,
        status: input.status,
        provider: 'admin',
        startedAt: input.status === 'active' ? now : null,
        expiresAt,
        nextPaymentAt: expiresAt,
      },
      update: {
        status: input.status,
        provider: 'admin',
        startedAt: input.status === 'active' ? now : null,
        expiresAt,
        nextPaymentAt: expiresAt,
        cancelledAt: input.status === 'cancelled' ? now : null,
      },
      include: subscriptionInclude,
    });
    await writeAudit(prisma, auth, 'SUBSCRIPTION_GRANTED', 'SUBSCRIPTION', subscription.id, {
      userId: user.id,
      status: input.status,
      durationDays: input.durationDays,
    });
    res.json({ subscription: presentSubscription(subscription) });
  }),
);

adminBillingRouter.get(
  '/payments',
  asyncRoute(async (req, res) => {
    const payments = await prisma.paymentTransaction.findMany({
      where: { storeId: req.authUser!.storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        provider: true,
        amountKzt: true,
        currency: true,
        status: true,
        failureReason: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true } },
        subscription: { select: { id: true } },
      },
    });
    res.json({ payments });
  }),
);

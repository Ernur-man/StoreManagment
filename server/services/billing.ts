import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../lib/auth.js';
import {
  SUBSCRIPTION_DURATION_DAYS,
  SUBSCRIPTION_PLAN_CODE,
  type PaymentProviderName,
} from '../lib/constants.js';
import { addDays, subscriptionView } from '../lib/subscription.js';
import { prisma } from '../lib/prisma.js';
import {
  PaymentConfigurationError,
  PaymentVerificationError,
  configuredProvider,
  createCheckout,
  resolveAppOrigin,
  type AppOriginRequest,
  type NormalizedPaymentEvent,
} from './payments.js';

export async function getPlan() {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: SUBSCRIPTION_PLAN_CODE } });
  if (!plan) throw new PaymentConfigurationError('Subscription plan has not been seeded');
  return plan;
}

export async function getSubscriptionForUser(user: AuthUser) {
  return prisma.subscription.findFirst({
    where: { storeId: user.storeId, userId: user.id },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function subscriptionResponse(user: AuthUser) {
  const subscription = await getSubscriptionForUser(user);
  const payments = subscription
    ? await prisma.paymentTransaction.findMany({
        where: { subscriptionId: subscription.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
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
      })
    : [];
  const plan = subscription?.plan ?? (await getPlan());
  return {
    // Everything returned here is a labelled demo simulation when the demo
    // adapter is configured; no value in this response is a bank confirmation.
    demo: configuredProvider() === 'demo',
    // The database stores features as JSON; the UI needs the parsed array.
    plan: { ...plan, features: JSON.parse(plan.features) as string[] },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscriptionView(subscription).status,
          storedStatus: subscription.status,
          hasAccess: subscriptionView(subscription).hasAccess,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,
          nextPaymentAt: subscriptionView(subscription).nextPaymentAt,
          cancelledAt: subscription.cancelledAt,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          provider: subscription.provider,
        }
      : null,
    view: subscriptionView(subscription),
    payments: payments.map((payment) => ({ ...payment, demo: payment.provider === 'demo' })),
  };
}

async function ensureSubscription(user: AuthUser, planId: string) {
  return prisma.subscription.upsert({
    where: { storeId_userId_planId: { storeId: user.storeId, userId: user.id, planId } },
    create: { storeId: user.storeId, userId: user.id, planId, status: 'inactive' },
    update: {},
  });
}

function sameCheckoutOrigin(url: string, origin: string | null): boolean {
  if (!origin) return true;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

async function requestProviderCheckout(
  transaction: {
    id: string;
    idempotencyKey: string;
    amountKzt: number;
    subscriptionId: string;
  },
  user: AuthUser,
  provider: PaymentProviderName,
  request?: AppOriginRequest,
) {
  try {
    const result = await createCheckout(
      provider,
      {
        transactionId: transaction.id,
        idempotencyKey: transaction.idempotencyKey,
        amountKzt: transaction.amountKzt,
        storeId: user.storeId,
        userId: user.id,
      },
      request,
    );
    const updated = await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { providerPaymentId: result.providerPaymentId, checkoutUrl: result.checkoutUrl },
    });
    const subscription = await prisma.subscription.findUnique({ where: { id: transaction.subscriptionId } });
    if (subscription && ['inactive', 'expired', 'past_due'].includes(subscription.status)) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'pending' } });
    }
    return { transaction: updated, checkoutUrl: result.checkoutUrl };
  } catch (error) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'failed',
        failureReason: error instanceof Error ? error.message.slice(0, 300) : 'checkout failed',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/** Creates a pending transaction and asks the provider for a hosted checkout page. */
export async function startCheckout(user: AuthUser, provider: PaymentProviderName, request?: AppOriginRequest) {
  const plan = await getPlan();
  if (!plan.isActive) throw new PaymentConfigurationError('This plan is not currently available');

  const origin = resolveAppOrigin(request);

  // Double-click protection: reuse a fresh pending checkout instead of opening
  // a second provider session for the same user. A URL from an older origin is
  // regenerated in place so stale Vite links are never returned.
  const recent = await prisma.paymentTransaction.findFirst({
    where: {
      storeId: user.storeId,
      userId: user.id,
      provider,
      status: 'pending',
      createdAt: { gte: new Date(Date.now() - 120_000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recent?.checkoutUrl && sameCheckoutOrigin(recent.checkoutUrl, origin)) {
    return { transaction: recent, checkoutUrl: recent.checkoutUrl };
  }
  if (recent?.checkoutUrl) {
    return requestProviderCheckout(recent, user, provider, request);
  }

  const subscription = await ensureSubscription(user, plan.id);
  const idempotencyKey = randomUUID();
  const transaction = await prisma.paymentTransaction.create({
    data: {
      storeId: user.storeId,
      userId: user.id,
      planId: plan.id,
      subscriptionId: subscription.id,
      provider,
      idempotencyKey,
      amountKzt: plan.priceKzt,
      currency: plan.currency,
      status: 'pending',
    },
  });

  return requestProviderCheckout(transaction, user, provider, request);
}

export interface ApplyResult {
  duplicate: boolean;
  applied: boolean;
  reason?: string;
}

/**
 * Applies a verified, normalized provider event exactly once. The PaymentEvent
 * unique key is the idempotency guard; the transaction status guard protects
 * against two different events for the same payment.
 */
export async function applyPaymentEvent(event: NormalizedPaymentEvent): Promise<ApplyResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const seen = await tx.paymentEvent.findUnique({
        where: { provider_eventId: { provider: event.provider, eventId: event.eventId } },
      });
      if (seen) return { duplicate: true, applied: false, reason: 'event already processed' };

      const transaction = event.transactionId
        ? await tx.paymentTransaction.findUnique({ where: { id: event.transactionId } })
        : event.providerPaymentId
          ? await tx.paymentTransaction.findUnique({ where: { providerPaymentId: event.providerPaymentId } })
          : null;

      if (!transaction) return { duplicate: false, applied: false, reason: 'transaction not found' };
      if (transaction.provider !== event.provider) return { duplicate: false, applied: false, reason: 'provider mismatch' };
      if (event.providerPaymentId && transaction.providerPaymentId && transaction.providerPaymentId !== event.providerPaymentId) {
        return { duplicate: false, applied: false, reason: 'payment id mismatch' };
      }
      if (transaction.status !== 'pending') {
        return { duplicate: false, applied: false, reason: 'payment already finalized' };
      }

      const now = new Date();
      const subscription = await tx.subscription.findUniqueOrThrow({ where: { id: transaction.subscriptionId } });
      const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: transaction.planId } });
      if (transaction.amountKzt !== plan.priceKzt || transaction.currency !== plan.currency) {
        return { duplicate: false, applied: false, reason: 'amount or currency mismatch' };
      }
      if (event.amountMinor !== undefined && event.amountMinor !== plan.priceKzt * 100) {
        return { duplicate: false, applied: false, reason: 'provider amount mismatch' };
      }
      if (event.currency && event.currency.toLowerCase() !== plan.currency.toLowerCase()) {
        return { duplicate: false, applied: false, reason: 'provider currency mismatch' };
      }

      // Unique(provider,eventId) makes duplicate delivery harmless even when
      // two transactions both read the pending payment concurrently.
      await tx.paymentEvent.create({
        data: {
          provider: event.provider,
          eventId: event.eventId,
          type: event.type,
          transactionId: transaction.id,
        },
      });

      if (event.type === 'payment.succeeded') {
        const finalized = await tx.paymentTransaction.updateMany({
          where: { id: transaction.id, status: 'pending' },
          data: { status: 'succeeded', completedAt: now },
        });
        if (finalized.count !== 1) return { duplicate: false, applied: false, reason: 'payment already finalized' };
        // Renewing before expiry extends the paid period instead of resetting it.
        const periodStart = subscription.expiresAt && subscription.expiresAt > now ? subscription.expiresAt : now;
        const expiresAt = addDays(periodStart, plan.durationDays || SUBSCRIPTION_DURATION_DAYS);
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'active',
            provider: event.provider,
            startedAt: subscription.startedAt ?? now,
            expiresAt,
            nextPaymentAt: expiresAt,
            cancelledAt: null,
            lastPaymentAt: now,
          },
        });
        return { duplicate: false, applied: true };
      }

      if (event.type === 'payment.failed') {
        const finalized = await tx.paymentTransaction.updateMany({
          where: { id: transaction.id, status: 'pending' },
          data: { status: 'failed', failureReason: event.reason?.slice(0, 300) ?? 'Payment failed', completedAt: now },
        });
        if (finalized.count !== 1) return { duplicate: false, applied: false, reason: 'payment already finalized' };
        // A failed renewal must not revoke a period that was already paid for.
        const paidPeriodActive = subscription.status === 'active' && !!subscription.expiresAt && subscription.expiresAt > now;
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: paidPeriodActive ? 'active' : 'past_due',
            ...(paidPeriodActive ? {} : { nextPaymentAt: null }),
          },
        });
        return { duplicate: false, applied: true };
      }

      if (event.type === 'payment.cancelled') {
        const finalized = await tx.paymentTransaction.updateMany({
          where: { id: transaction.id, status: 'pending' },
          data: { status: 'cancelled', completedAt: now },
        });
        if (finalized.count !== 1) return { duplicate: false, applied: false, reason: 'payment already finalized' };
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'cancelled', cancelledAt: now, nextPaymentAt: null },
        });
        return { duplicate: false, applied: true };
      }

      // A pending event is only recorded; no access decision changes.
      return { duplicate: false, applied: false, reason: 'pending event recorded' };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { duplicate: true, applied: false, reason: 'event already processed' };
    }
    throw error;
  }
}

/** Demo checkout confirmation. The token is server-signed; the outcome is the only client input. */
export async function confirmDemoPayment(
  user: AuthUser,
  input: { transactionId: string; providerPaymentId: string; idempotencyKey: string; amountKzt: number },
  outcome: 'success' | 'failure' | 'cancel',
) {
  const transaction = await prisma.paymentTransaction.findUnique({ where: { id: input.transactionId } });
  if (
    !transaction ||
    transaction.storeId !== user.storeId ||
    transaction.userId !== user.id ||
    transaction.provider !== 'demo' ||
    transaction.idempotencyKey !== input.idempotencyKey ||
    transaction.providerPaymentId !== input.providerPaymentId ||
    transaction.amountKzt !== input.amountKzt
  ) {
    throw new PaymentVerificationError('Invalid demo checkout');
  }
  if (transaction.status !== 'pending') {
    return { result: { duplicate: true, applied: false } as ApplyResult, transaction };
  }
  const type = outcome === 'success' ? 'payment.succeeded' : outcome === 'failure' ? 'payment.failed' : 'payment.cancelled';
  const event: NormalizedPaymentEvent = {
    provider: 'demo',
    eventId: `demo_${transaction.id}_${outcome}`,
    type,
    transactionId: transaction.id,
    providerPaymentId: transaction.providerPaymentId ?? undefined,
    ...(outcome === 'failure' ? { reason: 'Demo payment declined' } : {}),
  };
  const result = await applyPaymentEvent(event);
  return { result, transaction };
}

/** Manual cancellation keeps the paid period; it never deletes access early. */
export async function cancelOwnSubscription(user: AuthUser) {
  const subscription = await getSubscriptionForUser(user);
  if (!subscription || subscription.status === 'cancelled') return subscription;
  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'cancelled', cancelledAt: now, nextPaymentAt: null },
  });
  await prisma.paymentTransaction.updateMany({
    where: { subscriptionId: subscription.id, status: 'pending' },
    data: { status: 'cancelled', completedAt: now },
  });
  return updated;
}

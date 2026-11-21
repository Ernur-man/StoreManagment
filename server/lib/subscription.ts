import type { HttpRequest as Request, HttpResponse as Response, NextFunction } from './router.js';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from './constants.js';
import { prisma } from './prisma.js';

const DAY_MS = 86_400_000;

/** Minimal structural type so the pure helpers can be unit-tested without a database. */
export interface SubscriptionLike {
  status: string;
  startedAt: Date | null;
  expiresAt: Date | null;
  nextPaymentAt: Date | null;
  cancelledAt?: Date | null;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function isExpired(subscription: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  return !!subscription?.expiresAt && subscription.expiresAt.getTime() <= now.getTime();
}

/**
 * Expiry is always evaluated from timestamps, never from a stored flag. A user
 * who closes the browser when their period ends is therefore restricted
 * automatically, with no scheduler required.
 */
export function effectiveStatus(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date(),
): SubscriptionStatus {
  if (!subscription) return 'inactive';
  const stored = SUBSCRIPTION_STATUSES.includes(subscription.status as SubscriptionStatus)
    ? (subscription.status as SubscriptionStatus)
    : 'inactive';
  if ((stored === 'active' || stored === 'cancelled' || stored === 'past_due') && isExpired(subscription, now)) {
    return 'expired';
  }
  return stored;
}

/**
 * Pro access is granted for a paid, unexpired period. Cancelling stops future
 * charges but deliberately keeps access until the already-paid period ends.
 */
export function hasProAccess(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  const status = effectiveStatus(subscription, now);
  if (status === 'active') return true;
  return status === 'cancelled' && !!subscription.expiresAt && subscription.expiresAt.getTime() > now.getTime();
}

export function nextPaymentDate(
  subscription: SubscriptionLike | null | undefined,
  now: Date = new Date(),
): Date | null {
  // A cancelled subscription has no upcoming charge even though access may
  // continue until the paid period ends.
  if (effectiveStatus(subscription, now) !== 'active') return null;
  return subscription?.nextPaymentAt ?? subscription?.expiresAt ?? null;
}

export function subscriptionView(subscription: SubscriptionLike | null | undefined, now: Date = new Date()) {
  return {
    status: effectiveStatus(subscription, now),
    storedStatus: subscription?.status ?? 'inactive',
    hasAccess: hasProAccess(subscription, now),
    startedAt: subscription?.startedAt ?? null,
    expiresAt: subscription?.expiresAt ?? null,
    nextPaymentAt: nextPaymentDate(subscription, now),
    cancelledAt: subscription?.cancelledAt ?? null,
  };
}

/** Backend enforcement for every Pro-only API group. */
export async function requireProAccess(req: Request, res: Response, next: NextFunction) {
  const auth = req.authUser;
  if (!auth) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'auth.errors.unauthenticated' });
    return;
  }
  const subscription = await prisma.subscription.findFirst({
    where: { storeId: auth.storeId, userId: auth.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!hasProAccess(subscription, new Date())) {
    res.status(403).json({ error: 'SUBSCRIPTION_REQUIRED', message: 'billing.errors.accessRequired' });
    return;
  }
  next();
}

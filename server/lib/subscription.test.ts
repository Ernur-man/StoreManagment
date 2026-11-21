import { describe, expect, it } from 'vitest';
import { addDays, effectiveStatus, hasProAccess, nextPaymentDate, subscriptionView } from './subscription';
import type { SubscriptionLike } from './subscription';

const now = new Date('2026-11-21T12:00:00.000Z');

const subscription = (overrides: Partial<SubscriptionLike> = {}): SubscriptionLike => ({
  status: 'active',
  startedAt: addDays(now, -5),
  expiresAt: addDays(now, 25),
  nextPaymentAt: addDays(now, 25),
  cancelledAt: null,
  ...overrides,
});

describe('subscription access helpers', () => {
  it('grants access to an active, unexpired subscriber', () => {
    const value = subscription();
    expect(effectiveStatus(value, now)).toBe('active');
    expect(hasProAccess(value, now)).toBe(true);
    expect(nextPaymentDate(value, now)).toEqual(addDays(now, 25));
  });

  it('restricts automatically once the paid period ends', () => {
    const value = subscription({ expiresAt: addDays(now, -1) });
    expect(effectiveStatus(value, now)).toBe('expired');
    expect(hasProAccess(value, now)).toBe(false);
    expect(nextPaymentDate(value, now)).toBeNull();
  });

  it('keeps access after cancellation until the paid period ends', () => {
    const value = subscription({ status: 'cancelled', cancelledAt: addDays(now, -1) });
    expect(effectiveStatus(value, now)).toBe('cancelled');
    expect(hasProAccess(value, now)).toBe(true);
    expect(subscriptionView(value, now).nextPaymentAt).toBeNull();
  });

  it('removes access once a cancelled period expires', () => {
    const value = subscription({ status: 'cancelled', expiresAt: addDays(now, -1), cancelledAt: addDays(now, -2) });
    expect(effectiveStatus(value, now)).toBe('expired');
    expect(hasProAccess(value, now)).toBe(false);
  });

  it('never grants access for pending, past_due, inactive or missing subscriptions', () => {
    for (const status of ['pending', 'past_due', 'inactive', 'expired']) {
      const value = subscription({ status });
      expect(hasProAccess(value, now)).toBe(false);
    }
    expect(hasProAccess(null, now)).toBe(false);
    expect(effectiveStatus(undefined, now)).toBe('inactive');
  });

  it('marks a past_due record as expired when its period ends', () => {
    expect(effectiveStatus(subscription({ status: 'past_due', expiresAt: addDays(now, -1) }), now)).toBe('expired');
  });
});

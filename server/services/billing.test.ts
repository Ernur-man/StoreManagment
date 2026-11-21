import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedPaymentEvent } from './payments';
import { applyPaymentEvent } from './billing';

const state = vi.hoisted(() => ({
  transactions: [] as any[],
  events: [] as any[],
  subscriptions: [] as any[],
  subscriptionUpdates: [] as any[],
  plan: { id: 'plan_1', priceKzt: 7_990, currency: 'KZT', durationDays: 30 },
  duplicateCreate: false,
}));

vi.mock('../lib/prisma.js', async () => {
  const { Prisma } = await import('@prisma/client');

  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
    paymentEvent: {
      findUnique: async ({ where }: any) => {
        const key = where.provider_eventId;
        return state.events.find((event) => event.provider === key.provider && event.eventId === key.eventId) ?? null;
      },
      create: async ({ data }: any) => {
        if (state.duplicateCreate) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate event', {
            code: 'P2002',
            clientVersion: '5.22.0',
          });
        }
        state.events.push({ ...data });
        return data;
      },
    },
    paymentTransaction: {
      findUnique: async ({ where }: any) => state.transactions.find((transaction) => (
        (where.id && transaction.id === where.id)
        || (where.providerPaymentId && transaction.providerPaymentId === where.providerPaymentId)
      )) ?? null,
      updateMany: async ({ where, data }: any) => {
        const transaction = state.transactions.find((item) => item.id === where.id);
        if (!transaction || transaction.status !== where.status) return { count: 0 };
        Object.assign(transaction, data);
        return { count: 1 };
      },
    },
    subscription: {
      findUniqueOrThrow: async ({ where }: any) => state.subscriptions.find((item) => item.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const subscription = state.subscriptions.find((item) => item.id === where.id)!;
        Object.assign(subscription, data);
        state.subscriptionUpdates.push({ ...data });
        return subscription;
      },
    },
    subscriptionPlan: {
      findUniqueOrThrow: async () => state.plan,
    },
  };

  return { prisma: db };
});

function makeEvent(eventId: string, type: NormalizedPaymentEvent['type'] = 'payment.succeeded'): NormalizedPaymentEvent {
  return {
    provider: 'demo',
    eventId,
    type,
    transactionId: 'tx_1',
    providerPaymentId: 'demo_1',
    amountMinor: 799_000,
    currency: 'kzt',
  };
}

beforeEach(() => {
  state.transactions.length = 0;
  state.events.length = 0;
  state.subscriptions.length = 0;
  state.subscriptionUpdates.length = 0;
  state.duplicateCreate = false;
  state.transactions.push({
    id: 'tx_1',
    subscriptionId: 'sub_1',
    planId: 'plan_1',
    provider: 'demo',
    providerPaymentId: 'demo_1',
    status: 'pending',
    amountKzt: 7_990,
    currency: 'KZT',
  });
  state.subscriptions.push({
    id: 'sub_1',
    status: 'pending',
    startedAt: null,
    expiresAt: null,
    nextPaymentAt: null,
  });
});

describe('applyPaymentEvent', () => {
  it('applies an event once and ignores redelivery of the same event id', async () => {
    expect(await applyPaymentEvent(makeEvent('evt_1'))).toEqual({ duplicate: false, applied: true });
    expect(await applyPaymentEvent(makeEvent('evt_1'))).toMatchObject({ duplicate: true, applied: false });
    expect(state.subscriptionUpdates).toHaveLength(1);
  });

  it('does not finalize a transaction twice for different event ids', async () => {
    await applyPaymentEvent(makeEvent('evt_1'));
    expect(await applyPaymentEvent(makeEvent('evt_2'))).toMatchObject({
      duplicate: false,
      applied: false,
      reason: 'payment already finalized',
    });
    expect(state.subscriptionUpdates).toHaveLength(1);
  });

  it('treats a unique constraint race as a duplicate event', async () => {
    state.duplicateCreate = true;
    expect(await applyPaymentEvent(makeEvent('evt_3'))).toMatchObject({ duplicate: true, applied: false });
    expect(state.subscriptionUpdates).toHaveLength(0);
  });

  it('keeps an already paid period active when a renewal fails', async () => {
    const future = new Date(Date.now() + 10 * 86_400_000);
    state.subscriptions[0].status = 'active';
    state.subscriptions[0].expiresAt = future;
    expect(await applyPaymentEvent(makeEvent('evt_fail', 'payment.failed'))).toMatchObject({
      duplicate: false,
      applied: true,
    });
    expect(state.subscriptionUpdates[0]).toMatchObject({ status: 'active' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Router, handleRequest } from '../lib/router';
import { adminBillingRouter } from './billingAdmin';

const state = vi.hoisted(() => ({
  subscription: null as any,
  updateData: null as any,
  upsertData: null as any,
}));

vi.mock('../lib/prisma.js', () => {
  const db = {
    subscription: {
      findFirst: async () => state.subscription,
      update: async ({ data }: any) => {
        state.updateData = data;
        return { ...state.subscription, ...data };
      },
      upsert: async ({ create, update }: any) => {
        state.upsertData = { ...create, ...update };
        return { id: 'sub_1', ...state.upsertData };
      },
    },
    subscriptionPlan: { findUniqueOrThrow: async () => ({ id: 'plan_1' }) },
    user: { findUnique: async () => ({ id: 'user_1', storeId: 'store_1' }) },
    auditLog: { create: async () => ({}) },
  };
  return { prisma: db };
});

const router = new Router();
router.use((req, _res, next) => {
  req.authUser = {
    id: 'admin_1',
    storeId: 'store_1',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
  };
  next();
});
router.mount('/billing/admin', adminBillingRouter);

function call(method: 'PATCH' | 'POST', path: string, body: unknown): Promise<Response> {
  return handleRequest(
    router,
    new Request(`http://localhost/api/billing/admin${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { basePath: '/api' },
  );
}

beforeEach(() => {
  state.subscription = {
    id: 'sub_1',
    status: 'inactive',
    startedAt: null,
    expiresAt: null,
    nextPaymentAt: null,
    cancelledAt: null,
    lastPaymentAt: null,
    provider: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  state.updateData = null;
  state.upsertData = null;
});

describe('admin subscription grants', () => {
  it('assigns a finite expiry when an admin activates a subscription without one', async () => {
    const started = Date.now();
    const response = await call('PATCH', '/subscriptions/sub_1', { status: 'active', expiresAt: null });
    expect(response.status).toBe(200);
    expect(state.updateData.expiresAt).toBeInstanceOf(Date);
    expect(state.updateData.expiresAt.getTime()).toBeGreaterThanOrEqual(started + 29 * 86_400_000);
    expect(state.updateData.nextPaymentAt).toEqual(state.updateData.expiresAt);
  });

  it('assigns a finite expiry for a manual active grant', async () => {
    const started = Date.now();
    const response = await call('POST', '/subscriptions', { email: 'user@example.com', status: 'active' });
    expect(response.status).toBe(200);
    expect(state.upsertData.expiresAt).toBeInstanceOf(Date);
    expect(state.upsertData.expiresAt.getTime()).toBeGreaterThanOrEqual(started + 29 * 86_400_000);
    expect(state.upsertData.nextPaymentAt).toEqual(state.upsertData.expiresAt);
  });
});

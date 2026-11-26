import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerArrival, type RegisterArrivalInput } from './matching.js';

const state = vi.hoisted(() => ({
  requests: [] as any[],
  outboxRows: [] as any[],
  customerUpdates: [] as any[],
  matchCreateMany: vi.fn(),
  notificationCreate: vi.fn(),
}));

vi.mock('resend', () => ({ Resend: vi.fn() }));

vi.mock('../lib/audit.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, writeAudit: vi.fn() };
});

vi.mock('../lib/prisma.js', () => {
  const tx: any = {
    store: { findUnique: async () => ({ id: 'store_1', lowStockThreshold: 3 }) },
    product: {
      findMany: async () => [],
      create: async (args: any) => ({ id: 'prod_1', sku: args.data.sku, category: 'Uncategorized' }),
      findUniqueOrThrow: async () => ({ id: 'prod_1', sku: 'SKU-1', category: 'Uncategorized' }),
    },
    productVariant: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: any) => ({ id: 'variant_1', sku: args.data.sku, size: args.data.size, color: args.data.color }),
    },
    inventory: {
      findUnique: async () => ({ quantity: 0 }),
      upsert: async (args: any) => ({ quantity: args.create.quantity }),
    },
    customerRequest: {
      findMany: async ({ where }: any) => state.requests.filter((request) => request.status === where.status),
      findFirst: async ({ where }: any) => {
        const request = state.requests.find((candidate) => candidate.id === where.id);
        return request && request.status === 'WAITING' && request.matches.length === 0 ? { id: request.id } : null;
      },
      update: async ({ where, data }: any) => {
        state.customerUpdates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
    },
    stockArrival: {
      create: async (args: any) => ({ id: 'arrival_1', arrivalNumber: 'ARR-1', ...args.data }),
      findUniqueOrThrow: async ({ where }: any) => ({
        id: where.id,
        arrivalNumber: 'ARR-1',
        items: [],
        employee: null,
      }),
    },
    stockArrivalItem: {
      create: async (args: any) => ({ id: 'item_1', ...args.data }),
    },
    arrivalMatch: {
      createMany: async (args: any) => {
        state.matchCreateMany(args);
        return { count: args.data.length };
      },
      findMany: async ({ where }: any) => where.requestId.in.map((id: string) => ({ requestId: id })),
    },
    notification: { create: async (args: any) => { state.notificationCreate(args); return { id: 'notification_1' }; } },
    arrivalEmailNotification: {
      createMany: async ({ data }: any) => {
        state.outboxRows.push(...data.map((row: any, index: number) => ({ ...row, id: `notif_${index + 1}` })));
        return { count: data.length };
      },
      findMany: async () => state.outboxRows.map((row) => ({ id: row.id })),
    },
  };
  return { prisma: { $transaction: async (callback: any) => callback(tx) } };
});

const user = {
  id: 'user_1',
  storeId: 'store_1',
  name: 'User',
  email: 'user@example.com',
  role: 'ADMIN',
} as any;

const input: RegisterArrivalInput = {
  sku: 'SKU-1',
  productName: 'Blue Jacket',
  size: 'M',
  color: 'Blue',
  quantity: 2,
};

function waitingRequest(overrides: Partial<any> = {}) {
  return {
    id: 'req_1',
    storeId: 'store_1',
    requestNumber: 'REQ-1',
    status: 'WAITING',
    customer: { id: 'customer_1', name: 'Anna', phone: '+10000000001' },
    matches: [],
    sku: 'SKU-1',
    size: 'M',
    color: 'Blue',
    email: null,
    emailLanguage: 'en',
    ...overrides,
  };
}

beforeEach(() => {
  state.requests = [];
  state.outboxRows = [];
  state.customerUpdates = [];
  state.matchCreateMany.mockClear();
  state.notificationCreate.mockClear();
});

describe('matching triggers arrival emails', () => {
  it('queues an outbox row only for matched requests that have a valid email', async () => {
    state.requests = [
      waitingRequest({ id: 'req_1', email: 'Anna@Example.com', emailLanguage: 'ru' }),
      waitingRequest({ id: 'req_2', requestNumber: 'REQ-2', customer: { id: 'customer_2', name: 'Legacy', phone: '+10000000002' } }),
    ];

    const result = await registerArrival(input, user);

    expect(result.matchedRequests).toHaveLength(2);
    expect(result.quantityBefore).toBe(0);
    expect(result.quantityAfter).toBe(2);
    expect(state.customerUpdates.every((update) => update.data.status === 'AVAILABLE')).toBe(true);
    expect(state.matchCreateMany).toHaveBeenCalledTimes(1);
    expect(state.notificationCreate).toHaveBeenCalledTimes(1);
    expect(result.emailNotificationIds).toEqual(['notif_1']);
    expect(state.outboxRows).toHaveLength(1);
    expect(state.outboxRows[0]).toMatchObject({
      requestId: 'req_1',
      recipientEmail: 'anna@example.com',
      emailLanguage: 'ru',
      sku: 'SKU-1',
      size: 'M',
      color: 'Blue',
      quantity: 2,
      status: 'PENDING',
    });
  });

  it('does not queue or update requests when no waiting request matches', async () => {
    state.requests = [
      waitingRequest({ id: 'req_old', sku: 'OTHER', status: 'AVAILABLE', email: 'old@example.com' }),
    ];

    const result = await registerArrival(input, user);

    expect(result.matchedRequests).toEqual([]);
    expect(result.emailNotificationIds).toEqual([]);
    expect(state.matchCreateMany).not.toHaveBeenCalled();
    expect(state.notificationCreate).not.toHaveBeenCalled();
    expect(state.customerUpdates).toEqual([]);
    expect(state.outboxRows).toEqual([]);
  });
});

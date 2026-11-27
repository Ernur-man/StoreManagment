import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerArrival, type RegisterArrivalInput } from './matching.js';

const state = vi.hoisted(() => {
  const s: {
    requests: any[];
    outboxRows: any[];
    customerUpdates: any[];
    matchCreateMany: any;
    notificationCreate: any;
    elapsedMs: number;
    transactionOptions: { maxWait?: number; timeout?: number } | null;
    p2028Errors: string[];
    tick: (operation: string) => void;
  } = {
    requests: [],
    outboxRows: [] as any[],
    customerUpdates: [] as any[],
    matchCreateMany: vi.fn(),
    notificationCreate: vi.fn(),
    elapsedMs: 0,
    transactionOptions: null as { maxWait?: number; timeout?: number } | null,
    p2028Errors: [] as string[],
    tick: () => {},
  };

  // Each model call is one round-trip. Prisma closes an interactive transaction
  // at its default 5s timeout; every later query on tx then fails with P2028.
  s.tick = (operation: string) => {
    s.elapsedMs += 100;
    const timeout = s.transactionOptions?.timeout ?? 5_000;
    if (operation === 'arrivalMatch.findMany' && s.elapsedMs > timeout) {
      s.p2028Errors.push(operation);
      const error = new Error(
        "Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore.",
      ) as Error & { code: string };
      error.code = 'P2028';
      throw error;
    }
  };

  return s;
});

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
      findMany: async ({ where }: any) => {
        if (where?.id?.in) {
          return state.requests
            .filter(
              (request) =>
                where.id.in.includes(request.id) &&
                request.status === 'WAITING' &&
                request.matches.length === 0,
            )
            .map((request) => ({ id: request.id }));
        }
        return state.requests.filter((request) => request.status === where.status);
      },
      findFirst: async ({ where }: any) => {
        const request = state.requests.find((candidate) => candidate.id === where.id);
        return request && request.status === 'WAITING' && request.matches.length === 0 ? { id: request.id } : null;
      },
      update: async ({ where, data }: any) => {
        state.customerUpdates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
      updateMany: async ({ where, data }: any) => {
        const ids: string[] = where.id?.in ?? (where.id ? [where.id] : []);
        for (const id of ids) {
          const request = state.requests.find((candidate) => candidate.id === id);
          if (!request) continue;
          state.customerUpdates.push({ id, data });
          Object.assign(request, data);
        }
        return { count: ids.length };
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

  for (const [model, methods] of Object.entries(tx) as Array<[string, Record<string, any>]>) {
    for (const [method, query] of Object.entries(methods)) {
      methods[method] = async (...args: any[]) => {
        state.tick(`${model}.${method}`);
        return query(...args);
      };
    }
  }

  return {
    prisma: {
      $transaction: async (
        callback: any,
        options?: { maxWait?: number; timeout?: number },
      ) => {
        state.transactionOptions = options ?? null;
        state.elapsedMs = 0;
        state.p2028Errors = [];
        return callback(tx);
      },
    },
  };
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
  state.elapsedMs = 0;
  state.transactionOptions = null;
  state.p2028Errors = [];
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

describe('arrival transaction timeout regression (P2028)', () => {
  it('keeps the interactive transaction open past Prisma\'s default 5s timeout', async () => {
    // Old code: 11 setup queries + 38 per-request re-checks + createMany put
    // arrivalMatch.findMany at 5100ms, after Prisma's 5s default timeout.
    // Batched re-checks plus explicit options keep the callback well below it.
    const requestCount = 38;
    state.requests = Array.from({ length: requestCount }, (_, index) =>
      waitingRequest({
        id: `req_${index + 1}`,
        requestNumber: `REQ-${index + 1}`,
        customer: {
          id: `customer_${index + 1}`,
          name: `Customer ${index + 1}`,
          phone: `+1000${String(index + 1).padStart(7, '0')}`,
        },
        email: `customer${index + 1}@example.com`,
      }),
    );

    const result = await registerArrival(input, user);

    expect(state.transactionOptions).toMatchObject({ maxWait: 10_000, timeout: 30_000 });
    expect(state.p2028Errors).toEqual([]);
    expect(result.matchedRequests).toHaveLength(requestCount);
    expect(state.customerUpdates).toHaveLength(requestCount);
    expect(state.outboxRows).toHaveLength(requestCount);
  });
});

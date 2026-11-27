import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma.js';
import {
  ARRIVAL_EMAIL_SUBJECT,
  RESEND_CONFIG_ERROR,
  dispatchArrivalEmails,
  queueArrivalEmailNotifications,
  renderArrivalEmail,
  retryArrivalEmailNotification,
  type ArrivalEmailSnapshot,
  type QueueArrivalEmailContext,
} from './arrivalEmail.js';

const state = vi.hoisted(() => ({
  rows: [] as any[],
  send: vi.fn(),
  seq: 0,
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: (...args: any[]) => state.send(...args) } })),
}));

vi.mock('../lib/prisma.js', () => {
  const statusMatches = (actual: string, expected: any) =>
    expected ? (Array.isArray(expected.in) ? expected.in.includes(actual) : actual === expected) : true;
  const db = {
    arrivalEmailNotification: {
      createMany: async ({ data }: any) => {
        let count = 0;
        for (const row of data) {
          const duplicate = state.rows.some(
            (existing) => existing.arrivalId === row.arrivalId && existing.requestId === row.requestId,
          );
          if (duplicate) continue;
          state.rows.push({
            id: `notif_${++state.seq}`,
            ...row,
            status: 'PENDING',
            providerMessageId: null,
            error: null,
            attempts: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            sentAt: null,
            lastAttemptAt: null,
          });
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }: any) =>
        state.rows
          .filter((row) => {
            const requests = where?.requestId?.in;
            return (
              (!where?.arrivalId || row.arrivalId === where.arrivalId) &&
              (!where?.storeId || row.storeId === where.storeId) &&
              (!requests || requests.includes(row.requestId)) &&
              statusMatches(row.status, where?.status)
            );
          })
          .map((row) => ({ id: row.id })),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.rows) {
          if (where.id && row.id !== where.id) continue;
          if (where.storeId && row.storeId !== where.storeId) continue;
          if (!statusMatches(row.status, where.status)) continue;
          for (const [key, value] of Object.entries(data)) {
            if (key === 'attempts' && typeof value === 'object' && value && 'increment' in value) {
              row.attempts += Number((value as any).increment);
            } else {
              row[key] = value;
            }
          }
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: any) => state.rows.find((row) => row.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        state.rows.find((row) => row.id === where.id && row.storeId === where.storeId) ?? null,
      update: async ({ where, data }: any) => {
        const row = state.rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('NOT_FOUND');
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  return { prisma: db };
});

const context: QueueArrivalEmailContext = {
  storeId: 'store_1',
  arrivalId: 'arrival_1',
  arrivalItemId: 'item_1',
  productName: 'Blue Jacket',
  sku: 'JKT-BLU-M',
  size: 'M',
  color: 'Blue',
  quantity: 3,
};

function snapshot(overrides: Partial<ArrivalEmailSnapshot> = {}): ArrivalEmailSnapshot {
  return {
    id: 'notif_1',
    storeId: 'store_1',
    arrivalId: 'arrival_1',
    requestId: 'req_1',
    customerName: 'Anna',
    recipientEmail: 'anna@example.com',
    emailLanguage: 'en',
    productName: 'Blue Jacket',
    sku: 'JKT-BLU-M',
    size: 'M',
    color: 'Blue',
    quantity: 3,
    status: 'PENDING',
    providerMessageId: null,
    error: null,
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.rows = [];
  state.seq = 0;
  state.send.mockReset();
  process.env.RESEND_API_KEY = 're_test_secret_key_123456789';
  process.env.RESEND_FROM_EMAIL = 'WishStock <notifications@wishstock.test>';
});

describe('arrival email templates', () => {
  it('uses the exact subject, escapes HTML and provides a plain-text fallback in English', () => {
    const result = renderArrivalEmail(snapshot({
      customerName: '<b>Anna</b>',
      productName: '<script>alert(1)</script>',
      color: 'Blue "night"',
    }));
    expect(result.subject).toBe(ARRIVAL_EMAIL_SUBJECT);
    expect(result.html).toContain('WishStock');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).toContain('&lt;b&gt;Anna&lt;/b&gt;');
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('Please contact the store to arrange collection.');
    expect(result.text).toContain('Product: <script>alert(1)</script>');
    expect(result.text).toContain('Thank you for choosing WishStock!');
  });

  it('renders a Russian template when the request language is ru', () => {
    const result = renderArrivalEmail(snapshot({ emailLanguage: 'ru' }));
    expect(result.subject).toBe(ARRIVAL_EMAIL_SUBJECT);
    expect(result.html).toContain('lang="ru"');
    expect(result.html).toContain('Здравствуйте, Anna!');
    expect(result.html).toContain('Артикул');
    expect(result.text).toContain('Пожалуйста, свяжитесь с магазином');
  });
});

describe('arrival email outbox', () => {
  it('queues a normalized valid request email and preserves the chosen language', async () => {
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: '  User@Example.COM ', emailLanguage: 'ru' },
    ]);
    expect(ids).toHaveLength(1);
    expect(state.rows[0].recipientEmail).toBe('user@example.com');
    expect(state.rows[0].emailLanguage).toBe('ru');
    expect(state.rows[0].status).toBe('PENDING');
  });

  it('does not queue requests without an email, including existing records', async () => {
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_old', customerName: 'Legacy', email: null },
      { id: 'req_invalid', customerName: 'Invalid', email: 'not-an-email' },
    ]);
    expect(ids).toEqual([]);
    expect(state.rows).toHaveLength(0);
  });

  it('is idempotent for a duplicate matching event', async () => {
    const first = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    const second = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    expect(second).toEqual(first);
    expect(state.rows).toHaveLength(1);
  });

  it('sends a queued email after commit and stores the Resend message ID', async () => {
    state.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    await dispatchArrivalEmails(ids);
    expect(state.send).toHaveBeenCalledTimes(1);
    const [payload, options] = state.send.mock.calls[0] as any[];
    expect(payload.subject).toBe(ARRIVAL_EMAIL_SUBJECT);
    expect(payload.from).toBe(process.env.RESEND_FROM_EMAIL);
    expect(payload.to).toBe('anna@example.com');
    expect(options.idempotencyKey).toBe(`wishstock-arrival-email-${ids[0]}`);
    expect(state.rows[0].status).toBe('SENT');
    expect(state.rows[0].providerMessageId).toBe('msg_123');
    expect(state.rows[0].sentAt).toBeInstanceOf(Date);
  });

  it('persists a safe failure without throwing', async () => {
    state.send.mockResolvedValue({
      data: null,
      error: {
        name: 'invalid_api_key',
        message: 'Invalid key re_test_secret_key_123456789 for anna@example.com',
        statusCode: 401,
      },
    });
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    await expect(dispatchArrivalEmails(ids)).resolves.toBeUndefined();
    expect(state.rows[0].status).toBe('FAILED');
    expect(state.rows[0].error).not.toContain('re_test_secret_key_123456789');
    expect(state.rows[0].error).not.toContain('anna@example.com');
    expect(state.rows[0].error).toContain('invalid_api_key');
  });

  it('persists a names-only diagnostic and leaves rows pending when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    await dispatchArrivalEmails(ids);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe('PENDING');
    expect(state.rows[0].error).toBe(RESEND_CONFIG_ERROR);
    expect(state.rows[0].error).not.toContain(process.env.RESEND_FROM_EMAIL ?? 'not-present');
    expect(state.rows[0].attempts).toBe(0);
  });

  it('never marks SENT without a provider message ID', async () => {
    state.send.mockResolvedValue({ data: {}, error: null });
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    await dispatchArrivalEmails(ids);
    expect(state.rows[0].status).toBe('FAILED');
    expect(state.rows[0].error).toContain('RESEND_ACCEPTANCE_UNCONFIRMED');
    expect(state.rows[0].providerMessageId).toBeNull();
    expect(state.rows[0].sentAt).toBeNull();
  });

  it('reports UNAVAILABLE instead of success when retrying without Resend configuration', async () => {
    delete process.env.RESEND_FROM_EMAIL;
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    const retried = await retryArrivalEmailNotification(ids[0]!, context.storeId);
    expect(retried).toMatchObject({ status: 'UNAVAILABLE', notification: null });
    expect(state.send).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe('PENDING');
    expect(state.rows[0].error).toBe(RESEND_CONFIG_ERROR);
    expect(state.rows[0].attempts).toBe(0);
  });

  it('retries a failed notification with the same idempotency key and blocks sent rows', async () => {
    state.send
      .mockResolvedValueOnce({ data: null, error: { name: 'application_error', message: 'Temporary failure', statusCode: 500 } })
      .mockResolvedValueOnce({ data: { id: 'msg_retry' }, error: null });
    const ids = await queueArrivalEmailNotifications(prisma as any, context, [
      { id: 'req_1', customerName: 'Anna', email: 'anna@example.com' },
    ]);
    await dispatchArrivalEmails(ids);
    expect(state.rows[0].status).toBe('FAILED');

    const wrongStore = await retryArrivalEmailNotification(ids[0]!, 'other_store');
    expect(wrongStore.status).toBe('NOT_FOUND');
    expect(state.send).toHaveBeenCalledTimes(1);

    const retried = await retryArrivalEmailNotification(ids[0]!, context.storeId);
    expect(retried.status).toBe('RETRIED');
    expect(state.send).toHaveBeenCalledTimes(2);
    const firstKey = (state.send.mock.calls[0] as any[])[1].idempotencyKey;
    const secondKey = (state.send.mock.calls[1] as any[])[1].idempotencyKey;
    expect(secondKey).toBe(firstKey);
    expect(state.rows[0].status).toBe('SENT');
    expect(state.rows[0].providerMessageId).toBe('msg_retry');
    expect(state.rows[0].attempts).toBe(2);

    const again = await retryArrivalEmailNotification(ids[0]!, context.storeId);
    expect(again.status).toBe('TERMINAL');
    expect(state.send).toHaveBeenCalledTimes(2);
  });
});

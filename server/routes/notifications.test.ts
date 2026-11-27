import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../lib/router.js';
import notificationRoutes from './notifications.js';

const state = vi.hoisted(() => ({
  user: null as any,
  list: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('../lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: () => void) => {
      if (!state.user) {
        res.status(401).json({ error: 'UNAUTHENTICATED', message: 'auth.errors.unauthenticated' });
        return;
      }
      req.authUser = state.user;
      next();
    },
  };
});

vi.mock('../lib/subscription.js', () => ({ requireProAccess: (_req: any, _res: any, next: () => void) => next() }));
vi.mock('../lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../services/arrivalEmail.js', () => ({
  listArrivalEmailNotifications: (...args: any[]) => state.list(...args),
  retryArrivalEmailNotification: (...args: any[]) => state.retry(...args),
}));

function call(method: 'GET' | 'POST', path: string, body?: unknown, ip = 'security-test'): Promise<Response> {
  return handleRequest(
    notificationRoutes,
    new Request(`http://localhost/api/notifications${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-vercel-forwarded-for': ip,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { basePath: '/api/notifications' },
  );
}

beforeEach(() => {
  state.user = {
    id: 'user_1',
    storeId: 'store_1',
    name: 'Employee',
    email: 'employee@example.com',
    role: 'EMPLOYEE',
  };
  state.list.mockReset().mockResolvedValue([{ id: 'notif_1', status: 'FAILED' }]);
  state.retry.mockReset().mockResolvedValue({ status: 'RETRIED', notification: null });
});

describe('arrival email notification API security', () => {
  it('rejects unauthenticated history access', async () => {
    state.user = null;
    const response = await call('GET', '/emails');
    expect(response.status).toBe(401);
    expect(state.list).not.toHaveBeenCalled();
  });

  it('scopes history to the authenticated store', async () => {
    const response = await call('GET', '/emails');
    expect(response.status).toBe(200);
    expect(state.list).toHaveBeenCalledWith('store_1');
    await expect(response.json()).resolves.toEqual({ notifications: [{ id: 'notif_1', status: 'FAILED' }] });
  });

  it('retries only an existing outbox ID and ignores caller-controlled recipient data', async () => {
    const response = await call(
      'POST',
      '/emails/notif_1/retry',
      { recipientEmail: 'attacker@example.com', from: 'attacker@example.com' },
      'retry-security-test',
    );
    expect(response.status).toBe(200);
    expect(state.retry).toHaveBeenCalledWith('notif_1', 'store_1');
    expect(JSON.stringify(state.retry.mock.calls)).not.toContain('attacker@example.com');
  });

  it('returns 503 when email delivery is not configured', async () => {
    state.retry.mockResolvedValueOnce({ status: 'UNAVAILABLE', notification: null });
    const response = await call('POST', '/emails/notif_1/retry', undefined, 'email-unavailable-test');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'EMAIL_NOT_CONFIGURED',
      message: 'notifications.errors.emailUnavailable',
    });
    expect(state.retry).toHaveBeenCalledWith('notif_1', 'store_1');
  });

  it('rate limits repeated retries', async () => {
    let lastStatus = 0;
    for (let index = 0; index < 11; index += 1) {
      const response = await call('POST', '/emails/notif_1/retry', undefined, 'rate-limit-test-isolated');
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
    expect(state.retry).toHaveBeenCalledTimes(10);
  });

  it('exposes no arbitrary send endpoint', async () => {
    const response = await call('POST', '/emails', { to: 'customer@example.com' }, 'no-send-endpoint-test');
    expect(response.status).toBe(404);
    expect(state.retry).not.toHaveBeenCalled();
  });
});

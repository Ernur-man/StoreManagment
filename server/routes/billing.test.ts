import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../lib/router.js';
import { billingRouter } from './billing.js';
import {
  PAYMENTS_UNAVAILABLE_KEY,
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentVerificationError,
  type PaymentReadiness,
} from '../services/payments.js';
import { getPlan, startCheckout } from '../services/billing.js';
import { getDemoCard } from '../services/demoCard.js';

const state = vi.hoisted(() => ({
  readiness: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

vi.mock('../lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireAuth: (req: any, _res: any, next: () => void) => {
      req.authUser = {
        id: 'user_1',
        storeId: 'store_1',
        name: 'User',
        email: 'user@example.com',
        role: 'ADMIN',
      };
      next();
    },
  };
});

vi.mock('../services/payments.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    paymentReadiness: (...args: any[]) => state.readiness(...args),
  };
});

vi.mock('../services/billing.js', () => ({
  getPlan: vi.fn(),
  startCheckout: vi.fn(),
  confirmDemoPayment: vi.fn(),
  cancelOwnSubscription: vi.fn(),
  subscriptionResponse: vi.fn(async () => ({ demo: false })),
}));

vi.mock('../services/demoCard.js', () => ({
  DemoCardValidationError: class extends Error {},
  getDemoCard: vi.fn(),
  saveDemoCard: vi.fn(),
  deleteDemoCard: vi.fn(),
}));

vi.mock('./billingAdmin.js', async () => {
  const { Router } = await import('../lib/router.js');
  return { adminBillingRouter: new Router() };
});

function call(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> {
  return handleRequest(
    billingRouter,
    new Request(`http://localhost/api/billing${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { basePath: '/api/billing' },
  );
}

const readyDemo: PaymentReadiness = {
  available: true,
  provider: 'demo',
  demo: true,
  reasonCode: null,
  reasonKey: null,
  missing: [],
};

const readyStripe: PaymentReadiness = {
  ...readyDemo,
  provider: 'stripe',
  demo: false,
};

const unavailable: PaymentReadiness = {
  available: false,
  provider: 'unknown',
  demo: false,
  reasonCode: 'PAYMENT_PROVIDER_MISSING',
  reasonKey: PAYMENTS_UNAVAILABLE_KEY,
  missing: ['PAYMENT_PROVIDER'],
};

beforeEach(() => {
  state.readiness.mockReset().mockReturnValue(readyDemo);
  vi.mocked(getPlan).mockReset().mockResolvedValue({
    id: 'plan_1',
    code: 'wishstock-pro',
    name: 'WishStock Pro',
    description: 'Full access',
    priceKzt: 7_990,
    currency: 'KZT',
    billingCycle: 'MONTH',
    durationDays: 30,
    features: '["billing.feature.dashboard"]',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  vi.mocked(startCheckout).mockReset().mockResolvedValue({
    transaction: {
      id: 'tx_1',
      providerPaymentId: 'demo_1',
      amountKzt: 7_990,
      currency: 'KZT',
    },
    checkoutUrl: 'http://localhost/billing/demo',
  } as any);
  vi.mocked(getDemoCard).mockReset().mockResolvedValue(null);
});

describe('billing route payment availability', () => {
  it('reports server-derived readiness on the plan endpoint', async () => {
    state.readiness.mockReturnValue(unavailable);
    const response = await call('GET', '/plan');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      paymentsAvailable: false,
      paymentProvider: 'unknown',
      paymentUnavailableReason: 'PAYMENT_PROVIDER_MISSING',
      paymentUnavailableKey: PAYMENTS_UNAVAILABLE_KEY,
    });
  });

  it('blocks checkout before touching the payment service when payments are unavailable', async () => {
    state.readiness.mockReturnValue(unavailable);
    const response = await call('POST', '/checkout', {});
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'PAYMENTS_UNAVAILABLE',
      message: PAYMENTS_UNAVAILABLE_KEY,
      reason: 'PAYMENT_PROVIDER_MISSING',
    });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('maps configuration errors to 503 without leaking internal text', async () => {
    vi.mocked(startCheckout).mockRejectedValueOnce(
      new PaymentConfigurationError('internal APP_URL detail', PAYMENTS_UNAVAILABLE_KEY, 'APP_URL_MISSING'),
    );
    const response = await call('POST', '/checkout', {});
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('PAYMENTS_UNAVAILABLE');
    expect(body).toContain('APP_URL_MISSING');
    expect(body).not.toContain('internal APP_URL detail');
  });

  it('maps provider failures to 502 and verification failures to 400', async () => {
    vi.mocked(startCheckout).mockRejectedValueOnce(new PaymentProviderError('provider detail'));
    const providerResponse = await call('POST', '/checkout', {});
    expect(providerResponse.status).toBe(502);
    await expect(providerResponse.json()).resolves.toEqual({
      error: 'PAYMENT_PROVIDER_ERROR',
      message: 'billing.errors.providerError',
    });

    vi.mocked(startCheckout).mockRejectedValueOnce(new PaymentVerificationError('verification detail'));
    const verificationResponse = await call('POST', '/checkout', {});
    expect(verificationResponse.status).toBe(400);
    await expect(verificationResponse.json()).resolves.toEqual({
      error: 'INVALID_PAYMENT',
      message: 'billing.errors.invalidPayment',
    });
  });

  it('blocks demo-only card endpoints when payments are unavailable or Stripe is configured', async () => {
    state.readiness.mockReturnValue(unavailable);
    const unavailableResponse = await call('GET', '/card');
    expect(unavailableResponse.status).toBe(503);
    expect(getDemoCard).not.toHaveBeenCalled();

    state.readiness.mockReturnValue(readyStripe);
    const disabledResponse = await call('GET', '/card');
    expect(disabledResponse.status).toBe(403);
    await expect(disabledResponse.json()).resolves.toEqual({
      error: 'DEMO_DISABLED',
      message: 'billing.errors.demoDisabled',
    });
    expect(getDemoCard).not.toHaveBeenCalled();
  });
});

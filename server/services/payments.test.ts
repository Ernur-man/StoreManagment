import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaymentVerificationError,
  createCheckout,
  isDemoAllowed,
  normalizeWebhook,
  resolveAppOrigin,
  signPayload,
  verifyDemoTicket,
  verifySignature,
  verifyStripeSignature,
} from './payments';

const secret = 'test-webhook-secret';
const nowMs = Date.now();

beforeEach(() => {
  process.env.PAYMENT_DEMO_WEBHOOK_SECRET = secret;
  process.env.STRIPE_WEBHOOK_SECRET = secret;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('webhook signature verification', () => {
  it('accepts a correctly signed demo payload and rejects tampering', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded', transactionId: 'tx_1' });
    const signature = signPayload(secret, body);
    expect(verifySignature(secret, body, signature)).toBe(true);
    expect(verifySignature(secret, `${body} `, signature)).toBe(false);
    expect(verifySignature(secret, body, undefined)).toBe(false);
  });

  it('accepts a Stripe signature within the replay window', () => {
    const body = '{"id":"evt_2"}';
    const timestamp = String(Math.floor(nowMs / 1000));
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    expect(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, nowMs)).toBe(true);
    expect(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, 'other-secret', nowMs)).toBe(false);
    expect(verifyStripeSignature(body, `t=${Number(timestamp) - 900},v1=${signature}`, secret, nowMs)).toBe(false);
  });
});

describe('webhook normalization', () => {
  it('maps a signed demo success event', () => {
    const body = JSON.stringify({
      id: 'demo_evt_1',
      type: 'payment.succeeded',
      transactionId: 'tx_1',
      data: { reason: null },
    });
    const event = normalizeWebhook('demo', body, { 'x-wishstock-signature': signPayload(secret, body) });
    expect(event).toMatchObject({
      provider: 'demo',
      eventId: 'demo_evt_1',
      type: 'payment.succeeded',
      transactionId: 'tx_1',
    });
  });

  it('rejects a demo event with an invalid signature', () => {
    const body = JSON.stringify({ id: 'demo_evt_2', type: 'payment.failed', transactionId: 'tx_1' });
    expect(() => normalizeWebhook('demo', body, { 'x-wishstock-signature': 'deadbeef' })).toThrow(PaymentVerificationError);
  });

  it('maps signed Stripe checkout events and validates the amount', () => {
    const body = JSON.stringify({
      id: 'evt_stripe_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          amount_total: 799000,
          currency: 'kzt',
          metadata: { transactionId: 'tx_stripe_1' },
        },
      },
    });
    const timestamp = String(Math.floor(nowMs / 1000));
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const headers = { 'stripe-signature': `t=${timestamp},v1=${signature}` };
    expect(normalizeWebhook('stripe', body, headers)).toMatchObject({
      provider: 'stripe',
      type: 'payment.succeeded',
      transactionId: 'tx_stripe_1',
    });

    const wrongAmount = body.replace('799000', '100');
    const wrongSignature = createHmac('sha256', secret).update(`${timestamp}.${wrongAmount}`).digest('hex');
    expect(() => normalizeWebhook('stripe', wrongAmount, { 'stripe-signature': `t=${timestamp},v1=${wrongSignature}` }))
      .toThrow(PaymentVerificationError);
  });

  it('treats an unpaid Stripe checkout as pending and ignores unknown events', () => {
    const pending = JSON.stringify({
      id: 'evt_stripe_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_2', payment_status: 'unpaid', client_reference_id: 'tx_2', metadata: {} } },
    });
    const timestamp = String(Math.floor(nowMs / 1000));
    const sign = (body: string) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    expect(normalizeWebhook('stripe', pending, { 'stripe-signature': `t=${timestamp},v1=${sign(pending)}` }))
      .toMatchObject({ type: 'payment.pending', transactionId: 'tx_2' });

    const unknown = JSON.stringify({ id: 'evt_other', type: 'payment_intent.created', data: { object: {} } });
    expect(normalizeWebhook('stripe', unknown, { 'stripe-signature': `t=${timestamp},v1=${sign(unknown)}` })).toBeNull();
  });
});

describe('demo availability', () => {
  it('allows the labelled demo flow in production when PAYMENT_PROVIDER=demo', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYMENT_PROVIDER', 'demo');
    expect(isDemoAllowed()).toBe(true);
  });

  it('disables the demo flow when a real provider is configured', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe');
    expect(isDemoAllowed()).toBe(false);
  });
});

describe('checkout origin resolution', () => {
  it('prefers the active loopback request origin over a stale localhost APP_URL', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:4999');
    expect(resolveAppOrigin({ url: 'http://localhost:3000/api/billing/checkout' })).toBe('http://localhost:3000');
  });

  it('keeps a configured non-local origin', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'https://wishstock.example');
    expect(resolveAppOrigin({ url: 'http://localhost:3000/api/billing/checkout' })).toBe('https://wishstock.example');
  });

  it('never trusts request origins or localhost in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'http://localhost:4999');
    expect(resolveAppOrigin({ url: 'http://localhost:3000/api/billing/checkout' })).toBeNull();

    vi.stubEnv('APP_URL', 'https://wishstock.example');
    expect(resolveAppOrigin({ url: 'https://attacker.example/api/billing/checkout' })).toBe('https://wishstock.example');
  });

  it('builds the demo checkout URL on the active origin with a signed ticket', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:4999');
    const result = await createCheckout(
      'demo',
      {
        transactionId: 'tx_1',
        idempotencyKey: 'idem_1',
        amountKzt: 7_990,
        storeId: 'store_1',
        userId: 'user_1',
      },
      { url: 'http://localhost:3000/api/billing/checkout' },
    );

    const checkout = new URL(result.checkoutUrl);
    expect(checkout.origin).toBe('http://localhost:3000');
    expect(checkout.pathname).toBe('/billing/demo');
    expect(verifyDemoTicket(checkout.searchParams.get('token') ?? '')).toMatchObject({
      transactionId: 'tx_1',
      providerPaymentId: result.providerPaymentId,
      idempotencyKey: 'idem_1',
      amountKzt: 7_990,
    });
  });
});

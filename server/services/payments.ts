/**
 * Provider-agnostic payment integration layer.
 *
 * Only two adapters exist:
 *  - `demo`   — an explicitly labelled local simulation, available even in
 *               production when PAYMENT_PROVIDER=demo. It never moves money.
 *  - `stripe` — Checkout Sessions over the REST API with signed webhooks.
 *
 * No card number, CVV or other sensitive card data is ever received, parsed or
 * stored here. Demo card validation lives in services/demoCard.ts and persists
 * metadata only.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  PAYMENT_PROVIDERS,
  SUBSCRIPTION_PLAN_CODE,
  SUBSCRIPTION_PRICE_MINOR,
  type PaymentProviderName,
} from '../lib/constants.js';
import { webhookEnvelopeSchema } from '../lib/validation.js';

export type NormalizedEventType = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'payment.pending';

export interface NormalizedPaymentEvent {
  provider: PaymentProviderName;
  eventId: string;
  type: NormalizedEventType;
  transactionId?: string;
  providerPaymentId?: string;
  reason?: string;
  amountMinor?: number;
  currency?: string;
}

export interface CheckoutInput {
  transactionId: string;
  idempotencyKey: string;
  amountKzt: number;
  storeId: string;
  userId: string;
}

export interface CheckoutResult {
  providerPaymentId: string;
  checkoutUrl: string;
}

export interface DemoTicket {
  transactionId: string;
  providerPaymentId: string;
  idempotencyKey: string;
  amountKzt: number;
}

export class PaymentError extends Error {}
export class PaymentConfigurationError extends PaymentError {}
export class PaymentProviderError extends PaymentError {}
export class PaymentVerificationError extends PaymentError {}

const JWT_SECRET = process.env.JWT_SECRET || 'wishstock-insecure-development-secret';
const STRIPE_API = 'https://api.stripe.com/v1';

/** Only the request URL is needed to recover the active local origin. */
export interface AppOriginRequest {
  url?: string;
}

function parseConfiguredOrigin(value: string | undefined | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Local development may be served on a different port than an older APP_URL.
 * Only loopback HTTP request URLs are trusted, and production never falls back
 * to request-supplied origins.
 */
function readRequestOrigin(request?: AppOriginRequest): URL | null {
  if (!request?.url || process.env.NODE_ENV === 'production') return null;
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'http:' || !isLoopbackHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Resolves the origin used in checkout redirects and provider return URLs. */
export function resolveAppOrigin(request?: AppOriginRequest): string | null {
  const configured = parseConfiguredOrigin(process.env.APP_URL);
  if (!configured) return readRequestOrigin(request)?.origin ?? null;

  if (process.env.NODE_ENV === 'production') {
    return configured.protocol === 'https:' && !isLoopbackHost(configured.hostname) ? configured.origin : null;
  }
  // A locally configured APP_URL can be stale (for example the old Vite port),
  // so the validated loopback request origin wins during development.
  if (isLoopbackHost(configured.hostname)) {
    return readRequestOrigin(request)?.origin ?? configured.origin;
  }
  return configured.origin;
}

export function configuredProvider(): PaymentProviderName {
  const value = (process.env.PAYMENT_PROVIDER ?? 'demo').trim().toLowerCase();
  return PAYMENT_PROVIDERS.includes(value as PaymentProviderName) ? (value as PaymentProviderName) : 'demo';
}

/**
 * The demo flow is enabled when the configured provider is the built-in demo
 * adapter, including in production. It is always presented as a test with no
 * real charge. When a real provider is configured the demo flow is switched off
 * so a simulation can never be mistaken for a live transaction.
 */
export function isDemoAllowed(): boolean {
  return configuredProvider() === 'demo';
}

export function demoWebhookSecret(): string {
  return process.env.PAYMENT_DEMO_WEBHOOK_SECRET || JWT_SECRET;
}

export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(actual.trim().toLowerCase().replace(/^sha256=/, ''));
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** HMAC signature used by the demo webhook simulator. */
export function verifySignature(secret: string, payload: string, signature: string | undefined | null): boolean {
  if (!secret || !signature) return false;
  return safeEqualHex(signPayload(secret, payload), signature);
}

/** Stripe signs `${timestamp}.${rawBody}` with the endpoint secret. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined | null,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const seconds = Number(timestamp);
  // Five-minute tolerance, matching Stripe's recommended replay window.
  if (!Number.isFinite(seconds) || Math.abs(nowMs / 1000 - seconds) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signatures.some((signature) => safeEqualHex(expected, signature));
}

export function createDemoTicket(ticket: DemoTicket): string {
  return jwt.sign({ ...ticket, purpose: 'wishstock-demo-checkout' }, JWT_SECRET, { expiresIn: '15m' });
}

export function verifyDemoTicket(token: string): DemoTicket | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & Partial<DemoTicket>;
    if (payload.purpose !== 'wishstock-demo-checkout') return null;
    if (!payload.transactionId || !payload.providerPaymentId || !payload.idempotencyKey || !payload.amountKzt) return null;
    return {
      transactionId: String(payload.transactionId),
      providerPaymentId: String(payload.providerPaymentId),
      idempotencyKey: String(payload.idempotencyKey),
      amountKzt: Number(payload.amountKzt),
    };
  } catch {
    return null;
  }
}

export async function createCheckout(
  provider: PaymentProviderName,
  input: CheckoutInput,
  request?: AppOriginRequest,
): Promise<CheckoutResult> {
  if (provider === 'demo') return createDemoCheckout(input, request);
  return createStripeCheckout(input, request);
}

function createDemoCheckout(input: CheckoutInput, request?: AppOriginRequest): CheckoutResult {
  if (!isDemoAllowed()) {
    throw new PaymentConfigurationError('Demo checkout is not enabled for the configured provider');
  }
  const base = resolveAppOrigin(request);
  if (!base) throw new PaymentConfigurationError('APP_URL is not configured');
  const providerPaymentId = `demo_${randomUUID()}`;
  const ticket = createDemoTicket({
    transactionId: input.transactionId,
    providerPaymentId,
    idempotencyKey: input.idempotencyKey,
    amountKzt: input.amountKzt,
  });
  return {
    providerPaymentId,
    checkoutUrl: `${base}/billing/demo?token=${encodeURIComponent(ticket)}`,
  };
}

async function createStripeCheckout(input: CheckoutInput, request?: AppOriginRequest): Promise<CheckoutResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentConfigurationError('STRIPE_SECRET_KEY is not configured');
  const appUrl = resolveAppOrigin(request);
  if (!appUrl) throw new PaymentConfigurationError('APP_URL is not configured');

  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'kzt',
    'line_items[0][price_data][product_data][name]': 'WishStock Pro',
    'line_items[0][price_data][product_data][description]': '30 days of WishStock Pro access',
    'line_items[0][price_data][unit_amount]': String(SUBSCRIPTION_PRICE_MINOR),
    'line_items[0][quantity]': '1',
    success_url: `${appUrl}/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing?payment=cancelled`,
    client_reference_id: input.transactionId,
    'metadata[transactionId]': input.transactionId,
    'metadata[storeId]': input.storeId,
    'metadata[userId]': input.userId,
    'metadata[planCode]': SUBSCRIPTION_PLAN_CODE,
  });

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: form.toString(),
    });
  } catch {
    throw new PaymentProviderError('Payment provider is unreachable');
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = (data?.error as { message?: string } | undefined)?.message;
    throw new PaymentProviderError(message ?? 'Payment provider rejected the checkout');
  }
  if (typeof data.id !== 'string' || typeof data.url !== 'string') {
    throw new PaymentProviderError('Payment provider returned an invalid checkout session');
  }
  return { providerPaymentId: data.id, checkoutUrl: data.url };
}

function demoEventType(value: string): NormalizedEventType | null {
  const map: Record<string, NormalizedEventType> = {
    'payment.succeeded': 'payment.succeeded',
    'payment.failed': 'payment.failed',
    'payment.cancelled': 'payment.cancelled',
    'payment.pending': 'payment.pending',
    success: 'payment.succeeded',
    failure: 'payment.failed',
    failed: 'payment.failed',
    cancel: 'payment.cancelled',
    cancelled: 'payment.cancelled',
  };
  return map[value] ?? null;
}

/**
 * Verifies the raw webhook body and maps the provider payload to one internal
 * event. Throws on a bad signature; returns null for events we intentionally
 * ignore. Callers must never parse the body before signature verification.
 */
export function normalizeWebhook(
  provider: PaymentProviderName,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
): NormalizedPaymentEvent | null {
  const header = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  if (provider === 'demo') {
    if (!isDemoAllowed()) throw new PaymentVerificationError('Demo webhooks are not enabled for the configured provider');
    if (!verifySignature(demoWebhookSecret(), rawBody, header('x-wishstock-signature'))) {
      throw new PaymentVerificationError('Invalid demo webhook signature');
    }
    const envelope = webhookEnvelopeSchema.parse(JSON.parse(rawBody));
    const type = demoEventType(envelope.type);
    if (!type) return null;
    const transactionId = envelope.transactionId ?? envelope.data?.transactionId;
    const providerPaymentId = envelope.providerPaymentId ?? envelope.data?.providerPaymentId;
    if (!transactionId && !providerPaymentId) {
      throw new PaymentVerificationError('Webhook does not identify a transaction');
    }
    return {
      provider: 'demo',
      eventId: envelope.id,
      type,
      transactionId,
      providerPaymentId,
      reason: envelope.data?.reason ?? undefined,
    };
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!verifyStripeSignature(rawBody, header('stripe-signature'), secret)) {
    throw new PaymentVerificationError('Invalid Stripe webhook signature');
  }
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const object = (payload.data as { object?: Record<string, unknown> } | undefined)?.object ?? {};
  const eventType = String(payload.type ?? '');
  const metadata = (object.metadata ?? {}) as Record<string, string>;

  let type: NormalizedEventType | null = null;
  if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
    type = object.payment_status === 'paid' ? 'payment.succeeded' : 'payment.pending';
  } else if (eventType === 'checkout.session.async_payment_failed') {
    type = 'payment.failed';
  } else if (eventType === 'checkout.session.expired') {
    type = 'payment.cancelled';
  } else {
    return null;
  }

  const transactionId = metadata.transactionId ?? (typeof object.client_reference_id === 'string' ? object.client_reference_id : undefined);
  const providerPaymentId = typeof object.id === 'string' ? object.id : undefined;
  if (!transactionId && !providerPaymentId) {
    throw new PaymentVerificationError('Webhook does not identify a transaction');
  }
  if (type === 'payment.succeeded') {
    if (typeof object.amount_total === 'number' && object.amount_total !== SUBSCRIPTION_PRICE_MINOR) {
      throw new PaymentVerificationError('Webhook amount does not match the plan price');
    }
    if (typeof object.currency === 'string' && object.currency.toLowerCase() !== 'kzt') {
      throw new PaymentVerificationError('Webhook currency does not match the plan');
    }
  }
  return {
    provider: 'stripe',
    eventId: String(payload.id ?? ''),
    type,
    transactionId,
    providerPaymentId,
    currency: typeof object.currency === 'string' ? object.currency : undefined,
  };
}

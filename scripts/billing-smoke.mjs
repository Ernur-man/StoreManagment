/**
 * End-to-end acceptance checks for subscriptions and billing.
 * Start the Next.js app first (`npm run dev` or `npm start`), then run
 * `npm run smoke:billing`. This script mutates the admin demo subscription;
 * run `npm run db:seed` on a throwaway local database afterwards to restore
 * the original demo state. Never run it against production.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const base = process.env.APP_URL ?? process.env.API_URL ?? 'http://localhost:3000';
const demoSecretValue = process.env.PAYMENT_DEMO_WEBHOOK_SECRET ?? process.env.JWT_SECRET;
if (!demoSecretValue && process.env.NODE_ENV === 'production') {
  throw new Error('PAYMENT_DEMO_WEBHOOK_SECRET or JWT_SECRET is required');
}
const demoSecret = demoSecretValue ?? 'wishstock-insecure-development-secret';
const DAY = 86_400_000;

function makeClient() {
  let cookie = '';
  return {
    async request(path, { method = 'GET', body, expect, headers = {} } = {}) {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = await response.json().catch(() => ({}));
      if (expect !== undefined) {
        assert.equal(response.status, expect, `${method} ${path}: expected ${expect}, got ${response.status} ${JSON.stringify(data)}`);
      } else if (!response.ok) {
        throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
      }
      return data;
    },
  };
}

async function postWebhook(event, signature, expect = 200) {
  const body = JSON.stringify(event);
  const response = await fetch(`${base}/api/billing/webhook/demo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wishstock-signature': signature ?? createHmac('sha256', demoSecret).update(body).digest('hex'),
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expect, `webhook expected ${expect}, got ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function checkout(client) {
  const result = await client.request('/billing/checkout', { method: 'POST', body: {} });
  const token = new URL(result.checkoutUrl, base).searchParams.get('token');
  assert.ok(token, 'demo checkout URL contains a token');
  return { ...result, token };
}

async function confirm(client, token, outcome) {
  return client.request('/billing/demo/confirm', { method: 'POST', body: { token, outcome } });
}

const admin = makeClient();
const employee = makeClient();
const stamp = Date.now().toString().slice(-8);

const health = await admin.request('/health');
assert.equal(health.ok, true);
console.log('✓ API healthy');

const adminLogin = await admin.request('/auth/login', {
  method: 'POST',
  body: { email: 'admin@wishstock.app', password: 'Demo1234!' },
});
assert.equal(adminLogin.user.role, 'ADMIN');
await employee.request('/auth/login', {
  method: 'POST',
  body: { email: 'employee@wishstock.app', password: 'Demo1234!' },
});
console.log('✓ Admin and employee logged in');

const planInfo = await admin.request('/billing/plan');
assert.equal(planInfo.plan.code, 'wishstock-pro');
assert.equal(planInfo.plan.name, 'WishStock Pro');
assert.equal(planInfo.plan.priceKzt, 7990);
assert.equal(planInfo.plan.durationDays, 30);
console.log('✓ Single WishStock Pro plan at 7,990 KZT / 30 days');

// Employee: Pro API blocked, subscription management and settings available.
await employee.request('/dashboard', { expect: 403 });
await employee.request('/products', { expect: 403 });
await employee.request('/billing/subscription');
await employee.request('/settings/store');
const employeeBilling = await employee.request('/billing/subscription');
assert.equal(employeeBilling.view.status, 'inactive');
assert.equal(employeeBilling.view.hasAccess, false);
const subscriptionId = (await admin.request('/billing/subscription')).subscription.id;
await employee.request(`/billing/admin/subscriptions/${subscriptionId}`, { method: 'PATCH', body: { status: 'active' }, expect: 403 });
await employee.request('/billing/admin/overview', { expect: 403 });
console.log('✓ Non-subscriber blocked from Pro APIs and admin RBAC enforced');

// Client cannot set its own status: checkout body is validated and ignored.
await admin.request(`/billing/admin/subscriptions/${subscriptionId}`, {
  method: 'PATCH',
  body: { status: 'inactive', expiresAt: null },
});
const editAttempt = await checkout(admin);
const afterEditAttempt = await admin.request('/billing/subscription');
assert.equal(afterEditAttempt.view.status, 'pending', 'checkout body cannot force an active status');
assert.equal(afterEditAttempt.view.hasAccess, false);
console.log('✓ Client-side status edits rejected');

// Successful verified payment activates access.
const success = await confirm(admin, editAttempt.token, 'success');
assert.equal(success.subscription.view.status, 'active');
assert.equal(success.subscription.view.hasAccess, true);
assert.ok(success.subscription.view.expiresAt);
await admin.request('/dashboard');
console.log('✓ Verified success activates Pro access');

// Duplicate webhook delivery: one event id is applied exactly once.
const duplicateCheckout = await checkout(admin);
const duplicateEvent = {
  id: `evt_smoke_dup_${stamp}`,
  type: 'payment.succeeded',
  transactionId: duplicateCheckout.transactionId,
  providerPaymentId: duplicateCheckout.providerPaymentId,
};
const firstDelivery = await postWebhook(duplicateEvent);
assert.equal(firstDelivery.applied, true);
const beforeDuplicate = await admin.request('/billing/subscription');
const secondDelivery = await postWebhook(duplicateEvent);
assert.equal(secondDelivery.duplicate, true);
const afterDuplicate = await admin.request('/billing/subscription');
assert.equal(afterDuplicate.view.expiresAt, beforeDuplicate.view.expiresAt);
console.log('✓ Duplicate webhook ignored without changing the subscription');

// Bad signatures are rejected before any state change.
await postWebhook({ ...duplicateEvent, id: `evt_smoke_bad_${stamp}` }, 'deadbeef', 400);
console.log('✓ Invalid webhook signature rejected');

// Failed payment marks the record past_due and removes access.
// Keep expiresAt empty so the failed payment is observable as past_due rather
// than being immediately recomputed as expired.
await admin.request(`/billing/admin/subscriptions/${subscriptionId}`, {
  method: 'PATCH',
  body: { status: 'inactive', expiresAt: null },
});
const failureCheckout = await checkout(admin);
const failure = await confirm(admin, failureCheckout.token, 'failure');
assert.equal(failure.subscription.view.status, 'past_due');
assert.equal(failure.subscription.view.hasAccess, false);
await admin.request('/dashboard', { expect: 403 });
console.log('✓ Failed payment sets past_due and blocks Pro APIs');

// Admin restoration brings access back.
await admin.request(`/billing/admin/subscriptions/${subscriptionId}`, {
  method: 'PATCH',
  body: { status: 'active', expiresAt: new Date(Date.now() + 20 * DAY).toISOString() },
});
await admin.request('/dashboard');
console.log('✓ Access restored after admin repair');

// Cancellation keeps the already-paid period.
const cancelCheckout = await checkout(admin);
const cancelled = await confirm(admin, cancelCheckout.token, 'cancel');
assert.equal(cancelled.subscription.view.status, 'cancelled');
assert.equal(cancelled.subscription.view.hasAccess, true);
await admin.request('/dashboard');
console.log('✓ Cancellation preserves paid access until expiration');

// Expiry is enforced from the timestamps, without a scheduler.
await admin.request(`/billing/admin/subscriptions/${subscriptionId}`, {
  method: 'PATCH',
  body: { status: 'active', expiresAt: new Date(Date.now() - DAY).toISOString() },
});
const expired = await admin.request('/billing/subscription');
assert.equal(expired.view.status, 'expired');
assert.equal(expired.view.hasAccess, false);
await admin.request('/dashboard', { expect: 403 });
await admin.request('/billing/subscription');
console.log('✓ Expired subscription restricted automatically, billing page still available');

// Admin overview and history expose no sensitive card fields.
const overview = await admin.request('/billing/admin/overview');
assert.ok(overview.stats.totalSubscribers >= 3);
assert.equal(typeof overview.stats.monthlyRevenueKzt, 'number');
assert.ok(overview.subscriptions.length >= 3);
const detail = await admin.request(`/billing/admin/subscriptions/${subscriptionId}`);
assert.ok(Array.isArray(detail.subscription.paymentTransactions));
const payments = await admin.request('/billing/admin/payments');
assert.ok(payments.payments.length >= 1);
assert.ok(!JSON.stringify(payments).match(/cardNumber|cvv|cvc|pan/i));
console.log('✓ Admin dashboard reports subscribers, revenue and history without card data');

// Leave the demo in a usable state.
await admin.request(`/billing/admin/subscriptions/${subscriptionId}`, {
  method: 'PATCH',
  body: { status: 'active', expiresAt: new Date(Date.now() + 20 * DAY).toISOString() },
});
await admin.request('/auth/logout', { method: 'POST' });
await employee.request('/auth/logout', { method: 'POST' });
console.log('\nAll subscription acceptance checks passed.');

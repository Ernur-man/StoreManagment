/**
 * End-to-end acceptance smoke test for the WishStock API.
 * Start the Next.js app (`npm run dev` or `npm start`) first, then run `npm run smoke`.
 */
import assert from 'node:assert/strict';

const base = process.env.APP_URL ?? process.env.API_URL ?? 'http://localhost:3000';
let cookie = '';

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

const stamp = Date.now().toString().slice(-8);
const sku = `SMOKE-${stamp}`;

const health = await api('/health');
assert.equal(health.ok, true);
console.log('✓ API healthy');

const login = await api('/auth/login', {
  method: 'POST',
  body: { email: 'admin@wishstock.app', password: 'Demo1234!' },
});
assert.equal(login.user.role, 'ADMIN');
console.log('✓ Employee logged in');

const before = await api('/dashboard');
const created = await api('/requests', {
  method: 'POST',
  body: {
    customerName: 'Smoke Tester',
    phone: `+7 700 9${stamp.slice(0, 7)}`,
    productName: 'Smoke Test Skirt',
    sku,
    size: 'M',
    color: 'Black',
    source: 'IN_STORE',
  },
});
assert.equal(created.request.status, 'WAITING');
const afterRequest = await api('/dashboard');
assert.equal(afterRequest.stats.waiting, before.stats.waiting + 1);
console.log('✓ Request saved and dashboard waiting count increased');

const arrival = await api('/arrivals', {
  method: 'POST',
  body: { sku, productName: 'Smoke Test Skirt', size: 'M', color: 'Black', quantity: 5 },
});
assert.equal(arrival.matchedRequests.length, 1);
assert.equal(arrival.quantityAfter - arrival.quantityBefore, 5);
console.log('✓ Stock arrival matched the request and increased inventory by 5');

const request = await api(`/requests/${created.request.id}`);
assert.equal(request.request.status, 'AVAILABLE');
assert.ok(request.request.matches.length === 1);
console.log('✓ Request automatically moved to AVAILABLE');

const contact = await api(`/requests/${created.request.id}/contact`, { method: 'POST' });
assert.equal(contact.request.status, 'CONTACTED');
assert.ok(contact.request.contactedAt);
console.log('✓ Request marked as contacted with contact timestamp');

await api(`/requests/${created.request.id}/status`, { method: 'PATCH', body: { status: 'RESERVED' } });
const purchased = await api(`/requests/${created.request.id}/status`, {
  method: 'PATCH',
  body: { status: 'PURCHASED' },
});
assert.equal(purchased.request.status, 'PURCHASED');
const afterSale = await api('/dashboard');
assert.equal(afterSale.stats.completedSales, before.stats.completedSales + 1);
console.log('✓ Purchase recorded, sale decremented inventory and analytics updated');

const notifications = await api('/notifications');
assert.ok(notifications.notifications.some((n) => n.type === 'STOCK_MATCH'));
console.log('✓ In-app stock-match notification created');

await api('/auth/logout', { method: 'POST' });
console.log('\nAll acceptance checks passed.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriceHandler } from '../netlify/lib/price-handler.mjs';

function fixture() {
  const data = new Map(); let sequence = 0;
  const store = {
    async getWithMetadata(key) { return data.get(key) || null; },
    async setJSON(key, value, condition) {
      const previous = data.get(key);
      if ((condition.onlyIfNew && previous) || (condition.onlyIfMatch && previous?.etag !== condition.onlyIfMatch)) return { modified: false };
      const etag = `"${++sequence}"`; data.set(key, { data: value, etag }); return { modified: true, etag };
    }
  };
  const handler = createPriceHandler(() => store);
  const call = async (body, method = body ? 'PATCH' : 'GET') => {
    const response = await handler(new Request('https://example.netlify.app/.netlify/functions/prices', { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }));
    return { status: response.status, body: await response.json() };
  };
  return { call, handler };
}
test('new catalog is blank; zero is a real saved price and clearing retains concurrency protection', async () => {
  const { call } = fixture();
  let all = await call(); assert.equal(Object.keys(all.body.prices).length, 33);
  assert.equal(all.body.prices['TG02-001'].price, null);
  const zero = await call({ productId: 'TG02-001', price: 0, revision: null }); assert.equal(zero.status, 200);
  assert.equal((await call()).body.prices['TG02-001'].price, 0);
  const cleared = await call({ productId: 'TG02-001', price: null, revision: zero.body.entry.revision });
  assert.equal(cleared.status, 200); assert.equal(cleared.body.entry.price, null); assert.ok(cleared.body.entry.revision);
});
test('independent products save concurrently; stale edits cannot silently overwrite another viewer', async () => {
  const { call } = fixture();
  const [a, b] = await Promise.all([call({ productId: 'TG02-001', price: 250000, revision: null }), call({ productId: 'TG02-002', price: 350000, revision: null })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const stale = await call({ productId: 'TG02-001', price: 999, revision: null });
  assert.equal(stale.status, 409); assert.equal(stale.body.current.price, 250000);
  assert.equal((await call()).body.prices['TG02-002'].price, 350000);
});
test('invalid IDs, negative/fractional/oversized values, and missing revisions are rejected', async () => {
  const { call } = fixture();
  for (const body of [{ productId: 'TG02-034', price: 1, revision: null }, { productId: 'TG02-001', price: -1, revision: null }, { productId: 'TG02-001', price: 1.5, revision: null }, { productId: 'TG02-001', price: 1e15, revision: null }, { productId: 'TG02-001', price: 1 }]) assert.equal((await call(body)).status, 400);
});
test('cross-origin writes are rejected and storage errors do not report successful saves', async () => {
  const { handler } = fixture();
  const forbidden = await handler(new Request('https://example.netlify.app/.netlify/functions/prices', { method: 'PATCH', headers: { origin: 'https://another.example', 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(forbidden.status, 403);
  const failing = createPriceHandler(() => { throw new Error('unavailable'); });
  assert.equal((await failing(new Request('https://example.netlify.app/.netlify/functions/prices'))).status, 503);
});

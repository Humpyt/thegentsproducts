export const productIds = Array.from({ length: 33 }, (_, i) => `TG02-${String(i + 1).padStart(3, '0')}`);
const validIds = new Set(productIds);
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const entry = (blob) => blob ? { ...blob.data, revision: blob.etag } : { price: null, updatedAt: null, revision: null };

export function createPriceHandler(openStore) {
  return async function handle(request) {
    if (!['GET', 'PATCH'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed.' }, 403);
    let body;
    if (request.method === 'PATCH') {
      if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Send JSON.' }, 415);
      const text = await request.text();
      if (text.length > 2048) return json({ error: 'Request is too large.' }, 413);
      try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || !validIds.has(body.productId)) return json({ error: 'Unknown product.' }, 400);
      if (body.price !== null && (!Number.isSafeInteger(body.price) || body.price < 0 || body.price > 1_000_000_000_000)) {
        return json({ error: 'Enter a whole UGX amount from 0 to 1,000,000,000,000, or leave it blank.' }, 400);
      }
      if (body.revision !== null && (typeof body.revision !== 'string' || body.revision.length > 200)) {
        return json({ error: 'Refresh prices before saving.' }, 400);
      }
    }
    try {
      const store = openStore();
      if (request.method === 'GET') {
        const prices = Object.fromEntries(await Promise.all(productIds.map(async (id) => [id, entry(await store.getWithMetadata(`products/${id}`, { type: 'json' }))])));
        return json({ currency: 'UGX', prices });
      }
      const key = `products/${body.productId}`;
      const value = { price: body.price, updatedAt: new Date().toISOString() };
      const condition = body.revision === null ? { onlyIfNew: true } : { onlyIfMatch: body.revision };
      const result = await store.setJSON(key, value, condition);
      if (!result.modified) {
        return json({ error: 'This price changed in another session.', current: entry(await store.getWithMetadata(key, { type: 'json' })) }, 409);
      }
      return json({ productId: body.productId, currency: 'UGX', entry: { ...value, revision: result.etag } });
    } catch (error) {
      console.error('Price storage operation failed:', error?.name || 'Error');
      return json({ error: 'Shared price storage is unavailable. Please retry.' }, 503);
    }
  };
}

import catalog from '../../public/catalog.json' with { type: 'json' };
export const fields = { title: 200, category: 40, brand: 160, code: 200, colorCode: 200, sizes: 200, material: 1000, design: 3000, notes: 2000 };
export const categories = ['Suit', 'Blazer', 'Trousers', 'Shoes', 'Shirt', 'Accessories', 'Other'];
const base = new Map(catalog.products.map(p => [p.id, p]));
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
export const originalDetails = id => Object.fromEntries(Object.keys(fields).map(key => [key, base.get(id)?.[key] || '']));
export function validDetails(details) {
  return details && typeof details === 'object' && !Array.isArray(details) && Object.keys(details).length === Object.keys(fields).length && Object.entries(fields).every(([key, max]) => typeof details[key] === 'string' && details[key].length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(details[key])) && details.title.trim().length > 0 && categories.includes(details.category);
}
export function createProductHandler(openStore) {
  return async request => {
    if (!['GET', 'PATCH'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed.' }, 403);
    let body;
    if (request.method === 'PATCH') {
      if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Send JSON.' }, 415);
      const raw = await request.text();
      if (raw.length > 24000) return json({ error: 'Details are too long.' }, 413);
      try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || !base.has(body.productId) || !validDetails(body.details)) return json({ error: 'Check the product name, category and field lengths.' }, 400);
      if (body.revision !== null && (typeof body.revision !== 'string' || body.revision.length > 200)) return json({ error: 'Refresh product details before saving.' }, 400);
      body.details = Object.fromEntries(Object.keys(fields).map(key => [key, body.details[key].trim()]));
    }
    try {
      const store = openStore();
      const merge = (id, record) => ({ ...base.get(id), ...(record?.details || originalDetails(id)), detailsRevision: record?.revision || null, detailsUpdatedAt: record?.updatedAt || null });
      if (request.method === 'GET') {
        const records = await store.read();
        return json({ products: catalog.products.map(p => merge(p.id, records.get(p.id))) });
      }
      const saved = await store.save(body.productId, body.details, body.revision);
      if (!saved.modified) return json({ error: 'These details changed in another session. Review and save again to replace them.', current: merge(body.productId, saved.current) }, 409);
      return json({ product: merge(body.productId, saved.current) });
    } catch (error) {
      console.error('Product storage operation failed:', error?.name || 'Error');
      return json({ error: 'Product details could not be saved or loaded. Please retry.' }, 503);
    }
  };
}

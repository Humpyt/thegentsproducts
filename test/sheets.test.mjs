import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournalStore, foldJournal } from '../netlify/lib/sheets-store.mjs';

test('simultaneous children of one revision accept only the first append', async () => {
  const rows = [];
  const open = () => createJournalStore(async () => structuredClone(rows), async row => { rows.push(row); });
  const value = price => ({ price, updatedAt: '2026-10-22T00:00:00.000Z' });
  const results = await Promise.all([open().setJSON('products/TG02-001', value(250000), { onlyIfNew: true }), open().setJSON('products/TG02-001', value(300000), { onlyIfNew: true })]);
  assert.equal(results.filter(r => r.modified).length, 1);
  const saved = await open().getWithMetadata('products/TG02-001');
  assert.equal(saved.data.price, 250000);
  const clear = await open().setJSON('products/TG02-001', value(null), { onlyIfMatch: saved.etag });
  assert.equal(clear.modified, true);
  assert.equal((await open().getWithMetadata('products/TG02-001')).data.price, null);
  assert.equal((await open().setJSON('products/TG02-001', value(9), { onlyIfMatch: saved.etag })).modified, false);
});

test('journal ignores malformed rows, stale parents, and duplicate revisions; zero survives', () => {
  const { records } = foldJournal([
    ['now', 'TG02-001', 0, 'UGX', 'a', ''],
    ['now', 'TG02-001', 99, 'UGX', 'b', ''],
    ['now', 'TG02-001', 77, 'UGX', 'a', 'a'],
    ['now', 'TG02-034', 1, 'UGX', 'c', ''],
    ['now', 'TG02-002', -1, 'UGX', 'd', ''],
  ]);
  assert.equal(records.size, 1); assert.equal(records.get('products/TG02-001').data.price, 0);
});

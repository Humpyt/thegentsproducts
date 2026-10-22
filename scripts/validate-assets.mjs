import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'catalog.json'), 'utf8'));
if (catalog.products.length !== 33) throw new Error('Expected 33 products.');
for (const p of catalog.products) {
  for (const file of [p.image, p.preview, p.sourcePreview, `originals/${p.id}.jpg`]) await fs.access(path.join(root, file));
  if (JSON.stringify(p).match(/[A-Z]:\\/)) throw new Error('Local filesystem path in public metadata.');
}
for (const file of ['index.html', 'review.html', 'pricing.js', 'pricing.css', 'details.js', 'details.css', 'gallery.js', 'THE-GENTS-product-details.xlsx']) await fs.access(path.join(root, file));
if (await fs.readFile(path.join(root, 'index.html'), 'utf8') !== await fs.readFile(path.join(root, 'review.html'), 'utf8')) throw new Error('Gallery routes differ.');
console.log('Validated 33 products, all referenced assets, pricing scripts, and both gallery routes.');

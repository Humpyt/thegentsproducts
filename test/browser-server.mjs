import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPriceHandler } from '../netlify/lib/price-handler.mjs';
const root = path.resolve('public');
const records = new Map(); let serial = 0;
const handler = createPriceHandler(() => ({
  async getWithMetadata(key) { return records.get(key) || null; },
  async setJSON(key, data, options) {
    const current = records.get(key);
    if ((options.onlyIfNew && current) || (options.onlyIfMatch && current?.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = `"${++serial}"`; records.set(key, { data, etag }); return { modified: true, etag };
  }
}));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/.netlify/functions/prices') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const options = { method: request.method, headers: request.headers };
      if (!['GET', 'HEAD'].includes(request.method)) options.body = Buffer.concat(chunks);
      const result = await handler(new Request('http://' + request.headers.host + request.url, options));
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer())); return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const body = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(0, '127.0.0.1', () => console.log('Browser test server: http://127.0.0.1:' + server.address().port));

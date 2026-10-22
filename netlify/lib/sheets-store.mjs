import { createSign, randomUUID } from 'node:crypto';

let cachedToken;
let tokenPending;
async function serviceToken(credentials, fetcher) {
  if (cachedToken?.email === credentials.client_email && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const signer = createSign('RSA-SHA256'); signer.update(unsigned);
    const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Google authentication unavailable');
    const result = await response.json();
    if (!result.access_token) throw new Error('Google access token missing');
    cachedToken = { email: credentials.client_email, token: result.access_token, expires: Date.now() + result.expires_in * 1000 };
    return cachedToken.token;
  })();
  try { return await tokenPending; } finally { tokenPending = null; }
}

// Append order is the journal order. Only the first child of a revision is
// accepted, so two simultaneous viewers cannot silently replace each other.
export function foldJournal(rows) {
  const records = new Map(); const accepted = new Set();
  for (const row of rows) {
    const [updatedAt, id, raw, currency, revision, parent = ''] = row;
    if (!/^TG02-0(0[1-9]|[12]\d|3[0-3])$/.test(id || '') || currency !== 'UGX' || !revision || accepted.has(revision)) continue;
    const price = raw === '' || raw === undefined || raw === 'CLEARED' ? null : Number(raw);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1e12)) continue;
    if ((records.get(`products/${id}`)?.etag || '') !== parent) continue;
    records.set(`products/${id}`, { data: { price, updatedAt }, etag: revision }); accepted.add(revision);
  }
  return { records, accepted };
}

// This formula makes the same accepted/conflict decision visible in the sheet.
export const acceptedFormula = '=ARRAYFORMULA(IF(INDEX(F:F,ROW())=IFERROR(LOOKUP(2,1/((INDIRECT("B1:B"&(ROW()-1))=INDEX(B:B,ROW()))*(INDIRECT("G1:G"&(ROW()-1))="ACCEPTED")),INDIRECT("E1:E"&(ROW()-1))),""),"ACCEPTED","CONFLICT"))';

export function createJournalStore(readRows, appendRow) {
  let snapshot;
  const read = async (fresh = false) => {
    if (fresh || !snapshot) snapshot = readRows().then(foldJournal);
    return snapshot;
  };
  return {
    async getWithMetadata(key) { return (await read()).records.get(key) || null; },
    async setJSON(key, data, condition) {
      const before = (await read(true)).records.get(key);
      if ((condition.onlyIfNew && before) || (condition.onlyIfMatch && before?.etag !== condition.onlyIfMatch)) return { modified: false };
      const revision = randomUUID();
      await appendRow([data.updatedAt, key.slice('products/'.length), data.price ?? 'CLEARED', 'UGX', revision, before?.etag || '', acceptedFormula]);
      const after = await read(true);
      return { modified: after.accepted.has(revision), etag: revision };
    }
  };
}

export function createSheetsStore({ spreadsheetId = process.env.GOOGLE_SHEET_ID, credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'), fetcher = fetch } = {}) {
  if (!spreadsheetId || !credentials.client_email || !credentials.private_key) throw new Error('Google Sheets configuration missing');
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/`;
  async function api(suffix, options = {}) {
    const token = await serviceToken(credentials, fetcher);
    const response = await fetcher(base + suffix, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Google Sheets request failed (${response.status})`);
    return response.json();
  }
  return createJournalStore(
    async () => (await api(encodeURIComponent('Price entries!A2:F') + '?valueRenderOption=UNFORMATTED_VALUE')).values || [],
    row => api(encodeURIComponent('Price entries!A:G') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [row] }) })
  );
}

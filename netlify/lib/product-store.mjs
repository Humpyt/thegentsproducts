import { randomUUID } from 'node:crypto';
import { createSheetsApi } from './sheets-store.mjs';
import { fields, validDetails } from './product-handler.mjs';
export const detailResultFormula = '=ARRAYFORMULA(IF(INDEX(D:D,ROW())=IFERROR(LOOKUP(2,1/((INDIRECT("B1:B"&(ROW()-1))=INDEX(B:B,ROW()))*(INDIRECT("N1:N"&(ROW()-1))="ACCEPTED")),INDIRECT("C1:C"&(ROW()-1))),""),"ACCEPTED","CONFLICT"))';
export function foldDetails(rows) {
  const records = new Map(); const accepted = new Set();
  for (const row of rows) {
    const [updatedAt, id, revision, parent = '', ...values] = row;
    if (!/^TG02-0(0[1-9]|[12]\d|3[0-3])$/.test(id || '') || !revision || accepted.has(revision)) continue;
    const details = Object.fromEntries(Object.keys(fields).map((key, i) => [key, values[i] ?? '']));
    if (!validDetails(details) || (records.get(id)?.revision || '') !== parent) continue;
    records.set(id, { details, updatedAt, revision }); accepted.add(revision);
  }
  return { records, accepted };
}
export function createDetailJournal(readRows, appendRow) {
  return {
    async read() { return foldDetails(await readRows()).records; },
    async save(id, details, previous) {
      const before = (await this.read()).get(id);
      if ((before?.revision || null) !== previous) return { modified: false, current: before };
      const revision = randomUUID(); const updatedAt = new Date().toISOString();
      await appendRow([updatedAt, id, revision, previous || '', ...Object.keys(fields).map(key => details[key]), detailResultFormula]);
      const after = foldDetails(await readRows());
      return { modified: after.accepted.has(revision), current: after.accepted.has(revision) ? { details, updatedAt, revision } : after.records.get(id) };
    }
  };
}
export function createProductStore(options = {}) {
  const api = createSheetsApi(options);
  return createDetailJournal(
    async () => (await api(encodeURIComponent('Detail entries!A2:M') + '?valueRenderOption=UNFORMATTED_VALUE')).values || [],
    // Force submitted text to literal strings; only our result column is a formula.
    row => api(encodeURIComponent('Detail entries!A:N') + ':append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE', { method: 'POST', body: JSON.stringify({ values: [row.map((value, i) => i === 13 ? value : `'${value}`)] }) })
  );
}

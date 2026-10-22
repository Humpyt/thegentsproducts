(() => {
  const endpoint = '/.netlify/functions/prices';
  const storageKey = 'the-gents-shared-price-cache-v1';
  const draftKey = 'the-gents-price-drafts-v1';
  const money = new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 });
  const blank = () => ({ price: null, revision: null, updatedAt: null });
  const readLocal = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } };
  const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Shared saving still works without local storage. */ } };
  const state = { entries: readLocal(storageKey), drafts: readLocal(draftKey), rows: new Map(), loaded: false, refreshing: false };
  let products = [];
  const header = document.querySelector('header');
  const explanation = document.createElement('p');
  explanation.className = 'pricing-explanation';
  explanation.textContent = 'Enter product prices in UGX. Each saved price goes to The Gents Google Sheet and is shared with everyone using this link. Leave a price blank and save to clear it.';
  header.append(explanation);
  const toolbar = document.createElement('div');
  toolbar.className = 'pricing-toolbar';
  toolbar.innerHTML = '<button type="button" id="export-prices" disabled>Export saved prices (CSV)</button><button type="button" id="refresh-prices">Refresh prices</button><span id="priced-count"></span><p id="pricing-status" role="status" aria-live="polite">Connecting to shared prices...</p>';
  header.append(toolbar);
  const status = document.getElementById('pricing-status');
  const exportButton = document.getElementById('export-prices');
  const refreshButton = document.getElementById('refresh-prices');

  function updateCount() {
    const count = products.filter(p => state.entries[p.id]?.price !== null && state.entries[p.id]?.price !== undefined).length;
    document.getElementById('priced-count').textContent = `${count} of ${products.length} products priced`;
  }
  function rowStatus(row, text, kind = '') { row.status.textContent = text; row.status.dataset.state = kind; }
  function display(id) {
    const row = state.rows.get(id);
    const value = state.entries[id] || blank();
    if (!row.dirty && document.activeElement !== row.input) {
      row.input.value = value.price === null ? '' : String(value.price);
      rowStatus(row, value.price === null ? 'Not priced yet' : `Saved: ${money.format(value.price)}`);
    }
    row.button.disabled = !state.loaded || row.busy;
  }
  async function request(options) {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', ...options });
    let data;
    try { data = await response.json(); } catch { throw new Error('Cannot connect to shared prices. Please retry.'); }
    return { response, data };
  }
  async function refresh(quiet = false) {
    if (state.refreshing) return;
    state.refreshing = true;
    refreshButton.disabled = true;
    if (!quiet) status.textContent = 'Loading shared prices...';
    try {
      const { response, data } = await request();
      if (!response.ok || !data.prices) throw new Error(data.error || 'Cannot load prices.');
      for (const [id, row] of state.rows) {
        if (!row.dirty && !row.busy && document.activeElement !== row.input) state.entries[id] = data.prices[id] || blank();
      }
      state.loaded = true;
      writeLocal(storageKey, state.entries);
      for (const id of state.rows.keys()) display(id);
      updateCount();
      exportButton.disabled = false;
      status.textContent = 'Google Sheet connected. Save each entry when it is ready.';
    } catch (error) {
      status.textContent = `${error.message} Unsaved entries remain in the fields.`;
    } finally { state.refreshing = false; refreshButton.disabled = false; }
  }
  async function save(id) {
    const row = state.rows.get(id);
    if (!state.loaded || row.busy || !row.input.reportValidity()) return;
    const raw = row.input.value.trim();
    const price = raw === '' ? null : Number(raw);
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000_000)) {
      rowStatus(row, 'Enter a valid whole UGX amount.', 'error'); return;
    }
    row.busy = true; row.input.disabled = true; row.button.disabled = true;
    rowStatus(row, 'Saving...');
    try {
      const { response, data } = await request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: id, price, revision: (state.entries[id] || blank()).revision }) });
      if (response.status === 409) {
        state.entries[id] = data.current || blank();
        const current = data.current?.price === null ? 'not set' : money.format(data.current.price);
        rowStatus(row, `Changed by another viewer (now ${current}). Your entry is unsaved. Save again to replace it.`, 'error');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Price was not saved.');
      state.entries[id] = data.entry;
      row.dirty = false;
      delete state.drafts[id];
      writeLocal(storageKey, state.entries); writeLocal(draftKey, state.drafts);
      rowStatus(row, price === null ? 'Price cleared' : `Saved: ${money.format(price)}`);
      updateCount();
    } catch (error) { rowStatus(row, `${error.message} Your entry is not saved.`, 'error'); }
    finally { row.busy = false; row.input.disabled = false; row.button.disabled = !state.loaded; }
  }
  function mount(p) {
    const article = [...document.querySelectorAll('article')].find(a => a.querySelector('.image span')?.textContent.trim() === p.id);
    if (!article) throw new Error(`Missing product card: ${p.id}`);
    const form = document.createElement('form');
    form.className = 'price-form'; form.dataset.productId = p.id;
    form.innerHTML = `<label for="price-${p.id}">Price (UGX)</label><div class="price-controls"><input id="price-${p.id}" name="price" type="number" inputmode="numeric" min="0" max="1000000000000" step="1" placeholder="Enter price" aria-label="Price for ${p.id} in UGX"><button type="submit" disabled>Save price</button></div><p class="price-status" role="status" aria-live="polite"></p>`;
    article.querySelector('.save').before(form);
    const row = { form, input: form.querySelector('input'), button: form.querySelector('button'), status: form.querySelector('.price-status'), dirty: Object.hasOwn(state.drafts, p.id), busy: false };
    state.rows.set(p.id, row);
    row.input.value = row.dirty ? state.drafts[p.id] : ((state.entries[p.id] || blank()).price ?? '');
    if (row.dirty) rowStatus(row, 'Unsaved draft', 'dirty'); else display(p.id);
    row.input.addEventListener('input', () => {
      row.dirty = true; state.drafts[p.id] = row.input.value; writeLocal(draftKey, state.drafts);
      rowStatus(row, 'Unsaved entry', 'dirty');
    });
    form.addEventListener('submit', event => { event.preventDefault(); save(p.id); });
  }
  const csvCell = value => {
    let text = String(value ?? '');
    if (/^[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const { response, data } = await request();
      if (!response.ok) throw new Error(data.error || 'Cannot export prices.');
      const rows = [['Product ID', 'Product', 'Brand', 'Product code', 'Sizes photographed', 'Currency', 'Price', 'Updated at'], ...products.map(p => [p.id, p.title, p.brand, p.code, p.sizes, 'UGX', data.prices[p.id]?.price ?? '', data.prices[p.id]?.updatedAt ?? ''])];
      const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `THE-GENTS-prices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Saved prices exported. Unsaved entries are not included.';
    } catch (error) { status.textContent = error.message; }
    finally { exportButton.disabled = !state.loaded; }
  });
  refreshButton.addEventListener('click', () => refresh());
  fetch('catalog.json').then(response => { if (!response.ok) throw new Error('Cannot load the product list.'); return response.json(); }).then(data => {
    products = data.products;
    products.forEach(mount); updateCount(); refresh();
    setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 30000);
    window.addEventListener('focus', () => refresh(true));
  }).catch(error => { status.textContent = error.message; });
})();

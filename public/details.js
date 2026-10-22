(() => {
  const endpoint = '/.netlify/functions/products';
  const specs = [['title','Product name',200],['category','Category',40],['brand','Brand',160],['code','Product code',200],['colorCode','Colour / label',200],['sizes','Sizes',200],['material','Fabric / material',1000],['design','Description',3000],['notes','Notes',2000]];
  const categories = ['Suit','Blazer','Trousers','Shoes','Shirt','Accessories','Other'];
  const rows = new Map(); const draftKey = 'the-gents-detail-drafts-v1';
  let drafts; try { drafts = JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { drafts = {}; }
  const persist = () => { try { localStorage.setItem(draftKey, JSON.stringify(drafts)); } catch {} };
  const extract = row => Object.fromEntries(specs.map(([key]) => [key, row.inputs[key].value]));
  const announce = () => window.dispatchEvent(new CustomEvent('catalog:updated', { detail: { products: [...rows.values()].map(row => row.product) } }));
  const info = document.createElement('p'); info.className = 'detail-explanation'; info.setAttribute('role','status');
  info.textContent = 'Loading shared product details…'; document.querySelector('header').append(info);
  async function request(options) {
    const response = await fetch(endpoint, { cache:'no-store', credentials:'same-origin', ...options });
    const data = await response.json(); return { response, data };
  }
  function render(row, keepStatus = false) {
    const p = row.product; const article = row.article;
    article.querySelector('h2').textContent = p.title;
    article.querySelector('.brand').textContent = p.brand || 'Brand not specified';
    article.querySelector('.image img').alt = p.title;
    const dl = article.querySelector('dl'); dl.replaceChildren();
    for (const [label, value] of [['Category',p.category],['Product code',p.code],['Colour / label',p.colorCode],['Sizes',p.sizes],['Fabric / material',p.material]]) {
      const dt = document.createElement('dt');dt.textContent = label;
      const dd = document.createElement('dd');dd.textContent = value || 'Not specified';dl.append(dt,dd);
    }
    row.description.textContent = p.design; row.description.hidden = !p.design;
    row.note.textContent = p.notes; row.note.hidden = !p.notes;
    article.dataset.category = p.category;
    article.dataset.search = [p.id,...specs.map(([key])=>p[key] || '')].join(' ').toLowerCase();
    if (!row.dirty && !row.busy) {
      specs.forEach(([key]) => { row.inputs[key].value = p[key] || ''; });
      row.revision = p.detailsRevision;
      if (!keepStatus) { row.status.textContent = p.detailsUpdatedAt ? 'Saved to Google Sheet' : 'Original product details'; row.status.dataset.state = ''; }
    }
  }
  async function save(row) {
    if(row.busy || !row.form.reportValidity()) return;
    row.busy = true; row.fieldset.disabled = true; row.status.textContent = 'Saving details…';
    try {
      const {response,data} = await request({method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:row.product.id,details:extract(row),revision:row.revision})});
      if(response.status === 409) {
        row.product = data.current; row.revision = data.current.detailsRevision;
        drafts[row.product.id] = {fields:extract(row),revision:row.revision};persist();render(row);announce();
        row.status.textContent = 'Another viewer changed these details. Your entries are unsaved. Compare the current card above, then save again to replace them.';row.status.dataset.state = 'error';return;
      }
      if(!response.ok) throw new Error(data.error || 'Details were not saved.');
      row.product = data.product; row.dirty = false; delete drafts[row.product.id];persist();
      row.status.textContent = 'Saved to Google Sheet';row.status.dataset.state = '';
    } catch(error) { row.status.textContent = `${error.message} Your draft is kept.`;row.status.dataset.state = 'error'; }
    finally { row.busy = false;row.fieldset.disabled = false;render(row, true);announce(); }
  }
  function mount(p) {
    const article = [...document.querySelectorAll('article')].find(a=>a.querySelector('.image span')?.textContent.trim()===p.id);
    const editor = document.createElement('details');editor.className = 'detail-editor';
    const summary = document.createElement('summary');summary.textContent = 'Edit product details';editor.append(summary);
    const form = document.createElement('form');const fieldset = document.createElement('fieldset');fieldset.className = 'detail-fields';
    const legend = document.createElement('legend');legend.textContent = `Edit ${p.id}`;fieldset.append(legend);
    const row = {article,editor,form,fieldset,inputs:{},product:p,revision:p.detailsRevision,dirty:false,busy:false};
    for(const [key,label,max] of specs) {
      const wrap = document.createElement('label');wrap.textContent = label;
      const input = document.createElement(key==='category'?'select':['material','design','notes'].includes(key)?'textarea':'input');
      input.name = key;input.id = `${p.id}-${key}`;input.maxLength = max;
      if(key==='category') for(const value of categories){const option = document.createElement('option');option.value = value;option.textContent = value;input.append(option);}
      else if(key==='title') input.required = true;
      if(input.tagName==='TEXTAREA') input.rows = key==='design'?4:2;
      wrap.htmlFor = input.id;wrap.append(input);fieldset.append(wrap);row.inputs[key] = input;
      input.addEventListener('input',()=>{row.dirty = true;drafts[p.id] = {fields:extract(row),revision:row.revision};persist();row.status.textContent = 'Unsaved details';row.status.dataset.state = 'dirty';});
    }
    const actions = document.createElement('div');actions.className = 'detail-actions';
    const saveButton = document.createElement('button');saveButton.type = 'submit';saveButton.textContent = 'Save details';
    const cancel = document.createElement('button');cancel.type = 'button';cancel.textContent = 'Discard draft';
    cancel.addEventListener('click',()=>{row.dirty = false;delete drafts[p.id];persist();render(row);});
    actions.append(saveButton,cancel);fieldset.append(actions);form.append(fieldset);
    row.status = document.createElement('p');row.status.className = 'detail-status';row.status.setAttribute('role','status');row.status.setAttribute('aria-live','polite');form.append(row.status);editor.append(form);
    row.description = document.createElement('p');row.description.className = 'product-description';
    row.note = article.querySelector('.note') || document.createElement('p');row.note.className = 'note';
    article.querySelector('dl').after(row.description,row.note,editor);
    rows.set(p.id,row);render(row);
    if(drafts[p.id]?.fields){row.dirty = true;row.revision = drafts[p.id].revision;specs.forEach(([key])=>{row.inputs[key].value = drafts[p.id].fields[key] ?? '';});row.status.textContent = 'Unsaved draft restored';row.status.dataset.state = 'dirty';editor.open = true;}
    form.addEventListener('submit',event=>{event.preventDefault();save(row);});
  }
  window.gentsCatalog = request().then(({response,data})=>{
    if(!response.ok || !data.products) throw new Error(data.error || 'Cannot load shared product details.');
    data.products.forEach(mount);announce();
    info.textContent = 'Use “Edit product details” on any card. Saved changes are shared with all viewers and recorded in Google Sheets.';
    const refresh = async()=>{if(document.visibilityState!=='visible')return;try{const {response,data}=await request();if(!response.ok)throw new Error();for(const p of data.products){const row=rows.get(p.id);if(!row.busy){row.product=p;render(row);}}announce();}catch{info.textContent='Product details could not refresh. Your unsaved drafts are kept.';}};
    setInterval(refresh,60000);window.addEventListener('focus',refresh);
    return data;
  }).catch(error=>{info.textContent=`${error.message} Reload to retry.`;throw error;});
})();

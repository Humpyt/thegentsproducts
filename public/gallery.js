const controls=['search','category'].map(id=>document.getElementById(id));function filter(){const[q,c]=controls.map(e=>e.value.toLowerCase());let n=0;document.querySelectorAll('article').forEach(a=>{const ok=(!q||a.dataset.search.includes(q))&&(!c||a.dataset.category.toLowerCase()===c);a.hidden=!ok;if(ok)n++});document.getElementById('count').textContent=n+' products'}controls.forEach(e=>e.addEventListener('input',filter));
window.addEventListener('catalog:updated',({detail:{products}})=>{
  const select=document.getElementById('category');const current=select.value;
  select.replaceChildren(new Option('All categories',''),...['Suit','Blazer','Trousers','Shoes','Shirt','Accessories','Other'].map(c=>new Option(c,c)));select.value=current;
  const counts=new Map();for(const p of products)counts.set(p.category,(counts.get(p.category)||0)+1);
  document.querySelector('header>p').textContent=`${products.length} products · `+[...counts].map(([category,count])=>`${count} ${category.toLowerCase()}`).join(' · ');
  filter();
});

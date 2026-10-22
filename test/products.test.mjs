import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductHandler, originalDetails} from '../netlify/lib/product-handler.mjs';
import {createDetailJournal, foldDetails} from '../netlify/lib/product-store.mjs';
function fixture(){
  const rows=[];const open=()=>createDetailJournal(async()=>structuredClone(rows),async row=>{rows.push(row);});
  const handler=createProductHandler(open);
  const call=async body=>{const r=await handler(new Request('https://example.com/.netlify/functions/products',{method:body?'PATCH':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}));return{status:r.status,body:await r.json()};};
  return{rows,call,handler,open};
}
test('detail edits persist without changing price, product ID or image paths; blanks remain blank',async()=>{
  const {call}=fixture();const before=(await call()).body.products[0];
  const details={...originalDetails(before.id),brand:'',code:'00123',notes:'=SUM(1,2)',title:'Updated product',design:'Line one\nLine two'};
  const result=await call({productId:before.id,revision:null,details});assert.equal(result.status,200);
  const after=(await call()).body.products[0];assert.equal(after.brand,'');assert.equal(after.code,'00123');assert.equal(after.notes,'=SUM(1,2)');assert.equal(after.image,before.image);assert.equal(after.id,before.id);assert.ok(after.detailsRevision);
  assert.equal((await call({productId:before.id,revision:null,details})).status,409);
});
test('simultaneous detail edits accept one child, and a later correction accepts its revision',async()=>{
  const {open}=fixture();const id='TG02-002';const details=originalDetails(id);
  const result=await Promise.all([open().save(id,{...details,title:'A'},null),open().save(id,{...details,title:'B'},null)]);
  assert.equal(result.filter(x=>x.modified).length,1);
  const current=(await open().read()).get(id);assert.equal(current.details.title,'A');
  assert.equal((await open().save(id,details,current.revision)).modified,true);
});
test('invalid fields, empty name, unexpected keys, image replacement and invalid category are rejected',async()=>{
  const {call}=fixture();const details=originalDetails('TG02-001');
  for(const d of [{...details,title:''},{...details,title:'a'.repeat(201)},{...details,category:'Invalid'},{...details,image:'https://other.example/image.jpg'},{...details,notes:12}])assert.equal((await call({productId:'TG02-001',revision:null,details:d})).status,400);
  assert.equal((await call({productId:'TG02-999',revision:null,details})).status,400);
  const invalid=foldDetails([['now','TG02-001','revision','',...Object.values({...details,title:''})]]);assert.equal(invalid.records.size,0);
});
test('cross-origin requests and failed storage never confirm a saved detail edit',async()=>{
  const {handler}=fixture();const r=await handler(new Request('https://example.com/api',{headers:{origin:'https://other.example'}}));assert.equal(r.status,403);
  const failed=createProductHandler(()=>{throw new Error('offline');});assert.equal((await failed(new Request('https://example.com/api'))).status,503);
});

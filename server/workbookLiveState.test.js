import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLiveState,applyLiveBatch,liveResponse,normalizeLiveBook} from './workbookLiveState.js';
import {WorkbookLiveStore} from './workbookLiveStore.js';

const number=value=>({kind:'number',value});
const book=()=>({sheets:[{id:'sheet1',name:'Лист 1',cells:{A1:{content:number(10),fill:null}}}]});
const patch=(id,address,value,baseVersion=0,property='content')=>({id,type:'patch',changes:[{sheetId:'sheet1',address,property,value,baseVersion}]});
test('different cells and independent properties merge while an overlapping batch stays atomic',()=>{
  const initial=createLiveState(book(),'source'),a=applyLiveBatch(initial,'teacher:a',patch('one','A1',number(20))).state;
  const b=applyLiveBatch(a,'student:a',patch('two','A1',0xff0000,0,'fill')).state;
  assert.deepEqual(b.book.sheets[0].cells.A1,{content:number(20),fill:0xff0000});
  const input=patch('three','A1',number(30));input.changes.push({...input.changes[0],address:'B1'});
  const conflict=applyLiveBatch(b,'student:a',input);assert.ok(conflict.conflict);assert.equal(conflict.state,b);assert.equal(conflict.state.book.sheets[0].cells.B1,undefined);
});
test('same value retries are idempotent and reused command ids reject different data',()=>{
  const before=createLiveState(book(),'source'),one=applyLiveBatch(before,'a',patch('one','A1',number(20))).state;
  const duplicate=applyLiveBatch(one,'a',patch('one','A1',number(20)));assert.ok(duplicate.duplicate);assert.equal(duplicate.state.revision,1);
  assert.throws(()=>applyLiveBatch(one,'a',patch('one','A1',number(21))),{status:409});assert.equal(before.book.sheets[0].cells.A1.content.value,10);
});
test('delete and fill resets are sparse; deleted cells retain their conflict version',()=>{
  let state=createLiveState(book(),'source');state=applyLiveBatch(state,'a',patch('one','A1',{kind:'empty'})).state;
  assert.deepEqual(state.book.sheets[0].cells,{});
  assert.ok(applyLiveBatch(state,'b',patch('stale','A1',number(99))).conflict);
});
test('structural replacement requires a current revision and protects formerly empty cells',()=>{
  let state=createLiveState(book(),'source');const replacement=book();replacement.sheets[0].cells.A2=replacement.sheets[0].cells.A1;delete replacement.sheets[0].cells.A1;
  state=applyLiveBatch(state,'a',{id:'insert',type:'replace',baseRevision:0,book:replacement}).state;
  assert.equal(state.structureRevision,1);assert.ok(applyLiveBatch(state,'b',patch('late','A1',number(1))).conflict);
  assert.throws(()=>applyLiveBatch(state,'b',{id:'sort',type:'replace',baseRevision:0,book:book()}),{status:409});
});

test('filter criteria and compact hidden row ranges survive replacement, journal reload and cell edits; viewport is never shared',async()=>{
  const source=book();source.sheets[0].filter={range:'A1:C10001',columns:[{column:2,and:false,tests:[{operator:'equal',value:'1'}]}],hiddenRows:[[2,1337],[1339,1714],[1716,1948],[1950,10001]]};
  source.sheets[0].viewport={row:9000,zoom:140};
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-live-filter-')),key='f'.repeat(64);let store=new WorkbookLiveStore(directory);
  await store.initialize(key,source,'source');
  let state=store.response(key).book;
  assert.deepEqual(state.sheets[0].filter,source.sheets[0].filter);assert.equal(state.sheets[0].viewport,undefined);
  await store.submit(key,'teacher',patch('edit','B1',number(99)),0);
  store=new WorkbookLiveStore(directory);assert.deepEqual(store.response(key).book.sheets[0].filter,source.sheets[0].filter);
  state=store.response(key).book;delete state.sheets[0].filter;
  await store.submit(key,'pupil',{id:'clear-filter',type:'replace',baseRevision:1,book:state},1);
  assert.equal(store.response(key).book.sheets[0].filter,undefined);
  assert.ok((await store.submit(key,'teacher',patch('stale','C1',number(1)),2)).receipt.status==='conflict');
});

test('invalid and unbounded filter metadata is rejected before mutating the common book',()=>{
  const valid={range:'A1:C100',columns:[{column:1,and:false,tests:[{operator:'equal',value:'1'}]}],hiddenRows:[[2,50]]};
  for(const invalid of [{...valid,range:'A0:C100'},{...valid,hiddenRows:[[2,1048577]]},{...valid,hiddenRows:[[4,9],[3,6]]},{...valid,columns:[{...valid.columns[0],column:-1}]},{...valid,columns:[{...valid.columns[0],tests:[{operator:'script',value:'x'}]}]}]){
    const source=book();source.sheets[0].filter=invalid;assert.throws(()=>normalizeLiveBook(source));
  }
});

test('a filter command journals only metadata, preserves cell contents, retries idempotently and reloads after restart',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-live-filter-delta-')),key='e'.repeat(64);let store=new WorkbookLiveStore(directory);
  await store.initialize(key,book(),'source');
  const value={range:'A1:C10001',columns:[{column:2,and:false,tests:[{operator:'equal',value:'1'}]}],hiddenRows:[[2,1337]]};
  const command={id:'filter',type:'filter',baseRevision:0,filters:[{sheetId:'sheet1',value}]};
  const response=await store.submit(key,'teacher',command,0);
  assert.deepEqual(response.events[0].filters,command.filters);assert.equal(response.events[0].book,undefined);assert.equal(response.events[0].changes,undefined);
  assert.equal(store.response(key).book.sheets[0].cells.A1.content.value,10);
  assert.equal((await store.submit(key,'teacher',command,1)).revision,1);
  store=new WorkbookLiveStore(directory);assert.deepEqual(store.response(key).book.sheets[0].filter,value);
  await assert.rejects(store.submit(key,'pupil',{...command,id:'stale'},1),{status:409});
  await store.submit(key,'pupil',{id:'clear',type:'filter',baseRevision:1,filters:[{sheetId:'sheet1',value:null}]},1);
  assert.equal(store.response(key).book.sheets[0].filter,undefined);
});
test('undo and redo never overwrite another participant changes',()=>{
  let state=applyLiveBatch(createLiveState(book(),'source'),'a',patch('one','A1',number(20))).state;
  state=applyLiveBatch(state,'a',{id:'undo',type:'undo',targetId:'one'}).state;assert.equal(state.book.sheets[0].cells.A1.content.value,10);
  state=applyLiveBatch(state,'a',{id:'redo',type:'redo',targetId:'undo'}).state;assert.equal(state.book.sheets[0].cells.A1.content.value,20);
  state=applyLiveBatch(state,'b',patch('other','A1',number(25),3)).state;
  const refused=applyLiveBatch(state,'a',{id:'lateundo',type:'undo',targetId:'redo'});assert.ok(refused.conflict);assert.equal(state.book.sheets[0].cells.A1.content.value,25);
});
test('incremental responses contain only unseen events; missing history returns a full snapshot',()=>{
  const initial=createLiveState(book(),'source'),one=applyLiveBatch(initial,'a',patch('one','A1',number(20))).state;
  assert.equal(liveResponse(one,0).events.length,1);assert.equal(liveResponse(one,1).book,undefined);assert.ok(liveResponse(one).book);
  const missing={...one,history:[]};assert.ok(liveResponse(missing,0).book);
});
test('invalid books, invalid batches and external formulas fail before changes',()=>{
  const state=createLiveState(book(),'source');
  for(const content of [{kind:'number',value:NaN},{kind:'formula',value:'=WEBSERVICE("https://example.com")'},{kind:'text',value:'a\0b'}])assert.throws(()=>applyLiveBatch(state,'a',patch('bad','B1',content)));
  assert.throws(()=>normalizeLiveBook({sheets:[...book().sheets,...book().sheets]}));
  assert.throws(()=>applyLiveBatch(state,'a',patch('bad','XFE1',number(1))));assert.equal(state.revision,0);
});
test('durable journal survives restart, compaction, a torn tail and duplicate retries',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-live-')),key='a'.repeat(64);let store=new WorkbookLiveStore(directory);
  await store.initialize(key,book(),'source');let last;
  for(let i=1;i<=105;i++){last=patch('op'+i,'A1',number(i+10),i-1);await store.submit(key,'a',last,i-1);}
  await store.checkpoint(key,105,async()=>true);
  fs.appendFileSync(store.paths(key).journal,'{"partial":');store=new WorkbookLiveStore(directory);
  const loaded=store.response(key);assert.equal(loaded.revision,105);assert.equal(loaded.checkpointRevision,105);assert.equal(loaded.book.sheets[0].cells.A1.content.value,115);
  const duplicate=await store.submit(key,'a',last,105);assert.equal(duplicate.revision,105);
  assert.equal(fs.readFileSync(store.paths(key).journal,'utf8').endsWith('\n'),true);
});
test('failed durable write does not mutate live state or acknowledge a command',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-live-failure-')),store=new WorkbookLiveStore(directory),key='b'.repeat(64);
  await store.initialize(key,book(),'source');store.append=()=>{throw Error('disk full');};
  await assert.rejects(store.submit(key,'a',patch('op','A1',number(99)),0),/disk full/);assert.equal(store.response(key).book.sheets[0].cells.A1.content.value,10);
});
test('idle workbook eviction reloads durable cells without leaking per-room locks',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-live-lru-')),store=new WorkbookLiveStore(directory);
  for(let i=0;i<16;i++){const key=i.toString(16).padStart(64,'0');await store.initialize(key,book(),'source');await store.submit(key,'a',patch('op','A1',number(20+i)),0);}
  assert.ok(store.rooms.size<=12);assert.equal(store.response('0'.repeat(64)).book.sheets[0].cells.A1.content.value,20);
  await Promise.resolve();assert.equal(store.tails.size,0);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./createPyodideWorker.js',import.meta.url),'utf8');
const factory=source.slice(source.indexOf('export const createPyodideWorker =')).replace(/^export /,'');
const local='https://platform.test/vendor/pyodide/0.29.4/';
const fallback='https://cdn.test/0.29.4/';
function worker(load){
  let generated;const messages=[],requests=[];
  vm.runInNewContext(factory+'\ncreatePyodideWorker();',{
    PYODIDE_INDEX_URL:local,PYODIDE_FALLBACK_URL:fallback,PYODIDE_STREAM_CHUNK_CHARS:2048,
    PYODIDE_TURTLE_SCENE_JSON_LIMIT:4194304,PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT:20000,
    HEADLESS_TURTLE_SOURCE:'',COLLAB_DEBUG_TRACE_LIMIT:2500,
    Blob:class{constructor(parts){generated=parts.join('');}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Worker:class{},
  });
  const self={loadPyodide:async options=>load(options.indexURL),postMessage:x=>messages.push(x)};
  vm.runInNewContext(generated,{self,importScripts:url=>requests.push(url),TextDecoder,Uint8Array,ArrayBuffer});
  return {messages,requests,warm:()=>self.onmessage({data:{id:'warm',type:'warmup'}})};
}
test('classroom Python starts from the platform origin without consulting the CDN',async()=>{
  const w=worker(async url=>{assert.equal(url,local);return {};});await w.warm();
  assert.deepEqual(w.requests,[local+'pyodide.js']);assert.equal(w.messages[0].type,'ready');
});
test('an incomplete local runtime can fall back to a complete matching runtime',async()=>{
  const urls=[];const w=worker(async url=>{urls.push(url);if(url===local)throw Error('wasm unavailable');return {};});
  await w.warm();assert.deepEqual(urls,[local,fallback]);assert.equal(w.messages[0].type,'ready');
});
test('a temporary loading failure does not permanently poison the worker promise',async()=>{
  let online=false;const w=worker(async()=>{if(!online)throw Error('offline');return {};});
  await w.warm();assert.equal(w.messages[0].type,'warmup-error');assert.match(w.messages[0].error,/загрузить Python/);
  online=true;await w.warm();assert.equal(w.messages[1].type,'ready');
  assert.deepEqual(w.requests,[local+'pyodide.js',fallback+'pyodide.js',local+'pyodide.js']);
});

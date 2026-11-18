import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./createPyodideWorker.js',import.meta.url),'utf8');
const factory=source.slice(source.indexOf('export const createPyodideWorker =')).replace(/^export /,'');
function fixture() {
  const native=[];
  const target=vm.runInNewContext(factory+'\ncreatePyodideWorker();',{
    EventTarget,Event,MessageEvent,
    PYODIDE_INDEX_URL:'https://platform.test/',PYODIDE_FALLBACK_URL:'https://fallback.test/',
    PYODIDE_STREAM_CHUNK_CHARS:2048,PYODIDE_TURTLE_SCENE_JSON_LIMIT:4194304,
    PYODIDE_TURTLE_SCENE_PRIMITIVE_LIMIT:20000,HEADLESS_TURTLE_SOURCE:'',COLLAB_DEBUG_TRACE_LIMIT:2500,
    Blob:class {},URL:{createObjectURL:()=>'',revokeObjectURL(){}},
    Worker:class {
      constructor(){this.posts=[];this.terminated=false;native.push(this);}
      postMessage(message){this.posts.push(message);}
      terminate(){this.terminated=true;}
      emit(data){this.onmessage({data});}
    },
  });
  return {target,native};
}

test('a memory failure reports once, replaces the WASM worker and preserves handlers for the next run',()=>{
  const {target,native}=fixture(),results=[],events=[];
  target.onmessage=e=>results.push(e.data);
  target.addEventListener('message',e=>events.push(e.data));
  target.postMessage({id:'large',source:'large program'});
  native[0].emit({id:'large',type:'stdout',chunk:'before\n'});
  native[0].emit({id:'large',type:'result',output:'before\n',error:'MemoryError',resetRuntime:true});
  assert.equal(native[0].terminated,true);
  assert.equal(native.length,1,'Replacement is lazy; no failed source is automatically rerun');
  target.postMessage({id:'small',source:'print(5)'});
  assert.equal(native.length,2);
  assert.deepEqual(native[1].posts.map(x=>x.id),['small']);
  native[0].emit({id:'large',type:'result',error:'stale callback'});
  native[1].emit({id:'small',type:'result',output:'5\n',error:''});
  assert.deepEqual(results.map(x=>x.id),['large','large','small']);
  assert.equal(results.at(-1).output,'5\n');assert.deepEqual(events,results);
  target.terminate();assert.equal(native[1].terminated,true);
});

test('queued autotests run sequentially and a failed test does not poison the next test',()=>{
  const {target,native}=fixture(),results=[];target.onmessage=e=>results.push(e.data);
  target.postMessage({id:'test-1'});target.postMessage({id:'test-2'});
  assert.deepEqual(native[0].posts.map(x=>x.id),['test-1']);
  native[0].emit({id:'test-1',type:'result',error:'MemoryError',resetRuntime:true});
  assert.equal(native.length,2);assert.deepEqual(native[1].posts.map(x=>x.id),['test-2']);
  native[1].emit({id:'test-2',type:'result',output:'ok',error:''});
  assert.equal(results.at(-1).output,'ok');target.terminate();
});

test('ordinary Python exceptions and warmup retain the healthy runtime, while stop discards queued work',()=>{
  const {target,native}=fixture();
  target.postMessage({id:'warm',type:'warmup'});target.postMessage({id:'syntax'});
  native[0].emit({id:'warm',type:'ready'});
  native[0].emit({id:'syntax',type:'result',error:'SyntaxError',resetRuntime:false});
  target.postMessage({id:'normal'});assert.equal(native.length,1);
  target.postMessage({id:'queued'});target.terminate();
  native[0].emit({id:'normal',type:'result',resetRuntime:true});
  target.postMessage({id:'after-stop'});
  assert.deepEqual(native[0].posts.map(x=>x.id),['warm','syntax','normal']);
  assert.equal(native.length,1);
});

test('a result handler can queue a continuation on the new runtime without double dispatch',()=>{
  const {target,native}=fixture();
  const listener=e=>{if(e.data.id==='one')target.postMessage({id:'two'});};
  target.addEventListener('message',listener);
  target.postMessage({id:'one'});
  native[0].emit({id:'one',type:'result',resetRuntime:true});
  assert.equal(native.length,2);assert.deepEqual(native[1].posts.map(x=>x.id),['two']);
  target.removeEventListener('message',listener);target.terminate();
});

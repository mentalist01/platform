import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardRenderIndex} from './boardRenderIndex.js';
const rect=item=>item.box;
const item=(id,x,y=0,width=20)=>({id,type:'shape',box:{minX:x,minY:y,maxX:x+width,maxY:y+20}});
const view={minX:0,minY:0,maxX:100,maxY:100};
test('offscreen drawings are skipped; crossing strokes, wide ink and paint order are retained',()=>{
  const items=[item('off',1000),item('edge',100),{id:'cross',type:'line',width:2,box:{minX:-100,minY:50,maxX:200,maxY:50}},{id:'wide',type:'stroke',width:40,box:{minX:115,minY:40,maxX:115,maxY:40}},item('front',30)];
  assert.deepEqual(createBoardRenderIndex(rect).indexes(items,view),[1,2,3,4]);
});
test('panning reuses geometry; moved selections are forced into the candidate list',()=>{
  let reads=0;const index=createBoardRenderIndex(value=>{reads++;return rect(value);});
  const items=Array.from({length:2500},(_,i)=>item(String(i),0,i*100));
  assert.deepEqual(index.indexes(items,view),[0,1]);assert.equal(reads,2500);
  assert.deepEqual(index.indexes(items,{...view,minY:1000,maxY:1100}),[10,11]);assert.equal(reads,2500);
  assert.deepEqual(index.indexes(items,view,['2400']),[0,1,2400]);
  const replacement=item('0',9000);assert.deepEqual(index.indexes([replacement,...items.slice(1)],view),[1]);assert.equal(reads,2501);
});
test('large items and unknown bounds remain safe, and huge views do not traverse an unbounded grid',()=>{
  const items=[item('huge',-100000,0,200000),{id:'unknown'},item('negative',-1000),item('visible',20)];
  const index=createBoardRenderIndex(rect);
  assert.deepEqual(index.indexes(items,view),[0,1,3]);
  assert.deepEqual(index.indexes(items,{minX:-1e9,minY:-1e9,maxX:1e9,maxY:1e9}),[0,1,2,3]);
});

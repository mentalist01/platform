import test from 'node:test';
import assert from 'node:assert/strict';
import {findBoardEraserHit} from './boardEraser.js';

const anchor={id:'prepared-12345678-1234-1234-1234-123456789abc',type:'shape'};
test('repeated erasing on the condition removes its ink while retaining the task anchor',()=>{
  const items=[anchor,{id:'underline',type:'stroke'},{id:'circle',type:'shape'}];
  for(let i=0;i<5;i++){
    const index=findBoardEraserHit(items,()=>true);
    if(index>=0)items.splice(index,1);
  }
  assert.deepEqual(items,[anchor]);
});
test('a prepared anchor above older ink does not shield that annotation from the eraser',()=>{
  const items=[{type:'line',id:'ink'},anchor];
  assert.equal(findBoardEraserHit(items,()=>true),0);
});
test('embedded tasks, images and files survive erasing; misses preserve ordinary annotations',()=>{
  const items=[{type:'task'},{type:'file'},{type:'image'},anchor,{type:'text',id:'note'}];
  assert.equal(findBoardEraserHit(items,()=>false),-1);
  assert.equal(findBoardEraserHit(items,item=>item.id==='note'),4);
  assert.equal(findBoardEraserHit(items.slice(0,4),()=>true),-1);
});
test('the same selection handles Yjs arrays and Y.Map items used by the live board',()=>{
  const items=[{toJSON:()=>({type:'arrow'})},{toJSON:()=>anchor}];
  assert.equal(findBoardEraserHit({length:items.length,get:i=>items[i]},()=>true),0);
});

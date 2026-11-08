import test from 'node:test';
import assert from 'node:assert/strict';
import {interactiveTheoryPointer} from './interactiveTheoryPointer.js';
const node=(left,top,width,height,children=[])=>{const element={children,getBoundingClientRect:()=>({left,top,width,height})};for(const child of children)child.parentElement=element;return element;};
const anchor={x:1000,y:2000,width:640,height:760};
test('interactive controls publish world coordinates at the board scale without changing layout',()=>{
  const root=node(100,200,320,380),before={...anchor};
  assert.deepEqual(interactiveTheoryPointer({currentTarget:root,target:root,clientX:260,clientY:390},root,anchor),{x:1320,y:2380});
  assert.deepEqual(anchor,before);
});
test('enlarged and differently wrapped content points to the same bit on the board',()=>{
  const boardBit=node(350,300,8,10),board=node(100,200,320,380,[node(100,200,320,380,[boardBit])]);
  const expandedBit=node(500,600,16,20),expanded=node(200,20,760,900,[node(200,20,760,900,[expandedBit])]);
  assert.deepEqual(interactiveTheoryPointer({currentTarget:expanded,target:expandedBit,clientX:508,clientY:610},board,anchor),{x:1508,y:2210});
});
test('missing, hidden and invalid card geometry does not publish a false cursor',()=>{
  const root=node(0,0,0,0),event={currentTarget:root,target:root,clientX:10,clientY:20};
  assert.equal(interactiveTheoryPointer(event,root,anchor),null);
  assert.equal(interactiveTheoryPointer(event,null,anchor),null);
  const visible=node(0,0,640,760);
  assert.equal(interactiveTheoryPointer({...event,currentTarget:visible,target:visible,clientX:NaN},visible,anchor),null);
});

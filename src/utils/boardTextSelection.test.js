import test from 'node:test';
import assert from 'node:assert/strict';
import {installBoardSelectionGuard} from './boardTextSelection.js';

test('board labels cannot start native selection; typing, dialogs and code keep their selection',()=>{
  const root=new EventTarget(),inside={},outside={};let clears=0;
  const selection={rangeCount:1,anchorNode:inside,focusNode:inside,removeAllRanges:()=>clears++};
  root.ownerDocument={getSelection:()=>selection};root.contains=node=>node===inside;
  const cleanup=installBoardSelectionGuard(root);
  const emit=(type,canEdit)=>{const event=new Event(type,{cancelable:true});Object.defineProperty(event,'target',{value:{closest:()=>canEdit?{}:null}});root.dispatchEvent(event);return event;};
  assert.equal(emit('selectstart',false).defaultPrevented,true);
  assert.equal(emit('selectstart',true).defaultPrevented,false);
  assert.equal(emit('pointerdown',false).defaultPrevented,false,'drawing and button pointer events must still work');assert.equal(clears,1);
  emit('pointerdown',true);assert.equal(clears,1,'do not clear input or editor selection');
  selection.anchorNode=outside;selection.focusNode=outside;emit('pointerdown',false);assert.equal(clears,1,'a code selection outside the board remains intact');
  cleanup();assert.equal(emit('selectstart',false).defaultPrevented,false);
});

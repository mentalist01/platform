import test from 'node:test';
import assert from 'node:assert/strict';
import {fullscreenPortalTarget,subscribeFullscreenPortal} from './fullscreenPortal.js';

test('dialogs enter and leave the browser fullscreen layer, including Safari',()=>{
  const doc=new EventTarget();doc.body={id:'body'};const board={id:'board'},workspace={id:'split-workspace'};
  const seen=[],unsubscribe=subscribeFullscreenPortal(()=>seen.push(fullscreenPortalTarget(doc)),doc);
  assert.equal(fullscreenPortalTarget(doc),doc.body);
  doc.fullscreenElement=board;doc.dispatchEvent(new Event('fullscreenchange'));
  doc.fullscreenElement=workspace;doc.dispatchEvent(new Event('fullscreenchange'));
  doc.fullscreenElement=null;doc.webkitFullscreenElement=board;doc.dispatchEvent(new Event('webkitfullscreenchange'));
  doc.webkitFullscreenElement=null;doc.dispatchEvent(new Event('webkitfullscreenchange'));
  assert.deepEqual(seen,[board,workspace,board,doc.body]);
  unsubscribe();doc.dispatchEvent(new Event('fullscreenchange'));assert.equal(seen.length,4);
  assert.equal(fullscreenPortalTarget(null),null);
});

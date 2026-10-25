import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedBoardView,animatePreparedBoardView} from './preparedBoardView.js';
test('new tasks open readably; five transitions retain a manually chosen zoom regardless of height', () => {
  const anchor = {x:100, y:200, width:640, height:9000};
  assert.equal(preparedBoardView(anchor, {width:800, zoom:.35, initial:true}).zoom, 1);
  assert.equal(preparedBoardView(anchor, {width:390, zoom:1, initial:true}).zoom, 290/640);
  for(let i=0;i<5;i++) {
    const view=preparedBoardView({...anchor,y:1000*i}, {width:800,zoom:.94});
    assert.equal(view.zoom,.94);assert.equal(view.offset.y,1000*i-76/.94);
  }
});

test('camera flight moves through intermediate views and ends at the exact target without changing manual zoom',()=>{
  const from={zoom:.94,offset:{x:0,y:0}},to={zoom:.94,offset:{x:80,y:1000}},views=[];
  let next;animatePreparedBoardView({from,to,onFrame:view=>views.push(view),requestFrame:fn=>{next=fn;return 1;},cancelFrame:()=>{}});
  next(100);next(320);next(540);
  assert.deepEqual(views[0],from);assert.equal(views[1].offset.y,500);assert.deepEqual(views.at(-1),to);assert.ok(views.every(view=>view.zoom===.94));
});

test('user interaction cancels a camera flight; a previously queued frame cannot move the viewport',()=>{
  let next,cancelled;const views=[],stop=animatePreparedBoardView({from:{zoom:1,offset:{x:0,y:0}},to:{zoom:1,offset:{x:200,y:2000}},onFrame:view=>views.push(view),requestFrame:fn=>{next=fn;return 7;},cancelFrame:id=>{cancelled=id;}});
  next(0);next(100);stop();const count=views.length;next(500);
  assert.equal(cancelled,7);assert.equal(views.length,count);assert.ok(views.at(-1).offset.y<2000);
});

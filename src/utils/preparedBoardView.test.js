import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedBoardView} from './preparedBoardView.js';
test('new tasks open readably; five transitions retain a manually chosen zoom regardless of height', () => {
  const anchor = {x:100, y:200, width:640, height:9000};
  assert.equal(preparedBoardView(anchor, {width:800, zoom:.35, initial:true}).zoom, 1);
  assert.equal(preparedBoardView(anchor, {width:390, zoom:1, initial:true}).zoom, 290/640);
  for(let i=0;i<5;i++) {
    const view=preparedBoardView({...anchor,y:1000*i}, {width:800,zoom:.94});
    assert.equal(view.zoom,.94);assert.equal(view.offset.y,1000*i-76/.94);
  }
});

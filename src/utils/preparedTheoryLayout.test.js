import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedTheoryCanvasLayout,preparedTheoryDropSetting} from './preparedTheoryLayout.js';
import {normalizePreparedTheoryDisplays} from './preparedTheoryDisplay.js';

test('dragging under the first sheet anchors there instead of under the small table',()=>{
  const images=['main','table','next'];
  const display={main:{scalePercent:150},table:{scalePercent:50,relativeTo:'main',placement:'right',offset:{gap:48,align:180}}};
  const {rows:[main,table]}=preparedTheoryCanvasLayout(images,{},display);
  display.next=preparedTheoryDropSetting({x:main.x,y:main.y+main.height+56},[main,table]);
  const normalized=normalizePreparedTheoryDisplays(images,display);
  assert.equal(normalized.next.relativeTo,'main');
  const {rows:[,,next]}=preparedTheoryCanvasLayout(images,{},normalized);
  assert.equal(next.x,main.x);
  assert.equal(next.y,main.y+main.height+56);
});

test('preview respects simulated writing to the right and below',()=>{
  for(const placement of ['right','below']){
    const display={next:{relativeTo:'main',placement}};
    const {rows:[,next],notes:[note]}=preparedTheoryCanvasLayout(['main','next'],{},display,[{relativeTo:'main',placement}]);
    if(placement==='right')assert.ok(next.x>note.x+note.width);
    else assert.ok(next.y>note.y+note.height);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreparedTheoryDisplay,preparedTheoryFrame} from './preparedTheoryDisplay.js';
import {preparedBoardView} from './preparedBoardView.js';

test('sheet display defaults preserve the old route; unsupported settings are rejected',()=>{
  assert.equal(normalizePreparedTheoryDisplay(),null);
  assert.equal(normalizePreparedTheoryDisplay({placement:'auto',focus:'next'}),null);
  assert.deepEqual(normalizePreparedTheoryDisplay({placement:'right',focus:'pair'}),{placement:'right',focus:'pair'});
  assert.deepEqual(normalizePreparedTheoryDisplay({placement:'below'}),{placement:'below',focus:'next'});
  for(const value of [[],true,{placement:'left'},{focus:'all'}])assert.throws(()=>normalizePreparedTheoryDisplay(value));
});

test('pair framing fits both world rectangles on different screens, horizontally and vertically',()=>{
  const first={x:200,y:80,width:832,height:1400};
  for(const second of [{x:1080,y:80,width:832,height:760},{x:200,y:1600,width:832,height:1400}]){
    const frame=preparedTheoryFrame(second,first);
    for(const [width,height] of [[1920,1080],[1024,680],[390,700]]){
      const view=preparedBoardView(frame,{width,height,zoom:1,fit:true});
      for(const box of [first,second]){
        const x=(box.x-view.offset.x)*view.zoom,y=(box.y-view.offset.y)*view.zoom;
        assert.ok(x>=0&&y>=76);
        assert.ok(x+box.width*view.zoom<=width+.01);
        assert.ok(y+box.height*view.zoom<=height+.01);
      }
    }
  }
  assert.equal(preparedTheoryFrame(first,undefined),null);
  assert.equal(preparedTheoryFrame(first,{...first,height:0}),null);
  assert.equal(preparedTheoryFrame(first,{...first,x:NaN}),null);
});

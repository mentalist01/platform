import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePreparedCardCamera,normalizePreparedCardCamera,preparedCardCameraFrame,preparedCardCameraView} from './preparedCardCamera.js';
import {normalizePreparedTheoryDisplay,preparedTheoryCameraRange} from './preparedTheoryDisplay.js';
import {normalizePreparedSetLayout,remapPreparedSetLayout} from './preparedSetLayout.js';
import {preparedBoardView} from './preparedBoardView.js';

test('capture and playback reproduce the chosen pan and zoom without adding padding',()=>{
  const anchor={x:900,y:300,width:832},view={x:-225,y:-73,scale:1.4},viewport={width:1200,height:620};
  const camera=capturePreparedCardCamera(anchor,view,viewport);
  const restored=preparedCardCameraView(preparedCardCameraFrame(anchor,camera),viewport);
  assert.ok(Math.abs(restored.zoom-view.scale)<1e-10);
  assert.ok(Math.abs(-restored.offset.x*restored.zoom-view.x)<1e-10);
  assert.ok(Math.abs(-restored.offset.y*restored.zoom-view.y)<1e-10);
  const moved=preparedCardCameraFrame({x:4100,y:7800,width:416},camera);
  const original=preparedCardCameraFrame(anchor,camera);
  assert.equal(moved.width,original.width/2);
  assert.equal(moved.x,4100+(original.x-anchor.x)/2);
  assert.equal(moved.y,7800+(original.y-anchor.y)/2);
});

test('the entire saved shot fits wide, small and portrait pupil screens, centred below lesson controls',()=>{
  const frame={x:-110,y:300,width:1500,height:750};
  for(const [width,height] of [[2560,1440],[1280,720],[1024,680],[390,700]]){
    const {zoom,offset}=preparedBoardView(frame,{width,height,zoom:1,fit:'camera',top:90});
    const x=(frame.x-offset.x)*zoom,y=(frame.y-offset.y)*zoom;
    assert.ok(x>=72-1e-8&&y>=90-1e-8);
    assert.ok(x+frame.width*zoom<=width-28+1e-8);
    assert.ok(y+frame.height*zoom<=height-28+1e-8);
    assert.ok(Math.abs(x-72-(width-28-x-frame.width*zoom))<1e-8);
    assert.ok(Math.abs(y-90-(height-28-y-frame.height*zoom))<1e-8);
  }
});

test('manual shots survive identity remapping; invalid frames cannot reach the board',()=>{
  const camera={x:-.5,y:-.1,width:2,height:1.1};
  const layout=normalizePreparedSetLayout([{id:'a'}],{'task:a':{camera}});
  assert.deepEqual(layout['task:a'].camera,camera);
  assert.deepEqual(remapPreparedSetLayout(layout,new Map([['a','b']]),new Map())['task:b'].camera,camera);
  assert.equal(normalizePreparedTheoryDisplay({camera:null}),null);
  for(const value of [[],true,{}, {...camera,width:0},{...camera,x:NaN},{...camera,height:Infinity},{...camera,y:1e6},{...camera,width:'2'}]){
    assert.throws(()=>normalizePreparedCardCamera(value));
  }
  const rows=[{kind:'theory',boardDisplay:{focus:'block'}},{kind:'theory',boardDisplay:{camera}},{kind:'theory'}];
  assert.deepEqual(preparedTheoryCameraRange(rows,0),{from:0,to:2});
  assert.equal(preparedTheoryCameraRange(rows,1),null);
  assert.equal(preparedTheoryCameraRange(rows,2),null);
});

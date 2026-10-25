import test from 'node:test';import assert from 'node:assert/strict';
import {paintPreparedInk,compositePreparedInk,isPreparedTaskAnchor} from './preparedInk.js';
test('reserved prepared anchors are geometry, not a second visible card border; ordinary drawings remain visible',()=>{
  const anchor={id:'prepared-12345678-1234-1234-1234-123456789abc',type:'shape',shape:'rectangle'};
  assert.equal(isPreparedTaskAnchor(anchor),true);
  assert.equal(isPreparedTaskAnchor({...anchor,id:'drawing-123'}),false);
  assert.equal(isPreparedTaskAnchor({...anchor,type:'stroke'}),false);
  assert.equal(isPreparedTaskAnchor(null),false);
});
test('saved ink and live selection paint above conditions only, with transparent surroundings and preserved anchors',()=>{
  const operations=[];
  const canvas=name=>({name,width:800,height:600,getContext:()=>Object.fromEntries(['clearRect','setTransform','save','restore','beginPath','rect','clip','drawImage'].map(method=>[method,(...args)=>operations.push({name,method,args})]))});
  const foreground=canvas('foreground'),overlay=canvas('live'),cache={},drawn=[];
  const input={canvas:foreground,overlay,width:400,height:300,zoom:.5,offset:{x:100,y:200},regions:[{anchorId:'prepared-anchor',card:{x:20,y:30,width:200,height:220},body:{x:20,y:100,width:200,height:150}}],items:[{id:'prepared-anchor',type:'shape'},{id:'handwriting',type:'stroke'}],preview:item=>({...item,preview:true}),draw:(ctx,item)=>drawn.push(item),createCanvas:()=>canvas('saved')};
  paintPreparedInk(cache,input);assert.deepEqual(drawn,[{id:'handwriting',type:'stroke',preview:true}]);
  assert.ok(operations.some(op=>op.name==='saved'&&op.method==='rect'&&JSON.stringify(op.args)==='[20,100,200,150]'));
  assert.deepEqual(operations.filter(op=>op.name==='foreground'&&op.method==='drawImage').map(op=>op.args[0].name),['saved','live']);
  assert.ok(operations.some(op=>op.name==='foreground'&&op.method==='rect'&&JSON.stringify(op.args)==='[40,60,400,440]'));
  paintPreparedInk(cache,{...input,reference:{width:800,height:700},height:350});assert.equal(foreground.height,700,'A height change never stretches a stale overlay snapshot');
  operations.length=0;cache.regions=[];compositePreparedInk(cache,foreground,overlay);assert.equal(operations.some(op=>op.method==='drawImage'),false,'No ghost ink after leaving the prepared page');
});

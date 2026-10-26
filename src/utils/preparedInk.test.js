import test from 'node:test';import assert from 'node:assert/strict';
import {paintPreparedInk,compositePreparedInk,isPreparedTaskAnchor} from './preparedInk.js';
import {createBoardRenderIndex,boardItemBounds} from './boardRenderIndex.js';
test('reserved prepared anchors are geometry, not a second visible card border; ordinary drawings remain visible',()=>{
  const anchor={id:'prepared-12345678-1234-1234-1234-123456789abc',type:'shape',shape:'rectangle'};
  assert.equal(isPreparedTaskAnchor(anchor),true);
  assert.equal(isPreparedTaskAnchor({...anchor,id:'drawing-123'}),false);
  assert.equal(isPreparedTaskAnchor({...anchor,type:'stroke'}),false);
  assert.equal(isPreparedTaskAnchor(null),false);
});

test('spatial ink queries retain crossing strokes and image order in zoomed prepared conditions',()=>{
  const context=Object.fromEntries(['clearRect','setTransform','save','restore','beginPath','rect','clip','drawImage'].map(method=>[method,()=>{}]));
  const canvas=()=>({width:800,height:600,getContext:()=>context});
  const items=[
    {id:'behind',type:'image',x:100,y:200,width:500,height:500},
    {id:'anchor',type:'shape',x:100,y:200,width:500,height:500},
    {id:'crossing',type:'stroke',width:4,points:[{x:0,y:450},{x:700,y:450}]},
    {id:'far',type:'stroke',width:4,points:[{x:100,y:9000},{x:300,y:9000}]},
    {id:'front',type:'image',x:200,y:400,width:40,height:40},
  ];
  const index=createBoardRenderIndex(boardItemBounds),queries=[],drawn=[];
  paintPreparedInk({}, {canvas:canvas(),overlay:canvas(),width:400,height:300,zoom:.5,offset:{x:100,y:200},
    regions:[{anchorId:'anchor',card:{x:20,y:30,width:200,height:220},body:{x:20,y:100,width:200,height:150}},
      {anchorId:'hidden',card:{x:20,y:9000,width:200,height:220},body:{x:20,y:9070,width:200,height:150}}],
    items,preview:item=>item,draw:(_ctx,item)=>drawn.push(item.id),createCanvas:canvas,
    query:bounds=>{queries.push(bounds);return index.indexes(items,bounds);},
  });
  assert.deepEqual(queries,[{minX:140,minY:400,maxX:540,maxY:700}]);
  assert.deepEqual(drawn,['crossing','front'],'offscreen ink and images behind the condition stay omitted');
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

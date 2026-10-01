import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {fragmentBounds} from './boardFragmentClipboard.js';
import {captureBoardSelection,clampBoardSelectionScale,commitBoardSelectionResize,cornerResizeAnchor,cornerResizeScale,fitBoardFragmentToViewport,scaleBoardSelection} from './boardSelectionResize.js';
import {alignBoardBounds,boardAlignmentTargets,selectionMovePreview} from './boardAlignment.js';

const mixed=[
  {id:'image',type:'image',x:10,y:20,width:200,height:100,crop:{x:.1,y:.2,width:.8,height:.6},assetId:'asset',naturalWidth:800},
  {id:'text',type:'text',x:20,y:130,width:160,height:40,fontSize:28,text:'Объяснение'},
  {id:'stroke',type:'stroke',points:[{x:40,y:180,pressure:.2},{x:140,y:200,pressure:.9}],width:4,color:'#7c3aed'},
  {id:'line',type:'line',start:{x:30,y:220},end:{x:200,y:220},width:5},
  {id:'arrow',type:'arrow',start:{x:100,y:210},end:{x:160,y:180},width:3},
  {id:'shape',type:'shape',x:10,y:230,width:90,height:50,strokeWidth:2,shape:'ellipse'},
  {id:'task',type:'task',x:230,y:20,width:720,height:640,contentWidth:720,contentHeight:640,studentCode:'code',userAnswers:['42']},
];
test('uniform selection resize preserves the composition, editable content, pen pressure and task content size',()=>{
  const original=structuredClone(mixed),anchor={x:10,y:20},entries=scaleBoardSelection(mixed,anchor,.5);
  assert.deepEqual(fragmentBounds(entries),{x:10,y:20,width:470,height:320});
  assert.equal(entries[0].width,100);assert.equal(entries[0].naturalWidth,800);assert.deepEqual(entries[0].crop,mixed[0].crop);
  assert.equal(entries[1].fontSize,14);assert.equal(entries[1].text,mixed[1].text);
  assert.equal(entries[2].width,2);assert.deepEqual(entries[2].points[1],{x:75,y:110,pressure:.9});
  assert.equal(entries[3].end.x,105);assert.equal(entries[3].width,2.5);assert.equal(entries[4].width,1.5);assert.equal(entries[5].strokeWidth,1);
  assert.equal(entries[6].width,360);assert.equal(entries[6].contentWidth,720);assert.equal(entries[6].contentHeight,640);assert.equal(entries[6].studentCode,'code');
  assert.deepEqual(mixed,original);
});
test('all four corners keep the opposite corner anchored and use the board coordinate scale',()=>{
  const bounds={x:100,y:200,width:400,height:200};
  for(const corner of ['nw','ne','sw','se']){
    const dx=(corner.includes('w')?1:-1)*200,dy=(corner.includes('n')?1:-1)*100;
    assert.equal(cornerResizeScale(bounds,corner,dx,dy),.5);
    const anchor=cornerResizeAnchor(bounds,corner),resized=scaleBoardSelection([{id:'a',type:'image',...bounds}],anchor,.5)[0];
    assert.equal(resized.x+(corner.includes('w')?resized.width:0),anchor.x);
    assert.equal(resized.y+(corner.includes('n')?resized.height:0),anchor.y);
  }
  assert.ok(Number.isFinite(cornerResizeScale({width:0,height:200},'se',0,50)));
  assert.ok(clampBoardSelectionScale(mixed,-20)>0);
  assert.throws(()=>scaleBoardSelection(mixed,{x:0,y:0},NaN));
});
test('oversized pasted fragment fits the viewport at the current zoom without enlarging a small fragment',()=>{
  const items=mixed.slice(0,6),huge=scaleBoardSelection(items,{x:0,y:0},10),view={width:1000,height:700,zoom:2};
  const fit=fitBoardFragmentToViewport(huge,view),bounds=fragmentBounds(fit),before=fragmentBounds(huge);
  assert.ok(bounds.width*view.zoom<=view.width*.72+.001);assert.ok(bounds.height*view.zoom<=view.height*.65+.001);
  assert.equal(bounds.x+bounds.width/2,before.x+before.width/2);assert.equal(bounds.y+bounds.height/2,before.y+before.height/2);
  assert.equal(fitBoardFragmentToViewport(items,{...view,zoom:1}),items);
});
test('one resize is one undo/redo action, keeps layers and preserves concurrent answer/code updates',()=>{
  const doc=new Y.Doc(),yItems=doc.getArray('items'),origin={};yItems.push(mixed);
  const undo=new Y.UndoManager(yItems,{trackedOrigins:new Set([origin])});
  const snapshot=captureBoardSelection(yItems,mixed),entries=scaleBoardSelection(mixed,{x:10,y:20},.5);
  doc.transact(()=>{const task=yItems.get(6);yItems.delete(6,1);yItems.insert(6,[{...task,studentCode:'fresh code',userAnswers:['100']}]);});
  assert.equal(commitBoardSelectionResize({doc,yItems,undo,origin,snapshot,entries}),true);
  assert.deepEqual(yItems.toJSON().map(item=>item.id),mixed.map(item=>item.id));assert.equal(undo.undoStack.length,1);
  assert.equal(yItems.get(6).studentCode,'fresh code');assert.deepEqual(yItems.get(6).userAnswers,['100']);
  undo.undo();assert.equal(yItems.get(0).width,200);assert.equal(yItems.get(6).studentCode,'fresh code');
  undo.redo();assert.equal(yItems.get(0).width,100);assert.equal(yItems.get(1).fontSize,14);
  undo.destroy();doc.destroy();
});
test('a concurrent move, lock or deletion cancels the entire resize instead of restoring stale objects',()=>{
  for(const mutation of ['move','lock','delete']){
    const doc=new Y.Doc(),yItems=doc.getArray('items');yItems.push(mixed.slice(0,2));
    const snapshot=captureBoardSelection(yItems,mixed.slice(0,2)),raw=yItems.get(0);yItems.delete(0,1);
    if(mutation!=='delete')yItems.insert(0,[{...raw,...(mutation==='move'?{x:555}:{locked:true})}]);
    const before=yItems.toJSON();
    assert.equal(commitBoardSelectionResize({doc,yItems,snapshot,entries:scaleBoardSelection(mixed.slice(0,2),{x:0,y:0},.5)}),false);
    assert.deepEqual(yItems.toJSON(),before);doc.destroy();
  }
});
test('smart guides align nearest edges/centers and use a six-screen-pixel threshold at every zoom',()=>{
  const targets=[{id:'reference',x:200,y:100,width:100,height:80}];
  const result=alignBoardBounds({x:203,y:183,width:100,height:80},targets,{zoom:1});
  assert.equal(result.dx,-3);assert.equal(result.dy,-3);assert.deepEqual(result.guides.map(guide=>guide.axis),['x','y']);
  assert.equal(alignBoardBounds({x:203.1,y:350,width:100,height:80},targets,{zoom:2}).dx,0);
  assert.equal(alignBoardBounds({x:205.9,y:350,width:100,height:80},targets,{zoom:1}).dx,-5.900000000000006);
  assert.equal(alignBoardBounds({x:205.9,y:350,width:100,height:80},targets,{zoom:.5}).guides.length,1);
  assert.deepEqual(alignBoardBounds({x:203,y:183,width:100,height:80},targets,{disabled:true}),{dx:0,dy:0,guides:[]});
});
test('alignment excludes the whole moving selection and offscreen targets, and prioritizes the closest match',()=>{
  const items=[mixed[0],mixed[1],{id:'far',type:'shape',x:20000,y:30000,width:100,height:100}];
  assert.deepEqual(boardAlignmentTargets(items,['image','text'],{x:0,y:0,width:1000,height:700}),[]);
  const result=alignBoardBounds({x:198,y:500,width:100,height:80},[{id:'a',x:200,y:100,width:100,height:80},{id:'b',x:197,y:300,width:100,height:80}]);
  assert.equal(result.dx,-1);assert.equal(result.guides[0].value,197);
});
test('moving a selection previews all types without dropping pen pressure or unrelated metadata',()=>{
  const drag={active:true,items:mixed},pending={dx:15,dy:-20};
  assert.equal(selectionMovePreview(mixed[1],drag,pending).x,35);
  assert.deepEqual(selectionMovePreview(mixed[2],drag,pending).points[1],{x:155,y:180,pressure:.9});
  assert.equal(selectionMovePreview(mixed[6],drag,pending).studentCode,'code');
  assert.equal(selectionMovePreview(mixed[0],{active:false},pending,{active:true,id:'image',x:40,y:50}).x,40);
});

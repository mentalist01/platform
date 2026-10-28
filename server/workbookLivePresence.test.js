import test from'node:test';import assert from'node:assert/strict';
import{WorkbookLivePresence,normalizeWorkbookPresence,normalizeWorkbookDraft}from'./workbookLivePresence.js';
const teacher={id:'t',role:'teacher',name:'Учитель'},pupil={id:'p',role:'student',name:'Ученик'};
const selected={sheetName:'Лист1',activeCell:[2,1],ranges:[[2,1,8,3]],objects:[]};
test('draft typing is transient, bounded, cleared on commit and cannot supply another identity',()=>{
  const p=new WorkbookLivePresence(),draft={sheetName:'Лист1',cell:[2,1],text:'=SUM(A1;\nB2)'};
  p.exchange('a','t',teacher,selected,10,{...draft,actorId:'forged'});
  assert.deepEqual(p.read('a',pupil,11).peers[0].draft,draft);
  assert.equal(p.read('a',pupil,2011).peers[0].draft,undefined,'A stalled draft expires before the cursor');
  p.exchange('a','t',teacher,selected,12,null);assert.equal(p.read('a',pupil,13).peers[0].draft,undefined);
  p.exchange('a','t',teacher,selected,14,draft);assert.deepEqual(p.read('a',pupil,8015).peers,[]);
  for(const bad of [{...draft,text:'x'.repeat(8193)},{...draft,text:'\0'},{...draft,cell:[-1,0]}])assert.throws(()=>normalizeWorkbookDraft(bad));
});
test('presence is scoped, transient, keeps multiple ranges and object selections, and expires',()=>{
  const p=new WorkbookLivePresence();
  assert.deepEqual(p.exchange('a','t-session',teacher,selected,100).peers,[]);
  const reply=p.exchange('a','p-session',pupil,{...selected,ranges:[[0,0,0,0],[3,3,7,7]],objects:[{name:'Диаграмма 1',kind:'chart'}]},101);
  assert.equal(reply.peers.length,1);assert.equal(reply.peers[0].name,'Учитель');assert.equal(reply.peers[0].color,'#8b5cf6');assert.deepEqual(reply.peers[0].selection,selected);
  assert.equal(JSON.stringify(reply).includes('session'),false);
  assert.equal(p.exchange('b','t-session',teacher,selected,102).peers.length,0);
  const peer=p.exchange('a','t-session',teacher,selected,103).peers[0];assert.equal(peer.selection.objects[0].name,'Диаграмма 1');assert.equal(peer.selection.ranges.length,2);
  peer.selection.ranges[0][0]=99;assert.equal(p.exchange('a','t-session',teacher,selected,104).peers[0].selection.ranges[0][0],0);
  assert.deepEqual(p.exchange('a','t-session',teacher,selected,8104).peers,[]);
});
test('leave removes only the matching helper session and never another device of the same author',()=>{
  const p=new WorkbookLivePresence();p.exchange('a','old',teacher,selected,0);p.exchange('a','new',teacher,selected,1);
  p.exchange('a','old',teacher,null,2);assert.equal(p.exchange('a','p',pupil,selected,3).peers.length,1);
  p.exchange('a','new',teacher,null,4);assert.equal(p.exchange('a','p',pupil,selected,5).peers.length,0);
});
test('presence limits reject malformed or unbounded selections and discard client supplied identity',()=>{
  for(const changes of [{ranges:[[0,0,1048576,0]]},{ranges:[[5,0,1,0]]},{activeCell:[-1,0]},{ranges:Array(17).fill([0,0,0,0])},{objects:[{name:'x\n',kind:'shape'}]},{sheetName:'a'.repeat(32)}])assert.throws(()=>normalizeWorkbookPresence({...selected,...changes}));
  assert.deepEqual(normalizeWorkbookPresence({...selected,name:'Forged',color:'red',token:'secret'}),selected);
  const p=new WorkbookLivePresence({maxRooms:1});p.exchange('a','t',teacher,selected,0);assert.throws(()=>p.exchange('b','t',teacher,selected,1),{status:429});
  assert.doesNotThrow(()=>p.exchange('b','t',teacher,selected,9000));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {incomingBoardTask} from './boardTaskFollow.js';

test('a live teacher paste reaches pupils, while initial sync, edits, drawings and teacher windows keep their own view',()=>{
  const task={id:'new',type:'task',authorId:'teacher',x:100,y:200,width:640,height:900},options={synced:true,local:false,role:'student',teacherId:'teacher'};
  assert.equal(incomingBoardTask([{retain:2},{insert:[task]}],[],options),task);
  assert.equal(incomingBoardTask([{delete:1},{insert:[task]}],[task],options),null);
  for(const change of [{synced:false},{local:true},{role:'teacher'},{readOnly:true},{sandbox:true},{teacherId:'other'}])assert.equal(incomingBoardTask([{insert:[task]}],[],{...options,...change}),null);
  assert.equal(incomingBoardTask([{insert:[{...task,type:'stroke'}]}],[],options),null);
  assert.equal(incomingBoardTask([{insert:[{...task,width:NaN}]}],[],options),null);
  assert.equal(incomingBoardTask([{insert:[{...task,authorId:'student'}]}],[],options),null);
});

test('actual Yjs task changes produce a flight only for insertion, not answer replacement',()=>{
  const doc=new Y.Doc(),items=doc.getArray('items'),task={id:'new',type:'task',authorId:'teacher',x:100,y:200,width:640,height:900},targets=[];
  let previous=[];
  items.observe(event=>{targets.push(incomingBoardTask(event.changes.delta,previous,{synced:true,local:false,role:'student',teacherId:'teacher'}));previous=items.toArray();});
  items.push([task]);doc.transact(()=>{items.delete(0,1);items.insert(0,[{...task,userAnswers:['7']}]);});
  assert.equal(targets[0].id,'new');assert.equal(targets[1],null);doc.destroy();
});

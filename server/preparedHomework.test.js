import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedHomework} from './preparedHomework.js';
import {getCollabSolutionChannels} from '../src/utils/collabSolutions.js';

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-homework-')),docs=new Map(),a={id:'teacher-a',role:'teacher'},b={id:'student-b',role:'student'},c={id:'student-c',role:'student'},students=[{...b,teacherId:a.id},{...c,teacherId:a.id}];
  const entries={[b.id]:[],[c.id]:[]};let homework;
  const doc=room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);};
  const prepared=new PreparedLessonTasks({directory:path.join(directory,'prepared'),sourceFiles:async()=>[],board:async room=>doc(room),code:async room=>doc(room),authorize:async(auth,room,options)=>room.startsWith('prepared-homework-')?homework.access(auth,room,options):{allowed:true,auth,studentId:b.id,groupId:'g',participantIds:[b.id,c.id]},achievementContext:async()=>({participants:[]}),onAchievement:async()=>{}});
  homework=new PreparedHomework({directory:path.join(directory,'homework'),prepared,student:id=>students.find(person=>person.id===id),homeworks:id=>entries[id]||[]});
  t.after(()=>{for(const value of docs.values())value.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=prepared.putAsset(a,Buffer.from('png'),'condition.png','image/png',{width:600,height:100}),file=prepared.putAsset(a,Buffer.from('41\n59\n'),'17.txt','application/octet-stream');
  const set=await prepared.saveSet(a,{name:'17',taskNumber:17,tasks:[{title:'5',images:[image.id],answers:['2','100'],attachments:[{assetId:file.id,runtime:true,runtimeName:'17.txt'}]}]});
  const run=await prepared.start(a,{setId:set.id,room:'board-group-g',x:0,y:0}),card=run.cards[0];
  const channels=getCollabSolutionChannels(doc('collab-group-g'),card.codeId);channels.codeText.insert(0,"f=open('17.txt')\n");channels.testFileText.insert(0,'draft input');
  const items=doc(run.room).getArray('items');items.push([{id:'notes',src:'/uploads/notes.png?_auth=private-teacher-token&v=1',type:'stroke',points:[{x:40,y:450},{x:90,y:500}]}]);
  return {directory,prepared,homework,entries,a,b,c,run,card,channels,doc,image,file};
}

test('queue is private and idempotent; homework snapshots contain real native code and independent pupil copies',async t=>{
  const f=await fixture(t),{homework,prepared,run,card,a,b,c,entries,channels}=f;
  await assert.rejects(homework.queue(b,{runId:run.id,cardId:card.id}),{status:403});
  const queued=await homework.queue(a,{runId:run.id,cardId:card.id}),id=queued.goal.preparedId;
  assert.equal((await homework.queue(a,{runId:run.id,cardId:card.id})).goal.preparedId,id);
  assert.equal(homework.basket(a,{groupId:'g'}).length,1);assert.equal(homework.basket({...a,id:'other'},{groupId:'g'}).length,0);
  await assert.rejects(homework.open(b,id,b.id),{status:404});
  assert.throws(()=>homework.validateGoals(a,{studentId:b.id},[queued.goal]),{status:404});
  const goals=homework.validateGoals(a,{groupId:'g'},[{...queued.goal,preparedResult:{completedAt:new Date().toISOString()}}]);assert.equal('preparedResult' in goals[0],false);
  entries[b.id]=[{id:'hw-b',goals}];entries[c.id]=[{id:'hw-c',goals}];
  channels.codeText.insert(channels.codeText.length,'print(999)');
  const first=await homework.open(b,id,b.id),second=await homework.open(c,id,c.id);
  assert.equal(first.workspace.code.code,"f=open('17.txt')\n");assert.equal(first.workspace.code.testFile,'draft input');
  assert.notEqual(first.run.id,second.run.id);assert.equal(first.workspace.board.items.some(item=>item.id==='notes'),true);assert.equal(JSON.stringify(first).includes('private-teacher-token'),false);
  assert.equal('referenceAnswers' in first.run.cards[0],false);assert.equal(JSON.stringify(first).includes('"100"'),false);
  await assert.rejects(prepared.getRun(c,first.run.id),{status:403});
  await homework.saveWorkspace(b,id,b.id,{...first.workspace,code:{code:'print(42)'},board:{items:[]}});
  await assert.rejects(homework.saveWorkspace(b,id,b.id,{...first.workspace,code:{code:'stale'},board:{items:[]}}),{status:409});
  assert.equal((await homework.open(c,id,c.id)).workspace.code.code,"f=open('17.txt')\n");
  assert.equal(prepared.data.runs[run.id].cards[0].answers[0],'');
  homework.consume(a,{groupId:'g'},goals);assert.equal(homework.basket(a,{groupId:'g'}).length,0);
  assert.equal((await homework.open(b,id,b.id)).workspace.code.code,'print(42)');
});

test('only checked private answers complete a goal, manual payloads and another pupil cannot forge the result',async t=>{
  const {homework,prepared,run,card,a,b,c,entries}=await fixture(t),{goal}=await homework.queue(a,{runId:run.id,cardId:card.id});
  entries[b.id]=[{id:'hw',goals:[goal]}];entries[c.id]=[{id:'hw-c',goals:[goal]}];
  let opened=await homework.open(b,goal.preparedId,b.id);const target=opened.run.cards[0],act=body=>prepared.action(b,opened.run.id,{cardId:target.id,leaseKey:'pupil',...body});
  assert.equal(homework.projectEntry(b.id,{goals:[{...goal,preparedResult:{completedAt:'2026-10-25'}}]}).goals[0].preparedResult.completedAt,null);
  await act({action:'claim'});await act({action:'answer',revision:0,answers:['1','2']});await act({action:'check',revision:1});assert.equal(homework.result(b.id,goal.preparedId).completedAt,null);
  await act({action:'claim'});await act({action:'answer',revision:1,answers:['2','100']});await act({action:'check',revision:2});assert.ok(homework.result(b.id,goal.preparedId).completedAt);
  assert.equal(homework.result(c.id,goal.preparedId).completedAt,null);assert.equal(prepared.data.runs[run.id].cards[0].status,'active');
  opened=await homework.open(b,goal.preparedId,b.id);assert.equal(opened.run.cards[0].status,'solved');
  const restarted=new PreparedHomework({directory:homework.directory,prepared,student:homework.student,homeworks:homework.homeworks});assert.equal(restarted.result(b.id,goal.preparedId).completedAt,homework.result(b.id,goal.preparedId).completedAt);
});

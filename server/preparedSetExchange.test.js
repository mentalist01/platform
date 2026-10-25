import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedSetExchange} from './preparedSetExchange.js';

const a={id:'a',role:'teacher'},b={id:'b',role:'teacher'},c={id:'c',role:'teacher'},student={id:'s',role:'student'};
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-exchange-')),doc=new Y.Doc();
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const deps={directory,sourceFiles:async()=>[],board:async()=>doc,authorize:async auth=>({allowed:true,auth})};
  const store=new PreparedLessonTasks(deps),teachers=()=>[a,b,c].map(person=>({...person,name:'Учитель '+person.id,code:'secret'})),exchange=new PreparedSetExchange(store,teachers);
  const image=store.putAsset(a,Buffer.from('png'),'task.png','image/png',{width:600,height:200});
  const file=store.putAsset(a,Buffer.from('42\n58\n'),'17_2.txt','application/octet-stream');
  const set=await store.saveSet(a,{name:'17 · Часть 2',taskNumber:17,partNumber:2,tasks:[{title:'5',difficult:true,answerMode:'independent',images:[image.id],answers:['2','100'],attachments:[{assetId:file.id,sourceFileId:'private-notes-id',runtime:true,runtimeName:'17_2.txt'}]}]});
  return {store,exchange,set,image,file,deps,teachers};
}

test('private exchange, publication snapshots and revocation never expose drafts or other Notes files',async t=>{
  const {store,exchange,set,image,file}=await fixture(t);
  assert.deepEqual(exchange.catalog(b).sets,[]);
  assert.throws(()=>exchange.catalog(student),{status:403});
  assert.throws(()=>exchange.preview(b,set.id),{status:404});
  assert.throws(()=>exchange.publish(b,set.id,{version:0,recipientIds:['a']}),{status:404});
  assert.throws(()=>exchange.publish(a,set.id,{version:0,recipientIds:['s']}),{status:400});
  const share=exchange.publish(a,set.id,{version:0,recipientIds:['b']});assert.equal(share.version,1);
  assert.equal(JSON.stringify(exchange.catalog(a).teachers).includes('secret'),false);
  const list=exchange.catalog(b);assert.equal(list.sets[0].taskCount,1);assert.equal('tasks' in list.sets[0],false);
  const preview=exchange.preview(b,set.id);assert.deepEqual(preview.set.tasks[0].answers,['2','100']);
  assert.equal(JSON.stringify(preview).includes('private-notes-id'),false);
  assert.match(preview.set.tasks[0].imageFiles[0].url,/lesson-task-exchange/);
  assert.equal(exchange.asset(b,set.id,image.id).id,image.id);
  assert.equal(exchange.asset(b,set.id,file.id).id,file.id);
  const unrelated=store.putAsset(a,Buffer.from('private'),'private.txt','application/octet-stream');
  assert.throws(()=>exchange.asset(b,set.id,unrelated.id),{status:404});
  assert.throws(()=>exchange.preview(c,set.id),{status:404});
  assert.throws(()=>exchange.preview(student,set.id),{status:403});
  const people=exchange.teachers;exchange.teachers=()=>people().map(person=>person.id==='b'?{...person,deletedAt:'2026-10-25'}:person);
  assert.throws(()=>exchange.preview(b,set.id),{status:403});exchange.teachers=people;
  const draft=await store.saveSet(a,{...set,autosave:true,tasks:[{...set.tasks[0],answers:['','']}]},set.id);
  assert.equal(draft.draft,true);assert.deepEqual(exchange.preview(b,set.id).set.tasks[0].answers,['2','100']);
  assert.throws(()=>exchange.publish(a,set.id,{version:1,recipientIds:['b']}),{status:409});
  exchange.publish(a,set.id,{version:1,recipientIds:[]});
  assert.throws(()=>exchange.asset(b,set.id,image.id),{status:404});
});

test('copy is complete, independent, durable, byte-preserving and idempotent through edits and revoked access',async t=>{
  const {store,exchange,set,file,deps,teachers}=await fixture(t);
  exchange.publish(a,set.id,{version:0,recipientIds:['b']});
  const {set:copy}=exchange.copy(b,set.id,{version:1});
  assert.notEqual(copy.id,set.id);assert.notEqual(copy.tasks[0].id,set.tasks[0].id);
  assert.equal(copy.tasks[0].difficult,true);assert.equal(copy.tasks[0].answerMode,'independent');
  assert.equal(copy.tasks[0].attachments[0].runtimeName,'17_2.txt');assert.equal(copy.tasks[0].attachments[0].sourceFileId,'');
  const copiedAsset=store.data.assets[copy.tasks[0].attachments[0].assetId];
  assert.equal(copiedAsset.teacherId,b.id);assert.notEqual(copiedAsset.id,file.id);
  assert.deepEqual(fs.readFileSync(store.assetFile(copiedAsset)),fs.readFileSync(store.assetFile(file)));
  assert.equal(fs.readdirSync(store.assetsDir).length,2,'Logical copies reuse immutable bytes');
  const edited=await store.saveSet(b,{...copy,name:'Моя копия',tasks:[{...copy.tasks[0],answers:['8','9']}]},copy.id);
  assert.equal(store.data.sets[set.id].name,set.name);assert.deepEqual(store.data.sets[set.id].tasks[0].answers,['2','100']);
  const restarted=new PreparedLessonTasks(deps),next=new PreparedSetExchange(restarted,teachers);
  assert.equal(next.copy(b,set.id,{version:1}).set.id,copy.id);assert.equal(next.copy(b,set.id,{version:1}).alreadyCopied,true);
  assert.equal(next.catalog(b).sets[0].copyId,copy.id);assert.equal(restarted.data.sets[copy.id].version,edited.version);
  assert.throws(()=>next.publish(a,set.id,{version:0,recipientIds:[]}),{status:409});
  next.publish(a,set.id,{version:1,recipientIds:[]});
  assert.throws(()=>next.copy(b,set.id,{version:1}),{status:404});assert.deepEqual(next.catalog(b).sets,[]);
  assert.equal(restarted.listSets(b).sets[0].name,'Моя копия');
  assert.equal(fs.readFileSync(restarted.assetFile(copiedAsset),'utf8'),'42\n58\n');
  const run=await restarted.start(b,{room:'board-b',setId:copy.id,x:0,y:0});assert.equal(run.cards[0].attachments[0].runtimeName,'17_2.txt');
  assert.throws(()=>next.preview(a,copy.id),{status:404});
});

test('changed publication requires a fresh preview and permits a separate new copy; missing assets fail before mutation',async t=>{
  const {store,exchange,set,file}=await fixture(t);
  exchange.publish(a,set.id,{version:0,recipientIds:['b']});const first=exchange.copy(b,set.id,{version:1}).set;
  await store.saveSet(a,{...set,name:'Обновлённый набор'},set.id);
  exchange.publish(a,set.id,{version:1,recipientIds:['b']});
  assert.throws(()=>exchange.copy(b,set.id,{version:1}),{status:409});
  const second=exchange.copy(b,set.id,{version:2}).set;assert.notEqual(first.id,second.id);assert.equal(second.name,'Обновлённый набор');
  exchange.publish(a,set.id,{version:2,recipientIds:['b','c']});
  fs.unlinkSync(store.assetFile(file));const before=JSON.stringify(store.data);
  assert.throws(()=>exchange.copy(c,set.id,{version:3}),{status:409});assert.equal(JSON.stringify(store.data),before);
});

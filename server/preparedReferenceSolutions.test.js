import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {PreparedSetExchange} from './preparedSetExchange.js';
import {PreparedHomework} from './preparedHomework.js';
import {uploadPreparedReference,preparedReferenceAsset} from './preparedReferenceSolutions.js';
import {mergePreparedSetSave} from '../src/utils/preparedSetSave.js';

const teacher={id:'t',role:'teacher'},pupil={id:'s',role:'student'},peer={id:'p',role:'student'},other={id:'other',role:'teacher'};
async function fixture(t,extra={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-reference-')),doc=new Y.Doc();
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  let homework;const entries={[pupil.id]:[],[peer.id]:[]};
  const deps={directory,sourceFiles:async()=>[],board:async()=>doc,code:async()=>doc,authorize:async(auth,room,options)=>room.startsWith('prepared-homework-')?homework.access(auth,room,options):{allowed:auth.id!==other.id,auth,studentId:pupil.id,groupId:'g',participantIds:[pupil.id,peer.id]},...extra};
  const store=new PreparedLessonTasks(deps);
  homework=new PreparedHomework({directory:path.join(directory,'homework'),prepared:store,student:id=>[pupil,peer].map(p=>({...p,teacherId:teacher.id})).find(p=>p.id===id),homeworks:id=>entries[id]||[]});
  const image=store.putAsset(teacher,Buffer.from('png'),'condition.png','image/png',{width:600,height:200});
  const input=store.putAsset(teacher,Buffer.from('1\n2\n'),'input.txt','application/octet-stream');
  const reference=uploadPreparedReference(store,teacher,{buffer:Buffer.from('finished solution bytes'),originalname:'Разбор.xlsx'});
  const task={title:'1',images:[image.id],answers:['41','22'],attachments:[{assetId:input.id,runtime:true,runtimeName:'input.txt'}],referenceSolutions:[{assetId:reference.id}]};
  const set=await store.saveSet(teacher,{name:'18',taskNumber:18,tasks:[task,{...task,title:'2'}]});
  const run=await store.start(teacher,{room:'board-group-g',setId:set.id,x:0,y:0});
  const act=async(run,answers,who=pupil,fieldIndex)=>{
    const card=run.cards[0];let next=await store.action(who,run.id,{action:'answer',cardId:card.id,revision:card.answerRevision,answers});
    return store.action(who,run.id,{action:'check',cardId:card.id,revision:next.cards[0].answerRevision,...(fieldIndex!==undefined?{fieldIndex}:{})});
  };
  return {store,doc,directory,deps,image,input,reference,task,set,run,act,homework,entries};
}

test('reference files are private until a correct check, including partial/incorrect answers, skip and read-only teacher views',async t=>{
  const {store,reference,run:initial,act}=await fixture(t);let run=initial;const card=run.cards[0];
  const view=who=>store.publicRun(store.data.runs[run.id],{auth:who});
  assert.equal(view(teacher).cards[0].referenceSolution.files[0].name,'Разбор.xlsx');
  assert.deepEqual(view(pupil).cards[0].referenceSolution,{available:false,files:[]});
  const json=JSON.stringify(view(pupil));assert.equal(json.includes(reference.id),false);assert.equal(json.includes('Разбор.xlsx'),false);
  assert.deepEqual(store.publicRun(store.data.runs[run.id],{auth:teacher,readOnly:true}).cards[0].referenceSolution,{available:false,files:[]});
  assert.equal((await preparedReferenceAsset(store,teacher,run.id,card.id,reference.id)).id,reference.id);
  await assert.rejects(preparedReferenceAsset(store,pupil,run.id,card.id,reference.id),{status:403});
  await assert.rejects(preparedReferenceAsset(store,other,run.id,card.id,reference.id),{status:403});
  await assert.rejects(preparedReferenceAsset(store,pupil,run.id,'future-card',reference.id),{status:404});
  run=await act(run,['41','0']);assert.equal(run.cards[0].lastResult,'wrong');assert.equal(view(pupil).cards[0].referenceSolution.available,false);
  run=await act(run,['41','22']);assert.equal(run.cards[0].status,'solved');
  assert.equal(view(peer).cards[0].referenceSolution.available,true,'A shared group answer unlocks for the group');
  const file=view(pupil).cards[0].referenceSolution.files[0];assert.match(file.url,/reference-solution/);assert.equal('storage' in file,false);assert.equal('hash' in file,false);
  assert.equal(fs.readFileSync(store.assetFile(await preparedReferenceAsset(store,pupil,run.id,card.id,reference.id)),'utf8'),'finished solution bytes');
  run=await store.action(teacher,run.id,{action:'next',expectedCount:1});const second=run.cards[1];
  await store.action(teacher,run.id,{action:'skip',expectedCount:2});
  await assert.rejects(preparedReferenceAsset(store,pupil,run.id,second.id,reference.id),{status:403});
});

test('independent questions unlock only after all fields; tasks without reference files stay unchanged',async t=>{
  const {store,set,act}=await fixture(t);
  const changed=await store.saveSet(teacher,{...set,tasks:[{...set.tasks[0],answerMode:'independent'}]},set.id);
  let run=await store.start(teacher,{room:'board-independent',setId:changed.id,x:0,y:0});
  run=await act(run,['41','22'],pupil,0);assert.equal(run.cards[0].referenceSolution.available,false);assert.notEqual(run.cards[0].status,'solved');
  run=await act(run,['41','22'],pupil,1);assert.equal(run.cards[0].referenceSolution.available,true);
  const legacy=await store.saveSet(teacher,{name:'legacy',taskNumber:18,tasks:[{...set.tasks[0],referenceSolutions:[]}]});
  assert.equal('referenceSolutions' in legacy.tasks[0],false);
  const plain=await store.start(teacher,{room:'board-legacy',setId:legacy.id,x:0,y:0});assert.equal(plain.cards[0].referenceSolution,null);
});

test('source files are copied as immutable solutions, isolated from runtime files, with upload/ownership validation',async t=>{
  const f=await fixture(t),{store,directory,set}=f,source=path.join(directory,'notes.xlsx');fs.writeFileSync(source,'notes solution');
  store.sourceFiles=async()=>[{id:'notes',name:'Notes.xlsx',taskNumber:18,path:source}];
  const saved=await store.saveSet(teacher,{...set,tasks:[{...set.tasks[0],referenceSolutions:[{sourceFileId:'notes'}]}]},set.id);
  const ref=saved.tasks[0].referenceSolutions[0];fs.writeFileSync(source,'updated notes');
  assert.equal(fs.readFileSync(store.assetFile(store.data.assets[ref.assetId]),'utf8'),'notes solution');
  assert.deepEqual(saved.tasks[0].attachments,set.tasks[0].attachments);
  const foreign=store.putAsset(other,Buffer.from('secret'),'foreign.xlsx','application/octet-stream');
  await assert.rejects(store.saveSet(teacher,{...saved,tasks:[{...saved.tasks[0],referenceSolutions:[{assetId:foreign.id}]}]},saved.id),{status:403});
  for(const [auth,file,status] of [[pupil,{originalname:'x.xlsx',buffer:Buffer.from('x')},403],[teacher,{originalname:'x.exe',buffer:Buffer.from('x')},400],[teacher,{originalname:'x.xlsx',buffer:Buffer.alloc(0)},400],[teacher,{originalname:'x.xlsx',buffer:Buffer.alloc(64*1024*1024+1)},413]])assert.throws(()=>uploadPreparedReference(store,auth,file),{status});
  await assert.rejects(store.saveSet(teacher,{...saved,tasks:[{...saved.tasks[0],referenceSolutions:Array(9).fill(ref)}]},saved.id),{status:400});
});

test('updating and removing a reference preserves answers, working-file history, code and board geometry',async t=>{
  const {store,doc,set,run,reference}=await fixture(t),raw=store.data.runs[run.id],card=raw.cards[0];
  await store.action(pupil,run.id,{action:'answer',cardId:card.id,revision:0,answers:['7','9']});
  card.conditionTop=260;card.solutions={kept:{id:'saved'}};card.workbookHistoryCounts={kept:3};
  const anchor=structuredClone(doc.getArray('items').toArray()),codeId=card.codeId;
  let next=await store.saveSet(teacher,{...set,tasks:[{...set.tasks[0],referenceSolutions:[]},set.tasks[1]]},set.id);
  let updated=await store.action(teacher,run.id,{action:'sync-set',setId:next.id,setVersion:next.version});
  assert.equal(updated.cards[0].referenceSolution,null);assert.deepEqual(updated.cards[0].answers,['7','9']);
  next=await store.saveSet(teacher,{...next,tasks:[{...next.tasks[0],referenceSolutions:[{assetId:reference.id}]},next.tasks[1]]},next.id);
  assert.equal(store.publicRun(raw,{auth:teacher}).sources[0].contentUpdateAvailable,true);
  updated=await store.action(teacher,run.id,{action:'sync-set',setId:next.id,setVersion:next.version});
  assert.equal(updated.cards[0].referenceSolution.files.length,1);assert.equal(updated.cards[0].codeId,codeId);assert.equal(updated.cards[0].conditionTop,260);
  assert.deepEqual(doc.getArray('items').toArray(),anchor);assert.deepEqual(raw.cards[0].solutions,{kept:{id:'saved'}});assert.equal(raw.cards[0].workbookHistoryCounts.kept,3);
});

test('exchange copies reference assets without Notes identities; homework unlocks independently for each pupil',async t=>{
  const {store,set,reference,homework,entries,run,act}=await fixture(t);
  store.data.sets[set.id].tasks[0].referenceSolutions[0].sourceFileId='private-notes-reference';
  const exchange=new PreparedSetExchange(store,()=>[teacher,other]);exchange.publish(teacher,set.id,{version:0,recipientIds:[other.id]});
  assert.equal(JSON.stringify(exchange.preview(other,set.id)).includes('private-notes-reference'),false);
  const copy=exchange.copy(other,set.id,{version:1}).set,ref=copy.tasks[0].referenceSolutions[0];
  assert.notEqual(ref.assetId,reference.id);assert.equal(store.data.assets[ref.assetId].teacherId,other.id);
  assert.equal(fs.readFileSync(store.assetFile(store.data.assets[ref.assetId]),'utf8'),'finished solution bytes');
  const {goal}=await homework.queue(teacher,{runId:run.id,cardId:run.cards[0].id});entries[pupil.id]=[{id:'hw',goals:[goal]}];entries[peer.id]=[{id:'hw2',goals:[goal]}];
  const own=await homework.open(pupil,goal.preparedId,pupil.id),second=await homework.open(peer,goal.preparedId,peer.id);
  assert.equal(own.run.cards[0].referenceSolution.available,false);assert.equal(JSON.stringify(own).includes(reference.id),false);
  await act(own.run,['41','22']);assert.equal((await homework.open(pupil,goal.preparedId,pupil.id)).run.cards[0].referenceSolution.available,true);
  assert.equal((await homework.open(peer,goal.preparedId,peer.id)).run.cards[0].referenceSolution.available,false);
  await assert.rejects(preparedReferenceAsset(store,peer,own.run.id,own.run.cards[0].id,reference.id),{status:403});
  await assert.rejects(preparedReferenceAsset(store,peer,second.run.id,second.run.cards[0].id,reference.id),{status:403});
});

test('late autosave acknowledgement resolves reference Notes IDs and preserves newer deletions',()=>{
  const task={id:'one',attachments:[],referenceSolutions:[{sourceFileId:'notes',name:'solution.xlsx'}]},submitted={tasks:[task]},saved={...submitted,id:'set',version:2,tasks:[{...task,referenceSolutions:[{...task.referenceSolutions[0],assetId:'asset'}]}]};
  const edited={...submitted,tasks:[{...task,title:'new'}]};assert.equal(mergePreparedSetSave(edited,submitted,saved).tasks[0].referenceSolutions[0].assetId,'asset');
  const removed={...submitted,tasks:[{...task,referenceSolutions:[]}]};assert.deepEqual(mergePreparedSetSave(removed,submitted,saved).tasks[0].referenceSolutions,[]);
});

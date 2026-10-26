import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {getCollabSolutionChannels} from '../src/utils/collabSolutions.js';

function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-update-')),docs=new Map(),codeDoc=new Y.Doc();
  t.after(()=>{for(const doc of docs.values())doc.destroy();codeDoc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,studentId:'s',participantIds:['s']}),
    board:async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);},code:async()=>codeDoc,sourceFiles:async()=>[]};
  const store=new PreparedLessonTasks(deps);
  const image=store.putAsset(auth,Buffer.from('old'),'old.png','image/png',{width:600,height:180});
  const replacement=store.putAsset(auth,Buffer.from('new'),'new.png','image/png',{width:600,height:240});
  const make=(tasks,extra={})=>store.saveSet(auth,{name:'Набор',taskNumber:5,tasks:tasks.map(task=>({images:[image.id],answers:['73'],...task})),...extra});
  const sync=(run,set,who=auth)=>store.action(who,run.id,{action:'sync-set',setId:set.id,setVersion:set.version});
  const input=async(run,answers,who=pupil,fieldIndex)=>{
    const card=run.cards[0],base={cardId:card.id,leaseKey:'input'};
    await store.action(who,run.id,{action:'claim',...base});
    const answered=await store.action(who,run.id,{action:'answer',...base,revision:card.answerRevision,answers});
    return store.action(who,run.id,{action:'check',...base,revision:answered.cards[0].answerRevision,...(fieldIndex===undefined?{}:{fieldIndex})});
  };
  return {store,deps,docs,codeDoc,auth,pupil,image,replacement,make,sync,input};
}

test('correct a live key and condition in one version; keep input, lease, ink, code and other lessons, then accept the formerly rejected answer',async t=>{
  const f=fixture(t),{store,auth,pupil}=f;
  let set=await f.make([{title:'9'},{title:'10'}]);
  let run=await store.start(auth,{room:'board-t-s',setId:set.id,x:30,y:40});
  const other=await store.start(auth,{room:'board-t-other',setId:set.id,x:50,y:60});
  run=await f.input(run,['9']);assert.equal(run.cards[0].lastResult,'wrong');
  const card=run.cards[0],doc=await f.deps.board(run.room),channels=getCollabSolutionChannels(f.codeDoc,card.codeId);
  channels.codeText.insert(0,'# live code');
  doc.getArray('items').push([{id:'ink',type:'stroke',points:[{x:30,y:240},{x:400,y:240}]}]);
  await store.action(auth,run.id,{action:'layout',cards:[{id:card.id,height:450,conditionTop:153}]});
  await store.action(pupil,run.id,{action:'claim',cardId:card.id,leaseKey:'still-typing'});
  const before=structuredClone(store.data.runs[run.id]),scene=JSON.stringify(doc.getArray('items').toArray());
  set=await store.saveSet(auth,{...set,tasks:set.tasks.map((task,index)=>index?task:{...task,answers:['9'],images:[f.replacement.id]})},set.id);
  assert.equal(store.data.runs[run.id].tasks[0].answers[0],'73','Saving a library draft alone cannot publish an unfinished key');
  assert.equal(store.publicRun(store.data.runs[run.id],{auth}).sources[0].contentUpdateAvailable,true);
  const book=await f.deps.board('board-t-s~pages'),signals=book.getMap('preparedTaskSignals');let notifications=0;
  const observe=()=>notifications++;signals.observe(observe);
  run=await f.sync(run,set);signals.unobserve(observe);
  assert.equal(notifications,1);assert.equal(run.version,before.version+1);
  assert.deepEqual(run.cards[0].answers,['9']);assert.deepEqual(run.cards[0].referenceAnswers,['9']);
  assert.equal(run.cards[0].images[0].id,f.replacement.id);assert.equal(run.cards[0].lastResult,null);
  assert.equal(run.cards[0].answerRevision,before.cards[0].answerRevision);
  assert.deepEqual(store.data.runs[run.id].cards[0].lease,before.cards[0].lease,'An ongoing pupil input lease survives a key correction');
  assert.equal(run.cards[0].conditionTop,153);assert.equal(run.cards[0].id,card.id);assert.equal(run.cards[0].codeId,card.codeId);
  assert.equal(channels.codeText.toString(),'# live code');assert.equal(JSON.stringify(doc.getArray('items').toArray()),scene);
  assert.deepEqual(store.data.runs[other.id].tasks[0].answers,['73']);assert.equal(run.cards.length,1);assert.equal(run.teacherCardId,card.id);
  const pupilView=store.publicRun(store.data.runs[run.id],{auth:pupil});assert.equal('referenceAnswers' in pupilView.cards[0],false);
  assert.equal(JSON.stringify(pupilView).includes('"73"'),false);
  const version=run.version;run=await f.sync(run,set);assert.equal(run.version,version,'Retry is idempotent');
  run=await store.action(pupil,run.id,{action:'check',cardId:card.id,leaseKey:'still-typing',revision:card.answerRevision});
  assert.equal(run.cards[0].status,'solved');assert.equal(run.cards.length,1,'Editing does not advance the queue');
  const restarted=new PreparedLessonTasks(f.deps);
  assert.deepEqual(restarted.data.runs[run.id].tasks[0].answers,['9']);assert.deepEqual(restarted.data.runs[run.id].tasks[0].images,[f.replacement.id]);
});

test('apply only an owned, complete, current version; failed storage rolls back the lesson',async t=>{
  const f=fixture(t),{store,auth,pupil}=f;let set=await f.make([{}]);
  const run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0});
  set=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answers:['9']}))},set.id);
  const original=JSON.stringify(store.data.runs[run.id]);
  await assert.rejects(f.sync(run,set,pupil),{status:403});
  await assert.rejects(f.sync(run,set,{id:'another',role:'teacher'}),{status:403});
  await assert.rejects(f.sync(run,{...set,version:set.version-1}),{status:409});
  const save=store.save;store.save=()=>{throw Error('disk unavailable');};
  await assert.rejects(f.sync(run,set),/disk unavailable/);store.save=save;
  assert.equal(JSON.stringify(store.data.runs[run.id]),original);
  const draft=await store.saveSet(auth,{...set,autosave:true,tasks:set.tasks.map(task=>({...task,answers:['']}))},set.id);
  await assert.rejects(f.sync(run,draft),{status:409});assert.equal(JSON.stringify(store.data.runs[run.id]),original);
  set=await store.saveSet(auth,{...draft,tasks:draft.tasks.map(task=>({...task,answers:['9']}))},set.id);
  store.data.runs[run.id].homework={snapshotId:'snapshot'};
  await assert.rejects(f.sync(run,set),{status:409});
});

test('independent corrections reset only affected questions; answer reshaping preserves visual order and rejects destructive changes',async t=>{
  const f=fixture(t),{store,auth,pupil}=f;
  let set=await f.make([{answerMode:'independent',answerCountOverride:3,answers:['11','22','33']}]);
  let run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0});
  run=await f.input(run,['11','0','0'],pupil,0);assert.deepEqual(run.cards[0].fieldResults,['correct',null,null]);
  set=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answers:['11','44','33']}))},set.id);
  run=await f.sync(run,set);assert.deepEqual(run.cards[0].fieldResults,['correct',null,null]);
  assert.deepEqual(run.cards[0].answers,['11','0','0']);
  set=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answers:['12','44','33']}))},set.id);
  run=await f.sync(run,set);assert.deepEqual(run.cards[0].fieldResults,[null,null,null]);
  const smaller=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answerCountOverride:2,answers:['12','44']}))},set.id);
  const before=JSON.stringify(store.data.runs[run.id]);await assert.rejects(f.sync(run,smaller),{status:409});assert.equal(JSON.stringify(store.data.runs[run.id]),before);
  const expanded=await store.saveSet(auth,{...smaller,tasks:smaller.tasks.map(task=>({...task,answerCountOverride:4,answers:['12','44','33','55']}))},set.id);
  await store.action(pupil,run.id,{action:'claim',cardId:run.cards[0].id,leaseKey:'typing'});
  await store.action(pupil,run.id,{action:'release',cardId:run.cards[0].id,leaseKey:'typing'});
  run=await f.sync(run,expanded);assert.deepEqual(run.cards[0].answers,['11','0','0','']);assert.equal(run.cards[0].answerRevision,2);
});

test('updating an appended source and its theory retains other sources, completed receipts and workbook solutions; part filters still apply',async t=>{
  const f=fixture(t),{store,auth}=f;
  const first=await f.make([{}]);let second=await f.make([{title:'1'},{title:'2',startsPart:true}],{name:'Второй'});
  let run=await store.start(auth,{room:'board-t-s',setId:first.id,x:0,y:0});
  run=await f.input(run,['73'],auth);const completed=structuredClone(store.data.runs[run.id].cards[0]);
  run=await store.appendSet(auth,run.id,{setId:second.id,setVersion:second.version});
  const catalog=await store.taskCatalog(auth,run.id);run=await store.action(auth,run.id,{action:'choose',taskId:catalog.tasks[1].id});
  const card=run.cards[1],asset=store.putAsset(auth,Buffer.from('data'),'input.xlsx','application/octet-stream');
  second=await store.saveSet(auth,{...second,theoryImages:[f.replacement.id],tasks:[{...second.tasks[0],answers:['9'],images:[f.replacement.id],attachments:[{assetId:asset.id}]},second.tasks[1],{images:[f.image.id],answers:['10']}]},second.id);
  const stored=store.data.runs[run.id];stored.cards[1].solutions[asset.id]={id:'saved',name:'solution.xlsx',revision:1};
  run=await f.sync(run,second);
  assert.equal(run.total,5);assert.equal(run.cards.length,2);assert.equal(run.cards[1].id,card.id);assert.equal(run.cards[1].index,2);
  assert.equal(run.cards[1].attachments[0].solution.id,'saved');assert.equal(run.cards[1].images[0].id,f.replacement.id);
  assert.deepEqual(store.data.runs[run.id].cards[0],completed,'Previously accepted credit is not revoked or duplicated');
  assert.deepEqual(store.data.runs[run.id].tasks[0].answers,['73']);
  assert.deepEqual(run.sources.map(source=>source.id),[first.id,second.id]);assert.equal(run.sources[1].contentUpdateAvailable,false);
  const filtered=await store.start(auth,{room:'board-t-filtered',setId:second.id,partNumber:1,x:0,y:0});
  const extra=await store.saveSet(auth,{...second,tasks:[...second.tasks,{images:[f.image.id],answers:['99']}]},second.id);
  const updated=await f.sync(filtered,extra);assert.equal(updated.taskTotal,1,'Tasks in a different part are not appended');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks,preparedAnswerMatches,preparedNextPoint} from './preparedLessonTasks.js';

test('answer formats preserve strings and leading zeroes; numeric and unordered rules are explicit',()=>{
  assert.equal(preparedAnswerMatches(['0012'],['12']),false);
  assert.equal(preparedAnswerMatches(['0012'],[' 0012 ']),true);
  assert.equal(preparedAnswerMatches(['1.5'],['1,5'],'number'),true);
  assert.equal(preparedAnswerMatches(['12'],['1e1'],'number'),false);
  assert.equal(preparedAnswerMatches(['A B'],['B A'],'sequence'),false);
  assert.equal(preparedAnswerMatches(['A B'],['B A'],'unordered'),true);
  assert.equal(preparedAnswerMatches(['12','34'],['12','34'],'fields'),true);
  assert.equal(preparedAnswerMatches(['12','34'],['1234'],'fields'),false);
  assert.equal(preparedAnswerMatches(['42'],['42'],'manual'),false);
});

test('legacy task17 answers migrate once with backups and preserve run identity, status, files and code',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-answer-migration-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]};
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const store=new PreparedLessonTasks(deps),image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
  const set=await store.saveSet(auth,{name:'Мой набор',taskNumber:17,tasks:[{title:'0',images:[image.id],answers:['294','1356810']}]});
  const publicRun=await store.start(auth,{room:'board-student-a',setId:set.id,x:0,y:0}),run=store.data.runs[publicRun.id];
  store.data.sets[set.id].tasks[0].answers=['294 1356810'];store.data.sets[set.id].tasks[0].format='exact';
  run.tasks[0].answers=['294 1356810'];run.tasks[0].format='exact';run.cards[0].answers=['294 1356810'];run.cards[0].status='solved';
  run.cards[0].solutions={file:{id:'saved-file-id',name:'solution.xlsx'}};store.save(run);store.save();
  await store.action(auth,run.id,{action:'claim-code',cardId:run.cards[0].id,leaseKey:'migration-code'});
  await store.action(auth,run.id,{action:'code',cardId:run.cards[0].id,leaseKey:'migration-code',revision:0,code:'print(17)',input:'data',output:'17'});
  const snapshot=JSON.stringify(doc.getArray('items').toArray()),cardId=run.cards[0].id;
  const restarted=new PreparedLessonTasks(deps),migrated=restarted.data.runs[run.id];
  assert.equal(migrated.cards[0].code.text,'print(17)');assert.equal(migrated.cards[0].code.output,'17');
  assert.deepEqual(migrated.tasks[0].answers,['294','1356810']);assert.deepEqual(migrated.cards[0].answers,['294','1356810']);
  assert.equal(migrated.cards[0].id,cardId);assert.equal(migrated.cards[0].status,'solved');assert.equal(migrated.tasks[0].title,'0');
  assert.equal(migrated.cards[0].solutions.file.id,'saved-file-id');assert.equal(JSON.stringify(doc.getArray('items').toArray()),snapshot);
  const backups=()=>fs.readdirSync(directory).filter(name=>name.startsWith('answers-backup-'));
  assert.equal(backups().length,1);const backup=JSON.parse(fs.readFileSync(path.join(directory,backups()[0],'state.json'),'utf8'));
  assert.deepEqual(backup.sets[set.id].tasks[0].answers,['294 1356810']);
  new PreparedLessonTasks(deps);assert.equal(backups().length,1,'Migration is idempotent');
});
test('placement follows handwriting in the work column while ignoring a distant exercise',()=>{
  const point=preparedNextPoint([{type:'stroke',points:[{x:30,y:500},{x:250,y:1500}]},{type:'shape',x:5000,y:0,width:50,height:9000}],{x:0,y:0,width:640,height:400});
  assert.deepEqual(point,{x:0,y:1600});
});
test('shared run: immutable template, explicit modes, answer lease, idempotent advance, independent code and persistence',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-tasks-test-')),docs=new Map();
  const auth={id:'teacher-a',role:'teacher',name:'Учитель'},pupil={id:'student-a',role:'student',name:'Ученик'},outsider={id:'student-c',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:actor.id!=='student-c',readOnly:false,auth:actor,groupId:'group-a',participantIds:['student-a','student-b']}),board:async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);},sourceFiles:async()=>[]};
  const store=new PreparedLessonTasks(deps);t.after(()=>{for(const doc of docs.values())doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('test image'),'test.png','image/png',{width:600,height:100});
  const set=await store.saveSet(auth,{name:'Набор №3',taskNumber:3,partNumber:1,tasks:[{title:'Первая',format:'exact',answers:['007'],images:[image.id]},{title:'Вторая',format:'number',answers:['8'],images:[image.id]}]});
  let run=await store.start(auth,{room:'board-group-a',setId:set.id,x:10,y:20});const id=run.id,first=run.cards[0],key='editor-one';
  assert.equal(run.mode,'prepared');assert.equal(run.canManage,true);assert.equal(run.total,2);assert.equal(run.cards.length,1);
  assert.equal(JSON.stringify(store.publicRun(store.data.runs[id],{auth:pupil})).includes('007'),false,'The reference answer is not in a pupil projection');
  assert.equal(JSON.stringify(run).includes('Вторая'),false,'Future conditions are not published');
  await assert.rejects(store.getRun(outsider,id),{status:403});
  await assert.rejects(store.action(pupil,id,{action:'skip'}),{status:403});
  await store.saveSet(auth,{...set,tasks:[{...set.tasks[0],answers:['new answer']},set.tasks[1]]},set.id);
  await store.action(pupil,id,{action:'claim',cardId:first.id,leaseKey:key});
  await assert.rejects(store.action(pupil,id,{action:'answer',cardId:first.id,leaseKey:key,revision:0,answers:[]}),{status:400});
  await assert.rejects(store.action({id:'student-b',role:'student'},id,{action:'claim',cardId:first.id,leaseKey:'other'}),{status:409});
  await store.action(pupil,id,{action:'answer',cardId:first.id,leaseKey:key,revision:0,answers:['7']});
  run=await store.action(pupil,id,{action:'check',cardId:first.id,leaseKey:key,revision:1});assert.equal(run.cards[0].status,'active');assert.equal(run.result,'wrong');
  await store.action(auth,id,{action:'auto',value:true});
  await store.action(pupil,id,{action:'claim',cardId:first.id,leaseKey:key});
  await store.action(pupil,id,{action:'answer',cardId:first.id,leaseKey:key,revision:1,answers:['007']});
  run=await store.action(pupil,id,{action:'check',cardId:first.id,leaseKey:key,revision:2});assert.equal(run.cards.length,2);assert.equal(run.cards[0].status,'solved');
  run=await store.action(pupil,id,{action:'check',cardId:first.id,leaseKey:key,revision:2});assert.equal(run.cards.length,2,'Repeated completion does not duplicate the next task');
  run=await store.action(auth,id,{action:'next',expectedCount:1});assert.equal(run.cards.length,2,'A stale teacher click does not advance twice');
  await store.action(pupil,id,{action:'claim-code',cardId:first.id,leaseKey:key});
  await store.action(pupil,id,{action:'code',cardId:first.id,leaseKey:key,revision:0,code:'print(7)',input:'x',output:'7'});
  await store.action(auth,id,{action:'mode',mode:'plain'});const restarted=new PreparedLessonTasks(deps),stored=restarted.data.runs[id];
  assert.equal(stored.mode,'plain');assert.equal(stored.cards[0].code.text,'print(7)');assert.equal(stored.cards[1].code.text,'');assert.equal(stored.cards.length,2);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8'))).includes('print(7)'),false,'Typing does not rewrite the catalog or unrelated runs');
  run=await restarted.action(auth,id,{action:'mode',mode:'prepared'});assert.equal(run.cards[0].status,'solved');
});

test('interrupted projection is repaired once, deliberate scene removal stays removed until teacher restores it',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-recovery-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]};
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const store=new PreparedLessonTasks(deps),image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
  const set=await store.saveSet(auth,{name:'Набор',taskNumber:3,tasks:[{images:[image.id],answers:['42']}]});
  const items=doc.getArray('items'),push=items.push.bind(items);let failOnce=true;
  items.push=(...args)=>{if(failOnce){failOnce=false;throw Error('simulated interruption');}return push(...args);};
  await assert.rejects(store.start(auth,{room:'board-student-a',setId:set.id,x:0,y:0}),/simulated interruption/);
  const restarted=new PreparedLessonTasks(deps),run=Object.values(restarted.data.runs)[0];
  assert.equal(run.cards.length,1);assert.equal(run.cards[0].projectionPending,true);
  await restarted.recover(run);await restarted.recover(run);assert.equal(items.length,1);assert.equal(run.cards[0].projectionPending,false);
  items.delete(0,1);await restarted.recover(run);assert.equal(items.length,0);
  await restarted.action(auth,run.id,{action:'restore'});assert.equal(items.length,1);
});

test('compact layout only resizes its own anchor, retaining scaled position, drawings and task data',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-layout-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'};
 const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]});
 t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
 const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
 const set=await store.saveSet(auth,{name:'Набор',taskNumber:17,tasks:[{title:'5',images:[image.id],answers:['1','2']}]});
 const run=await store.start(auth,{room:'board-t-s',setId:set.id,x:10,y:20}),card=run.cards[0],items=doc.getArray('items');
 const anchor={...items.get(0),x:111,y:222,width:1280,height:card.height*2};items.delete(0,1);items.push([anchor,{id:'drawing',type:'stroke',points:[{x:200,y:2000},{x:300,y:2100}]}]);
 const drawing=structuredClone(items.get(1));
 await assert.rejects(store.action({id:'s',role:'student'},run.id,{action:'layout',cards:[{id:card.id,height:200}]}),{status:403});
 await assert.rejects(store.action(auth,run.id,{action:'layout',cards:[{id:card.id,height:-5}]}),{status:400});
 const result=await store.action(auth,run.id,{action:'layout',cards:[{id:card.id,height:260}]});
 const placed=items.toArray().find(item=>item.id===card.anchorId);assert.equal(placed.height,520);assert.equal(placed.x,111);assert.equal(placed.y,222);assert.equal(placed.width,1280);
 assert.deepEqual(items.toArray().find(item=>item.id==='drawing'),drawing);assert.equal(result.cards[0].id,card.id);assert.equal(result.cards[0].codeId,card.codeId);assert.deepEqual(result.cards[0].answers,['','']);
 const repeat=await store.action(auth,run.id,{action:'layout',cards:[{id:card.id,height:260}]});assert.equal(repeat.version,result.version);
});


test('old group pupil helper sessions and tickets cannot change a saved workbook; teacher can reclaim old pupil binding',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-group-readonly-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor,groupId:'g',participantIds:['s']}),board:async()=>doc,sourceFiles:async()=>[]});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100}),asset=store.putAsset(auth,Buffer.from('source'),'data.xlsx','application/octet-stream');
  const set=await store.saveSet(auth,{name:'Набор',taskNumber:3,tasks:[{images:[image.id],answers:['42'],attachments:[{assetId:asset.id}]}]});
  const view=await store.start(auth,{room:'board-group-g',setId:set.id,x:0,y:0}),run=store.data.runs[view.id],card=run.cards[0];
  const crypto=await import('node:crypto'),hash=v=>crypto.createHash('sha256').update(v).digest('hex');
  const legacy={auth:pupil,runId:run.id,cardId:card.id,assetId:asset.id,generation:1,expires:Date.now()+60000};
  card.bindings={[asset.id]:{id:'old-group-binding',actor:'student:s',name:'Ученик',generation:1,until:Date.now()+3600000}};store.data.sessions[hash('pt_legacy')]=legacy;store.tickets.set(hash('pt_old-ticket'),legacy);
  const snapshot=JSON.stringify(run);
  await assert.rejects(store.startHelper(pupil,run.id,card.id,asset.id),{status:403});
  await assert.rejects(store.exchange('pt_old-ticket'),{status:403});
  await assert.rejects(store.helperSession('pt_legacy'),{status:403});
  await assert.rejects(store.saveSolution({auth:pupil,run,card,assetId:asset.id,buffer:Buffer.from('overwrite'),name:'data.xlsx',revision:0,generation:1}),{status:403});
  assert.equal(JSON.stringify(run),snapshot,'Rejected legacy writes do not change the canonical run');
  const launch=await store.startHelper(auth,run.id,card.id,asset.id),session=await store.exchange(launch.ticket);assert.equal(session.workbookKey,'old-group-binding');
  const solution=await store.saveSolution({auth,run,card,assetId:asset.id,buffer:Buffer.from('teacher saved'),name:'data.xlsx',revision:0,generation:card.bindings[asset.id].generation});
  assert.equal(solution.savedBy.role,'teacher');assert.equal(store.notesForStudent('s',pupil)[0].workbookReadOnly,true);
});

test('individual pupil still opens and saves their own workbook',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-individual-writer-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor,studentId:'s'}),board:async()=>doc,sourceFiles:async()=>[]});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100}),asset=store.putAsset(auth,Buffer.from('source'),'data.xlsx','application/octet-stream');
  const set=await store.saveSet(auth,{name:'Набор',taskNumber:3,tasks:[{images:[image.id],answers:['42'],attachments:[{assetId:asset.id}]}]});
  const view=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0}),run=store.data.runs[view.id],card=run.cards[0];
  assert.equal(store.publicRun(run,{auth:pupil}).canEditFiles,true);
  const launch=await store.startHelper(pupil,run.id,card.id,asset.id),session=await store.exchange(launch.ticket);assert.equal((await store.helperSession(session.token)).run.id,run.id);
  const saved=await store.saveSolution({auth:pupil,run,card,assetId:asset.id,buffer:Buffer.from('my own work'),name:'data.xlsx',revision:0,generation:card.bindings[asset.id].generation});
  assert.equal(saved.savedBy.role,'student');assert.equal(store.notesForStudent('s',pupil)[0].workbookReadOnly,false);
});


test('teacher chooses any task once; next and auto follow its original position without adding intermediate conditions',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-task-picker-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100}),set=await store.saveSet(auth,{name:'Набор',taskNumber:17,tasks:Array.from({length:10},(_,i)=>({title:String(i+1),images:[image.id],answers:['42','99']}))});
  let run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0});const first=structuredClone(run.cards[0]);
  doc.getArray('items').push([{id:'working',type:'stroke',points:[{x:50,y:9000},{x:80,y:9100}]}]);
  const catalog=await store.taskCatalog(auth,run.id);assert.equal(catalog.tasks.length,10);assert.equal('answers' in catalog.tasks[0],false);
  await assert.rejects(store.taskCatalog(pupil,run.id),{status:403});await assert.rejects(store.action(pupil,run.id,{action:'choose',taskId:set.tasks[6].id}),{status:403});
  run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[6].id});assert.deepEqual(run.cards.map(card=>card.index),[0,6]);assert.equal(run.cards[1].title,'7');assert.ok(doc.getArray('items').toArray().find(item=>item.id===run.cards[1].anchorId).y>9100);
  const seventh=structuredClone(run.cards[1]);run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[6].id});assert.equal(run.cards.length,2);assert.equal(run.cards[1].id,seventh.id);assert.equal(run.cards[0].id,first.id);assert.equal(run.cards[0].status,'active');
  await store.action(auth,run.id,{action:'auto',value:true});await store.action(auth,run.id,{action:'claim',cardId:seventh.id,leaseKey:'check'});
  run=await store.action(auth,run.id,{action:'check',cardId:seventh.id,leaseKey:'check',revision:0,accept:true});assert.deepEqual(run.cards.map(card=>card.index),[0,6,7]);assert.equal(run.cards.at(-1).title,'8');
  run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[9].id});const last=run.cards.at(-1);run=await store.action(auth,run.id,{action:'skip',expectedCount:run.cards.length,fromCardId:last.id});assert.equal(run.cards.length,4,'The end never wraps into earlier unshown tasks');
  run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[3].id});const fourth=run.cards.at(-1);await store.action(auth,run.id,{action:'claim',cardId:fourth.id,leaseKey:'check-fourth'});run=await store.action(auth,run.id,{action:'check',cardId:fourth.id,leaseKey:'check-fourth',revision:0,accept:true});assert.equal(run.cards.at(-1).index,4);
  const count=run.cards.length;run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[6].id});run=await store.action(auth,run.id,{action:'next',expectedCount:count,fromCardId:seventh.id});assert.equal(run.cards.length,count,'An existing next task is selected, not duplicated');assert.equal(run.teacherCardId,run.cards.find(card=>card.index===7).id);
  await assert.rejects(store.action(auth,run.id,{action:'choose',taskId:'unknown-task'}),{status:404});
});

test('removing the accidental third card lets next restore it once, preserving its code, solutions and surrounding drawing',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-deleted-next-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]},store=new PreparedLessonTasks(deps);
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100}),set=await store.saveSet(auth,{name:'Набор',taskNumber:17,tasks:Array.from({length:6},(_,i)=>({title:String(i+1),images:[image.id],answers:['42','99']}))});
  let run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0});const solve=async card=>{await store.action(auth,run.id,{action:'claim',cardId:card.id,leaseKey:card.id});return store.action(auth,run.id,{action:'check',cardId:card.id,leaseKey:card.id,revision:card.answerRevision,accept:true});};
  run=await solve(run.cards[0]);run=await store.action(auth,run.id,{action:'next',expectedCount:1,fromCardId:run.cards[0].id});run=await solve(run.cards[1]);const second=run.cards[1];
  run=await store.action(auth,run.id,{action:'next',expectedCount:2,fromCardId:second.id});const third=run.cards[2],saved=store.data.runs[run.id].cards[2];
  await store.action(auth,run.id,{action:'claim-code',cardId:third.id,leaseKey:'saved-code'});await store.action(auth,run.id,{action:'code',cardId:third.id,leaseKey:'saved-code',revision:0,code:'print(26)',input:'data',output:'26'});saved.solutions={source:{id:'kept-solution',name:'saved.ods'}};store.save(store.data.runs[run.id]);
  const items=doc.getArray('items');items.delete(items.toArray().findIndex(item=>item.id===third.anchorId),1);const drawing={id:'drawing-below',type:'stroke',points:[{x:10,y:12000},{x:20,y:12100}]};items.push([drawing]);
  run=await store.action(auth,run.id,{action:'next',expectedCount:3,fromCardId:second.id});assert.equal(run.cards.length,3);assert.equal(run.teacherCardId,third.id);assert.equal(items.toArray().filter(item=>item.id===third.anchorId).length,1);assert.ok(items.toArray().find(item=>item.id===third.anchorId).y>12100);assert.deepEqual(items.toArray().find(item=>item.id===drawing.id),drawing);
  run=await store.action(auth,run.id,{action:'next',expectedCount:3,fromCardId:second.id});assert.equal(run.cards.length,3,'A double click never goes to a fourth task');
  items.delete(items.toArray().findIndex(item=>item.id===third.anchorId),1);run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[5].id});assert.equal(run.cards.at(-1).index,5,'A removed earlier card does not block a later choice');
  run=await store.action(auth,run.id,{action:'choose',taskId:set.tasks[2].id});assert.equal(run.teacherCardId,third.id);assert.equal(run.cards.length,4);const restarted=new PreparedLessonTasks(deps),old=restarted.data.runs[run.id].cards.find(card=>card.id===third.id);assert.equal(old.codeId,third.codeId);assert.equal(old.code.text,'print(26)');assert.equal(old.solutions.source.id,'kept-solution');assert.equal(old.status,'active');
});


test('four independent questions keep partial results, lock correct fields and advance only after all are checked',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-independent-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,groupId:'g',participantIds:['s']}),board:async()=>doc,sourceFiles:async()=>[]};
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  let store=new PreparedLessonTasks(deps);const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
  const template={title:'Два условия',images:[image.id],answerMode:'independent',answerCountOverride:4,format:'number',answers:['1.5','22','33','44']};
  const set=await store.saveSet(auth,{name:'Тренировка',taskNumber:22,tasks:[template,{images:[image.id],answers:['next-secret']}]});
  await assert.rejects(store.saveSet(auth,{...set,tasks:[{...template,answerMode:'unknown'}]}),{status:400});
  let run=await store.start(auth,{room:'board-group-g',setId:set.id,x:0,y:0});const card=run.cards[0],id=run.id;
  assert.equal(card.answerMode,'independent');assert.equal(card.answerCount,4);assert.deepEqual(card.fieldResults,[null,null,null,null]);
  await store.action(auth,id,{action:'auto',value:true});
  const act=(body,actor=pupil)=>store.action(actor,id,{cardId:card.id,leaseKey:'questions',...body});
  await act({action:'claim'});await act({action:'answer',revision:0,answers:['1,5','0','','']});
  await assert.rejects(act({action:'check',revision:1}),{status:400});
  for(const fieldIndex of [-1,4,0.5,null,'0'])await assert.rejects(act({action:'check',revision:1,fieldIndex}),{status:400});
  run=await act({action:'check',revision:1,fieldIndex:0});assert.deepEqual(run.cards[0].fieldResults,['correct',null,null,null]);assert.equal(run.cards[0].status,'active');assert.equal(run.cards.length,1);
  assert.equal(JSON.stringify(run).includes('next-secret'),false);assert.equal(JSON.stringify(run).includes('"33"'),false);
  await act({action:'claim'});await assert.rejects(act({action:'answer',revision:1,answers:['wrong','0','','']}),{status:409});
  run=await act({action:'check',revision:1,fieldIndex:1,accept:true});assert.equal(run.cards[0].fieldResults[1],'wrong','A pupil cannot award credit');
  store=new PreparedLessonTasks(deps);assert.deepEqual(store.publicRun(store.data.runs[id],{auth:pupil}).cards[0].fieldResults,['correct','wrong',null,null]);
  await act({action:'claim'});await act({action:'answer',revision:1,answers:['1,5','0','33','']});
  run=await act({action:'check',revision:2,fieldIndex:2});assert.deepEqual(run.cards[0].fieldResults,['correct','wrong','correct',null]);assert.equal(run.cards.length,1);
  await act({action:'claim'});await assert.rejects(act({action:'check',revision:1,fieldIndex:1}),{status:409});
  run=await act({action:'answer',revision:2,answers:['1,5','22','33','44']});assert.deepEqual(run.cards[0].fieldResults,['correct',null,'correct',null]);
  run=await act({action:'check',revision:3,fieldIndex:1});assert.equal(run.cards[0].status,'active');assert.equal(run.cards.length,1);
  await act({action:'claim'});run=await act({action:'check',revision:3,fieldIndex:3});assert.equal(run.cards[0].status,'solved');assert.deepEqual(run.cards[0].fieldResults,['correct','correct','correct','correct']);assert.equal(run.cards.length,2);
  run=await act({action:'check',revision:3,fieldIndex:3});assert.equal(run.cards.length,2,'Repeated last-question checks never add another card');
  const restarted=new PreparedLessonTasks(deps),restored=restarted.publicRun(restarted.data.runs[id],{auth:pupil});assert.equal(restored.cards[0].id,card.id);assert.equal(restored.cards[0].codeId,card.codeId);
});

test('independent manual questions require teacher credit per question; ordinary EGE still checks all fields together',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-question-modes-')),doc=new Y.Doc(),teacher={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(teacher,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
  const set=await store.saveSet(teacher,{name:'Разные проверки',taskNumber:17,tasks:[{answerMode:'independent',answerCountOverride:2,format:'manual',images:[image.id],answers:['','']},{format:'fields',images:[image.id],answers:['12','34']}]});
  let run=await store.start(teacher,{room:'board-t-s',setId:set.id,x:0,y:0});const first=run.cards[0];
  const act=(actor,body)=>store.action(actor,run.id,{cardId:first.id,leaseKey:'manual',...body});
  await act(pupil,{action:'claim'});await act(pupil,{action:'answer',revision:0,answers:['Объяснение','']});await assert.rejects(act(pupil,{action:'check',revision:1,fieldIndex:0,accept:true}),{status:409});
  await act(teacher,{action:'claim',force:true});run=await act(teacher,{action:'check',revision:1,fieldIndex:0,accept:true});assert.equal(run.cards[0].status,'active');assert.deepEqual(run.cards[0].fieldResults,['correct',null]);
  await act(teacher,{action:'claim'});run=await act(teacher,{action:'check',revision:1,fieldIndex:1,accept:true});assert.equal(run.cards[0].status,'solved');
  run=await store.action(teacher,run.id,{action:'next',expectedCount:1,fromCardId:first.id});const second=run.cards[1];assert.equal(second.answerMode,'combined');
  const combined=body=>store.action(pupil,run.id,{cardId:second.id,leaseKey:'combined',...body});await combined({action:'claim'});await combined({action:'answer',revision:0,answers:['12','wrong']});
  await assert.rejects(combined({action:'check',revision:1,fieldIndex:0}),{status:400});run=await combined({action:'check',revision:1});assert.equal(run.cards[1].status,'active');assert.deepEqual(run.cards[1].fieldResults,[]);
  await combined({action:'claim'});await combined({action:'answer',revision:1,answers:['12','34']});run=await combined({action:'check',revision:2});assert.equal(run.cards[1].status,'solved');
});


test('autosave persists incomplete sets with stable identities, rejects stale saves and keeps unfinished tasks off live boards',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-autosave-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]},store=new PreparedLessonTasks(deps);
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const crypto=await import('node:crypto'),setId=crypto.randomUUID(),taskId=crypto.randomUUID();
  let saved=await store.saveSet(auth,{id:setId,version:0,autosave:true,name:'',taskNumber:22,tasks:[{id:taskId,title:'',answers:[''],images:[]}]});
  assert.equal(saved.id,setId);assert.equal(saved.tasks[0].id,taskId);assert.equal(saved.draft,true);
  assert.equal(new PreparedLessonTasks(deps).data.sets[setId].tasks[0].id,taskId);
  await assert.rejects(store.start(auth,{room:'board-t-s',setId,x:0,y:0}),{status:409});
  await assert.rejects(store.saveSet(auth,{...saved,autosave:false},setId),{status:400});
  await assert.rejects(store.saveSet(auth,{...saved,version:0,autosave:true},setId),{status:409});
  await assert.rejects(store.saveSet(pupil,{...saved,autosave:true},setId),{status:403});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});
  saved=await store.saveSet(auth,{...saved,autosave:true,name:'Процессы',tasks:[{...saved.tasks[0],title:'5',images:[image.id],answers:['12']}]},setId);assert.equal(saved.draft,undefined);
  const run=await store.start(auth,{room:'board-t-s',setId,x:0,y:0});assert.deepEqual(run.cards[0].referenceAnswers,['12']);
  const secondId=crypto.randomUUID();saved=await store.saveSet(auth,{...saved,autosave:true,tasks:[...saved.tasks,{id:secondId,images:[],answers:['']}]},setId);
  assert.equal(saved.draft,true);assert.equal(store.publicRun(store.data.runs[run.id],{auth}).newTasksAvailable,0);
  assert.equal((await store.start(auth,{room:'board-t-s',setId,x:0,y:0})).id,run.id,'An unfinished template never blocks resuming an existing snapshot');
  await assert.rejects(store.action(auth,run.id,{action:'sync-queue',setVersion:saved.version}),{status:409});
  saved=await store.saveSet(auth,{...saved,autosave:true,tasks:saved.tasks.map(task=>({...task,images:[image.id],answers:['34']}))},setId);assert.equal(saved.draft,undefined);
  const updated=await store.action(auth,run.id,{action:'sync-queue',setVersion:saved.version});assert.equal(updated.total,2);assert.deepEqual(store.data.runs[run.id].tasks[0].answers,['12']);assert.equal(store.data.runs[run.id].tasks[1].id,secondId);
});

test('only managing teachers receive reference answers; no references enter shared Yjs or pupil action responses',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-private-reference-')),doc=new Y.Doc(),teacher={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]});
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(teacher,Buffer.from('image'),'test.png','image/png',{width:600,height:100}),secret='teacher-only-expected';
  const set=await store.saveSet(teacher,{name:'Проверка',taskNumber:3,tasks:[{images:[image.id],answers:[secret]}]});
  let run=await store.start(teacher,{room:'board-t-s',setId:set.id,x:0,y:0});assert.deepEqual(run.cards[0].referenceAnswers,[secret]);
  assert.equal('referenceAnswers' in store.publicRun(store.data.runs[run.id],{auth:pupil}).cards[0],false);
  assert.equal('referenceAnswers' in store.publicRun(store.data.runs[run.id],{auth:teacher,readOnly:true}).cards[0],false);
  const card=run.cards[0],act=body=>store.action(pupil,run.id,{cardId:card.id,leaseKey:'input',...body});
  await act({action:'claim'});await act({action:'answer',revision:0,answers:['wrong']});run=await act({action:'check',revision:1});
  assert.equal(JSON.stringify(run).includes(secret),false);assert.equal('referenceAnswers' in run.cards[0],false);
  assert.equal(JSON.stringify(doc.toJSON()).includes(secret),false);
});


test('explicit checking-mode update preserves the live task identity, entered answers, code and immutable reference',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-sync-checking-')),doc=new Y.Doc(),auth={id:'t',role:'teacher'},pupil={id:'s',role:'student'};
  const store=new PreparedLessonTasks({directory,authorize:async actor=>({allowed:true,auth:actor}),board:async()=>doc,sourceFiles:async()=>[]});t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const image=store.putAsset(auth,Buffer.from('image'),'test.png','image/png',{width:600,height:100});let set=await store.saveSet(auth,{name:'Два вопроса',taskNumber:22,tasks:[{images:[image.id],answerCountOverride:2,answers:['12','34']}]});
  let run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0});const card=run.cards[0];
  await store.action(pupil,run.id,{action:'claim',cardId:card.id,leaseKey:'input'});await store.action(pupil,run.id,{action:'answer',cardId:card.id,leaseKey:'input',revision:0,answers:['12','wrong']});
  const scene=JSON.stringify(doc.getArray('items').toArray());set=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answerMode:'independent',format:'exact'}))},set.id);
  assert.equal(store.publicRun(store.data.runs[run.id],{auth}).checkingUpdateAvailable,true);
  await assert.rejects(store.action(pupil,run.id,{action:'sync-checking',setVersion:set.version}),{status:403});
  run=await store.action(auth,run.id,{action:'sync-checking',setVersion:set.version});assert.equal(run.cards[0].answerMode,'independent');assert.deepEqual(run.cards[0].answers,['12','wrong']);assert.equal(run.cards[0].id,card.id);assert.equal(run.cards[0].codeId,card.codeId);assert.equal(JSON.stringify(doc.getArray('items').toArray()),scene);assert.deepEqual(run.cards[0].fieldResults,[null,null]);
  set=await store.saveSet(auth,{...set,tasks:set.tasks.map(task=>({...task,answerMode:'combined',answers:['new','reference']}))},set.id);
  await assert.rejects(store.action(auth,run.id,{action:'sync-checking',setVersion:set.version}),{status:409});assert.deepEqual(store.data.runs[run.id].tasks[0].answers,['12','34']);assert.equal(store.data.runs[run.id].tasks[0].answerMode,'independent');
});

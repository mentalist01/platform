import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-writer-')),doc=new Y.Doc();
  t.after(()=>{doc.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const auth={id:'t',role:'teacher',name:'Преподаватель'},pupil={id:'s',role:'student',name:'Ученик'};
  const deps={directory,authorize:async actor=>({allowed:true,auth:actor,studentId:'s',participantIds:['s']}),board:async()=>doc,sourceFiles:async()=>[]};
  const store=new PreparedLessonTasks(deps),image=store.putAsset(auth,Buffer.from('image'),'task.png','image/png',{width:600,height:100}),asset=store.putAsset(auth,Buffer.from('source'),'22_05.xlsx','application/octet-stream');
  const set=await store.saveSet(auth,{name:'Процессы',taskNumber:22,tasks:[{answers:['55'],images:[image.id],attachments:[{assetId:asset.id}]}]});
  const run=await store.start(auth,{room:'board-t-s',setId:set.id,x:0,y:0}),card=store.data.runs[run.id].cards[0];
  const launch=async who=>{const ticket=await store.startHelper(who,run.id,card.id,asset.id);return store.exchange(ticket.ticket);};
  const action=(who,input)=>store.action(who,run.id,{cardId:card.id,assetId:asset.id,...input});
  const save=async(grant,buffer,revision)=>{const session=await store.helperSession(grant.token);return store.lock(()=>store.saveSolution({auth:session.session.auth,run:session.run,card:session.card,assetId:asset.id,generation:session.session.generation,buffer:Buffer.from(buffer),name:asset.name,revision,viaHelper:true}));};
  return {store,deps,auth,pupil,asset,run,card,launch,action,save};
}

test('accidental transfer before first save can resume the same installed helper token across restart',async t=>{
  const f=await fixture(t),{store,pupil,card}=f,grant=await f.launch(pupil);
  await assert.rejects(f.action(pupil,{action:'release-file'}),{status:409});
  assert.equal(store.data.runs[f.run.id].cards[0].bindings[f.asset.id].generation,1,'An unnoticed premature click does not revoke saving');
  await f.action(pupil,{action:'release-file',allowWithoutSave:true});
  await assert.rejects(f.save(grant,'unsaved local work',0),{status:409});
  const resumed=await f.action(pupil,{action:'resume-file'});assert.equal(resumed.cards[0].attachments[0].writer.isSelf,true);assert.equal(resumed.cards[0].attachments[0].writer.active,true);
  let restarted=new PreparedLessonTasks(f.deps);const active=await restarted.helperSession(grant.token);
  const saved=await restarted.saveSolution({auth:pupil,run:active.run,card:active.card,assetId:f.asset.id,generation:active.session.generation,buffer:Buffer.from('unsaved local work'),name:f.asset.name,revision:0,viaHelper:true});
  assert.equal(saved.revision,1);assert.equal(saved.savedBy.name,pupil.name);assert.equal(active.card.id,card.id);
});

test('a pupil can resume their old window after teacher returns an unchanged file; active writer and newer saved work stay protected',async t=>{
  const f=await fixture(t),{auth,pupil}=f,studentGrant=await f.launch(pupil);
  await f.action(pupil,{action:'release-file',allowWithoutSave:true});
  const teacherGrant=await f.launch(auth);
  await assert.rejects(f.action(pupil,{action:'resume-file'}),{status:409});
  await assert.rejects(f.save(studentGrant,'student work',0),{status:409});
  await f.action(auth,{action:'release-file',allowWithoutSave:true});
  await f.action(pupil,{action:'resume-file'});const first=await f.save(studentGrant,'student work',0);assert.equal(first.revision,1);
  await assert.rejects(f.save(teacherGrant,'old teacher window',0),{status:409});
  await f.action(pupil,{action:'release-file'});const currentTeacher=await f.launch(auth);
  await f.save(currentTeacher,'teacher new version',1);
  await f.action(auth,{action:'release-file'});await f.action(pupil,{action:'resume-file'});
  await assert.rejects(f.save(studentGrant,'stale student overwrite',1),{status:409});
  const current=f.store.data.runs[f.run.id].cards[0].solutions[f.asset.id];assert.equal(current.revision,2);
  assert.equal(fs.readFileSync(f.store.assetFile(current),'utf8'),'teacher new version');
  assert.equal(f.store.data.runs[f.run.id].cards[0].conflicts.length,1,'The stale local upload is retained as a conflict copy');
  const malicious={id:'another',role:'student'};await f.action(auth,{action:'release-file'});
  await assert.rejects(f.action(malicious,{action:'resume-file'}),{status:409});
});

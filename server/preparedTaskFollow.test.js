import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {PreparedLessonTasks} from './preparedLessonTasks.js';
import {preparedTheoryFollowTarget} from '../src/utils/preparedTheoryFollow.js';

function fixture(t,group=false){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'task-follow-')),docs=new Map(),auth={id:'teacher',role:'teacher'},pupil={id:'pupil',role:'student'};
  const doc=async room=>{if(!docs.has(room))docs.set(room,new Y.Doc());return docs.get(room);};
  const access=who=>({allowed:true,auth:who,studentId:group?'':pupil.id,groupId:group?'group-3':'',participantIds:group?['pupil','second']:[]});
  const store=new PreparedLessonTasks({directory,board:doc,code:doc,sourceFiles:async()=>[],authorize:async who=>access(who)});
  const image=store.putAsset(auth,Buffer.from('condition'),'condition.png','image/png',{width:600,height:160}).id;
  t.after(()=>{for(const d of docs.values())d.destroy();fs.rmSync(directory,{recursive:true,force:true});});
  const start=async({theory=false}={})=>{const set=await store.saveSet(auth,{name:'Практика',taskNumber:4,theoryImages:theory?[image]:[],theoryMode:'steps',tasks:[1,2,3].map(n=>({title:String(n),images:[image],answers:[String(n)]}))});return store.start(auth,{room:'board-task-follow',setId:set.id,x:100,y:150});};
  const student=view=>store.publicRun(store.data.runs[view.id],access(pupil));
  const solve=async (view,cardId=view.teacherCardId)=>{const card=view.cards.find(c=>c.id===cardId);view=await store.action(pupil,view.id,{action:'answer',cardId:card.id,answerSchema:card.answerSchema,patches:[{index:0,value:card.title}]});return store.action(pupil,view.id,{action:'check',cardId:card.id,answerSchema:card.answerSchema});};
  return {store,auth,pupil,doc,start,student,solve};
}

test('next and skip focus the new question for individual pupils and every group participant',async t=>{
  for(const group of [false,true]){
    const f=fixture(t,group);let view=await f.start();view=await f.solve(view);let before=f.student(view);
    view=await f.store.action(f.auth,view.id,{action:'next',expectedCount:1,fromCardId:view.teacherCardId});
    assert.deepEqual(preparedTheoryFollowTarget(before,f.student(view)),{selectedId:view.cards[1].id,theoryFollowRevision:view.theoryFocus.revision});
    before=f.student(view);view=await f.store.action(f.auth,view.id,{action:'skip',expectedCount:2,fromCardId:view.teacherCardId});
    assert.equal(view.cards[1].status,'skipped');assert.equal(preparedTheoryFollowTarget(before,f.student(view)).selectedId,view.cards[2].id);
    assert.equal(preparedTheoryFollowTarget(before,{...view,canManage:true}),null);
  }
});

test('explicit insertion from the picker follows, while reading, editing, layout and ordinary tab changes do not',async t=>{
  const f=fixture(t);let view=await f.start(),before=f.student(view);
  const run=f.store.data.runs[view.id];view=await f.store.action(f.auth,view.id,{action:'choose',taskId:run.tasks[2].id});
  assert.equal(preparedTheoryFollowTarget(before,f.student(view)).selectedId,view.cards[1].id);
  before=f.student(view);const focus=view.theoryFocus;
  for(const input of [{action:'focus',cardId:view.cards[0].id},{action:'auto',value:true},{action:'layout',cards:[{id:view.cards[0].id,height:900}]},{action:'answer',cardId:view.cards[0].id,answerSchema:view.cards[0].answerSchema,patches:[{index:0,value:'wrong'}]}]){
    view=await f.store.action(f.auth,view.id,input);assert.deepEqual(view.theoryFocus,focus);assert.equal(preparedTheoryFollowTarget(before,f.student(view)),null);before=f.student(view);
  }
});

test('auto advance retains celebration on the solved card; a pupil looking elsewhere still reaches the new question',async t=>{
  const f=fixture(t);let view=await f.start();view=await f.store.action(f.auth,view.id,{action:'auto',value:true});
  const before=f.student(view),solvedId=view.teacherCardId;view=await f.solve(view);const after=f.student(view);
  assert.equal(after.theoryFocus.afterSolve,solvedId);assert.equal(preparedTheoryFollowTarget(before,after,solvedId),null);
  assert.equal(preparedTheoryFollowTarget(before,after,'another-card').selectedId,view.cards[1].id);
  assert.equal(preparedTheoryFollowTarget(after,{...after,version:999},solvedId),null);
});

test('the active exercise advances even while the teacher refers back to its theory',async t=>{
  const f=fixture(t);
  let view=await f.start({theory:true});
  const sheet=view.cards[0];
  view=await f.store.action(f.auth,view.id,{action:'auto',value:true});
  view=await f.store.action(f.auth,view.id,{action:'theory-next',cardId:sheet.id});
  const exercise=view.cards[1];
  const before=await f.store.action(f.auth,view.id,{action:'focus',cardId:sheet.id});
  const beforePupil=f.student(before);

  const result=await f.solve(before,exercise.id);
  const next=result.cards[2];
  assert.equal(next?.title,'2');
  assert.equal(result.cards[1].status,'solved');
  assert.equal(result.theoryFocus.afterSolve,exercise.id);
  const afterTeacher={...result,canManage:true};
  assert.equal(preparedTheoryFollowTarget(before,afterTeacher,sheet.id)?.selectedId,next.id);
  assert.equal(preparedTheoryFollowTarget(before,afterTeacher,exercise.id),null);
  assert.equal(preparedTheoryFollowTarget(beforePupil,result,exercise.id),null);
});

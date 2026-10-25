import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {partFixture} from './preparedSetParts.fixture.js';
import {StudentStudyProgress} from './studentStudyProgress.js';
import {createStudyPlan} from '../src/utils/egeStudyPlan.js';
import {boardPagesList} from '../src/utils/boardPages.js';
import {mutateLessonPage} from './lessonPageCatalog.js';

async function fixture(t) {
  const f=await partFixture(t),book=await f.document('board-t-p~pages'),plan=createStudyPlan();
  book.getMap('pages').set('main',{title:'18'});
  const deps={dataDir:f.directory,students:()=>[{id:'p',teacherId:'t'}],plans:{get:()=>plan},prepared:f.prepared,pages:async()=>boardPagesList(book.getMap('pages')),createPage:async(_student,input)=>({id:mutateLessonPage(book,input)})};
  const progress=new StudentStudyProgress(deps),change=input=>progress.change(f.auth,'p',{revision:progress.record('t','p').revision,...input});
  await change({action:'current',pageId:'main',blockId:'18',partNumber:1});await change({action:'complete',pageId:'main'});
  const preview=(await progress.detail(f.auth,'p')).transition;
  const input={action:'transition',operationId:crypto.randomUUID(),blockId:'9',partNumber:1,name:'Задание №9',parts:preview.parts.map(part=>({partNumber:part.partNumber,name:part.name,setId:f.set.id,version:f.set.version,sourcePartNumber:part.partNumber}))};
  return {...f,progress,change,preview,input,book,deps};
}
test('completion offers one combined set for two child pages and advances through existing parts without duplicating',async t=>{
  const f=await fixture(t);assert.equal(f.preview.next.blockId,'9');assert.equal(f.preview.parts.length,2);assert.equal(f.preview.sets.length,1);
  const result=await f.change(f.input),pages=result.pages,root=pages.find(page=>page.title==='Задание №9');assert.ok(root);
  const children=pages.filter(page=>page.parentId===root.id);assert.equal(children.length,2);assert.deepEqual(children.map(page=>page.title),['Часть 1','Часть 2']);
  assert.equal(result.record.current.pageId,children[0].id);assert.equal(result.record.current.partNumber,1);assert.ok(result.record.completed['18:1']);
  const runs=children.map(page=>f.prepared.data.runs[f.prepared.data.active[`board-t-p~page~${page.id}`]]);assert.deepEqual(runs.map(run=>run.tasks.length),[2,2]);
  assert.deepEqual(runs[1].tasks.map(task=>task.id),f.set.tasks.slice(2).map(task=>task.id));
  const repeated=await f.progress.change(f.auth,'p',{...f.input,revision:0});assert.equal(repeated.pages.length,pages.length);
  await f.change({action:'complete',pageId:children[0].id});
  const next=(await f.progress.detail(f.auth,'p')).transition;assert.equal(next.next.partNumber,2);assert.ok(next.parts.every(part=>part.hasRun));
  const continued=await f.change({...f.input,operationId:crypto.randomUUID(),partNumber:2,parts:next.parts.map(part=>({partNumber:part.partNumber,name:part.name,existingPageId:part.existingPageId}))});
  assert.equal(continued.pages.length,pages.length);assert.equal(continued.record.current.pageId,children[1].id);assert.equal(continued.record.current.partNumber,2);
});
test('ownership, stale sets and missing boundaries fail before creating pages',async t=>{
  const f=await fixture(t),before=(await f.progress.detail(f.auth,'p')).pages.length;
  await assert.rejects(f.progress.change({role:'teacher',id:'other'},'p',{...f.input,revision:2}),{status:404});
  await assert.rejects(f.change({...f.input,parts:f.input.parts.map(part=>({...part,version:0}))}),{status:409});
  await assert.rejects(f.change({...f.input,parts:f.input.parts.map(part=>({...part,sourcePartNumber:1}))}),{status:400});
  assert.equal((await f.progress.detail(f.auth,'p')).pages.length,before);assert.equal(f.progress.record('t','p').stageSetup,undefined);
  f.progress.canCreate=()=>false;await assert.rejects(f.change(f.input),{status:403});
  assert.equal((await f.progress.detail(f.auth,'p')).pages.length,before);
});
test('a failed run start resumes after restart without duplicating pages',async t=>{
  const f=await fixture(t),start=f.prepared.start.bind(f.prepared);let fail=true;
  f.prepared.start=async(...args)=>{if(fail){fail=false;throw Error('temporary connection');}return start(...args);};
  await assert.rejects(f.change(f.input),/temporary connection/);
  const pending=await f.progress.detail(f.auth,'p');assert.equal(pending.record.stageSetup.status,'pending');assert.equal(pending.pages.length,3);
  const restarted=new StudentStudyProgress(f.deps),recovered=await restarted.change(f.auth,'p',{...f.input,revision:pending.record.revision});assert.equal(recovered.pages.length,4);assert.equal(recovered.record.stageSetup.status,'done');
  assert.equal(Object.values(f.prepared.data.runs).length,2);

});
test('catalog creation keys are idempotent even if a response is lost, and removed pages are not recreated',async t=>{
  const f=await fixture(t),input={action:'create',name:'Задание №9',creationKey:'study:test-key:parent'};
  const one=mutateLessonPage(f.book,input),two=mutateLessonPage(f.book,input);assert.equal(one,two);
  mutateLessonPage(f.book,{action:'delete',id:one});assert.throws(()=>mutateLessonPage(f.book,input),/удалена/);
});
test('a page saved just before its journal write fails is reused on retry',async t=>{
  const f=await fixture(t),write=f.progress.write.bind(f.progress);let writes=0;
  f.progress.write=data=>{if(++writes===2)throw Error('disk temporarily unavailable');return write(data);};
  await assert.rejects(f.change(f.input),/disk temporarily unavailable/);
  const pending=await f.progress.detail(f.auth,'p');assert.equal(pending.pages.length,2);assert.equal(pending.record.stageSetup.parentId,'');
  const retry=await f.change(f.input);assert.equal(retry.pages.length,4);assert.equal(retry.pages.filter(page=>page.title==='Задание №9').length,1);
});
test('a changed set can be reselected after cancelling a partial setup; empty child pages are reused',async t=>{
  const f=await fixture(t),start=f.prepared.start.bind(f.prepared);
  f.prepared.start=async()=>{throw Error('interrupted');};await assert.rejects(f.change(f.input),/interrupted/);f.prepared.start=start;
  const updated=await f.prepared.saveSet(f.auth,{...f.set,name:'Обновлённый набор'},f.set.id);
  await assert.rejects(f.change(f.input),/Изменить подготовку/);
  const reset=await f.change({action:'cancel-transition'}),parts=reset.transition.parts;
  assert.ok(parts[0].existingPageId);assert.equal(parts[0].hasRun,false);
  const result=await f.change({...f.input,operationId:crypto.randomUUID(),parts:parts.map(part=>({partNumber:part.partNumber,name:part.name,existingPageId:part.existingPageId,setId:updated.id,version:updated.version,sourcePartNumber:part.partNumber}))});
  assert.equal(result.pages.length,4);assert.equal(Object.values(f.prepared.data.runs).length,2);assert.equal(result.record.current.pageId,parts[0].existingPageId);
});

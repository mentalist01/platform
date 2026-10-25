import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StudentStudyProgress} from './studentStudyProgress.js';
import {createStudyPlan} from '../src/utils/egeStudyPlan.js';
import {studyBlockStatus,studyPageSuggestion,studyTopic,nextStudyStep} from '../src/utils/studentStudyProgress.js';

function fixture() {
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'study-progress-')),auth={role:'teacher',id:'teacher-a'};
  let students=[{id:'pupil',teacherId:auth.id},{id:'other',teacherId:'teacher-b'}],pages=[{id:'main',title:'4'},{id:'page-part-two',title:'Часть 2',parentId:'main'}];
  const plan=createStudyPlan(),prepared={data:{active:{},runs:{}}};
  const dependencies={dataDir,students:()=>students,pages:async()=>pages,plans:{get:()=>plan},prepared};
  const store=new StudentStudyProgress(dependencies);
  const change=input=>store.change(auth,'pupil',{revision:store.record(auth.id,'pupil').revision,...input});
  return {store,auth,change,plan,prepared,dependencies,dataDir,setPages:next=>{pages=next;},setStudents:next=>{students=next;},stop:()=>fs.rmSync(dataDir,{recursive:true,force:true})};
}
test('explicit current stage persists; linking and browsing other pages never switches it; revisions serialize',async()=>{
  const f=fixture();try{
    const start=await f.change({action:'current',pageId:'main',blockId:'4',partNumber:1});
    assert.equal(start.record.current.blockId,'4');assert.deepEqual(start.record.completed,{});
    await f.change({action:'link',pageId:'page-part-two',blockId:'7',partNumber:2});
    assert.equal((await f.store.detail(f.auth,'pupil')).record.current.pageId,'main');
    await assert.rejects(f.change({action:'position',pageId:'page-part-two',runId:'run',cardId:'card'}),{status:409});
    const revision=f.store.record(f.auth.id,'pupil').revision;
    const requests=await Promise.allSettled([1,2].map(()=>f.store.change(f.auth,'pupil',{revision,action:'link',pageId:'main',blockId:'4',partNumber:1})));
    assert.equal(requests.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(requests.find(result=>result.status==='rejected').reason.status,409);
    assert.equal(new StudentStudyProgress(f.dependencies).record(f.auth.id,'pupil').current.pageId,'main');
  }finally{f.stop();}
});
test('position tracks only a card from the current own room and matching topic; source answers never escape',async()=>{
  const f=fixture();try{
    const room='board-teacher-a-pupil';
    const run={id:'run',room,studentId:'pupil',teacherId:'teacher-a',taskNumber:17,partNumber:1,setId:'set',name:'17',teacherCardId:'one',tasks:[{id:'t1',title:'5',answers:['secret']},{id:'t2',title:'6',sourceTaskNumber:24,sourcePartNumber:1}],cards:[{id:'one',index:0},{id:'two',index:1}]};
    f.prepared.data.active[room]=run.id;f.prepared.data.runs[run.id]=run;
    await f.change({action:'current',pageId:'main',blockId:'17',partNumber:1});
    let detail=await f.change({action:'position',pageId:'main',runId:'run',cardId:'one'});
    assert.equal(detail.record.current.taskTitle,'5');assert.equal(detail.record.current.cardId,'one');
    assert.ok(!JSON.stringify(detail).includes('secret'));
    const revision=detail.record.revision;
    detail=await f.change({action:'position',pageId:'main',runId:'run',cardId:'one'});assert.equal(detail.record.revision,revision,'duplicate selection does not write');
    await assert.rejects(f.change({action:'position',pageId:'main',runId:'run',cardId:'two'}),{status:409});
    await assert.rejects(f.change({action:'position',pageId:'main',runId:'forged',cardId:'one'}),{status:409});
    run.studentId='other';await assert.rejects(f.change({action:'position',pageId:'main',runId:'run',cardId:'one'}),{status:409});
  }finally{f.stop();}
});
test('completion follows teacher order and separate parts; reopening only resets chosen part',async()=>{
  const f=fixture();try{
    f.plan.order=['4','7','11'];
    await f.change({action:'current',pageId:'main',blockId:'7',partNumber:1});
    let result=await f.change({action:'complete',pageId:'main'});
    assert.deepEqual(result.next,{blockId:'7',partNumber:2});assert.equal(result.record.completed['4:1'],undefined);
    assert.equal(studyBlockStatus(f.plan,result.record,'7'),'future');
    await f.change({action:'current',pageId:'main',blockId:'7',partNumber:2});
    result=await f.change({action:'complete',pageId:'main',wholeTopic:true});
    assert.deepEqual(result.next,{blockId:'11',partNumber:1});assert.equal(studyBlockStatus(f.plan,result.record,'7'),'completed');
    result=await f.change({action:'current',pageId:'main',blockId:'7',partNumber:2});
    assert.ok(result.record.completed['7:1']);assert.equal(result.record.completed['7:2'],undefined);assert.equal(studyBlockStatus(f.plan,result.record,'7'),'current');
  }finally{f.stop();}
});
test('ownership, missing pages, page renames, transferred pupils and corrupt stores',async()=>{
  const f=fixture();try{
    await assert.rejects(f.store.detail({role:'student',id:'pupil'},'pupil'),{status:403});
    await assert.rejects(f.store.detail({role:'teacher',id:'teacher-b'},'pupil'),{status:404});
    await assert.rejects(f.change({action:'current',pageId:'foreign-page',blockId:'4',partNumber:1}),{status:404});
    await assert.rejects(f.change({action:'current',pageId:'main',blockId:'invalid',partNumber:1}),{status:400});
    await f.change({action:'current',pageId:'main',blockId:'4',partNumber:1});
    f.setPages([{id:'main',title:'Новое имя'}]);assert.equal((await f.store.detail(f.auth,'pupil')).record.current.pageTitle,'Новое имя');
    f.setPages([{id:'another-page',title:'Другая'}]);assert.equal((await f.store.detail(f.auth,'pupil')).record.current.pageMissing,true);
    f.setStudents([{id:'pupil',teacherId:'teacher-b'}]);assert.deepEqual(f.store.list(f.auth).records,{});
    assert.equal((await f.store.detail({role:'teacher',id:'teacher-b'},'pupil')).record.current,null);
    fs.writeFileSync(f.store.file,'broken');await assert.rejects(f.store.detail({role:'teacher',id:'teacher-b'},'pupil'));assert.equal(fs.readFileSync(f.store.file,'utf8'),'broken');
  }finally{f.stop();}
});
test('suggestions are hints, game topics combine and parent parts are recognized',()=>{
  assert.deepEqual(studyTopic(20),{blockId:'19–21',partNumber:2});
  assert.deepEqual(studyPageSuggestion({id:'part',title:'Часть 2',parentId:'root'},[{id:'root',title:'26'}]),{blockId:'26',partNumber:2});
  assert.equal(studyPageSuggestion({title:'Страница 5'}),null);
  const plan=createStudyPlan();assert.deepEqual(nextStudyStep(plan,{current:null}),{blockId:'4',partNumber:1});
});

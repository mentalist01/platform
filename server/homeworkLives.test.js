import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HomeworkLivesStore, homeworkDeadlineResult, estimateHomeworkPlan } from './homeworkLives.js';
import { isGroupHomeworkRequired } from './groupHomeworkMembership.js';

const instant = value => Date.parse(`2026-${value}`);
test('teacher-cancelled numbers do not cause new life damage and full cancellation is not graded as a checklist',()=>{
  const homework={id:'cancelled',issuedAt:'2026-10-01T10:00Z',dueAt:'2026-10-10T10:00Z',
    goals:[{type:'task',taskNumber:4,levelId:'basic',targetQuestions:[1,2],targetQuestionIds:['a','b']}],
    checklistItems:[{id:'title',text:'Домашка'}],learningEgeCancellations:[{taskNumber:4,levelId:'basic',targetQuestionIds:['a']}]};
  const data={solvedByTask:{4:{basic:{solved:['b'],answerHistory:{b:[{correct:true,submittedAt:'2026-10-05T10:00Z'}]}}}}};
  const db={4:{basic:[{id:'a'},{id:'b'}]}};
  assert.equal(homeworkDeadlineResult(homework,data,db,[],Date.parse('2026-10-14')).percent,100);
  assert.equal(homeworkDeadlineResult({...homework,learningEgeCancellations:[{taskNumber:4,levelId:'basic',targetQuestionIds:['a','b']}]},data,db,[],Date.parse('2026-10-14')),null);
});
const student={id:'pupil',teacherId:'teacher',createdAt:'2026-09-01T10:00:00Z'};
const assigned=(id,percent=50,dueAt='2026-10-10T17:00:00Z')=>({id,issuedAt:'2026-10-02T17:00:00Z',dueAt,homeWork:id,percent});
test('EGE carryover does not create another deduction for the original missed homework',t=>{
  const {store,context}=fixture(t);
  const original=assigned('original',50), supplement={...assigned('supplement',0),learningEgeCarryover:true};
  const status=store.status(student,context([original,supplement]));
  assert.equal(status.remaining,2);
  assert.deepEqual(status.history.map(e=>e.id),['original']);
  assert.equal(homeworkDeadlineResult(supplement,{}, {}, [],Date.now()),null);
});
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-homework-lives-'));
  t.after(()=>{if(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(directory,{recursive:true,force:true});});
  let now=instant('10-01T00:00:00Z');
  const file=path.join(directory,'lives.json'),store=new HomeworkLivesStore(file,{now:()=>now});
  // Preserve legacy-policy scenarios; the cutover has separate regression coverage.
  store.data.damagePolicy={since:'2099-01-01T00:00:00Z',monthlyDamage:4};store.configure(student.teacherId,true);
  now=instant('10-14T10:00:00Z');
  const context=(homeworks,count=4)=>({homeworks,estimatePlan:()=>count,evaluate:h=>({reliable:true,percent:h.percent,totalCount:10,completedCount:h.percent/10})});
  return{store,file,context,clock:value=>{now=instant(value);}};
}

test('new policy halves future deadline damage for every workload and preserves adaptation',t=>{
  const {store,context,clock}=fixture(t);
  clock('10-30T10:00:00Z');delete store.data.damagePolicy;store.save();
  const dueAt='2026-10-30T11:00:00Z',issuedAt='2026-10-29T10:00:00Z';
  store.settings(student.teacherId);clock('10-30T12:00:00Z');
  for(const count of [4,8,12]){
    const work={...assigned('new-'+count,0,dueAt),issuedAt};
    const status=store.status({...student,id:'new-'+count},context([work],count));
    assert.equal(status.history[0].loss,Math.round(4/count*1e6)/1e6);
    assert.equal(status.history[0].damageBudget,4);
    assert.equal(status.maxLossPerHomework,4/count);
  }
  const adapted=context([{...assigned('adapted',0,dueAt),issuedAt}],4);
  adapted.completedLessonTimes=['2026-10-01T10:00Z'];adapted.startedLessonTimes=adapted.completedLessonTimes;
  const status=store.status({...student,id:'adapted'},adapted);
  assert.equal(status.history[0].loss,0.5);assert.equal(status.remaining,2.5);
  assert.equal(status.history[0].damageMultiplier,0.5);assert.equal(status.maxLossPerHomework,0.5);
});

test('cutover and restart retain old balances and historical deadlines while reducing new ones',t=>{
  const {store,context,clock,file}=fixture(t);
  const old=assigned('old',50);assert.equal(store.status(student,context([old])).remaining,2);
  clock('10-30T10:00:00Z');delete store.data.damagePolicy;store.save();
  const cutover=store.status(student,context([old]));assert.equal(cutover.remaining,2);
  assert.equal(cutover.history[0].loss,1);assert.equal(cutover.maxLossPerHomework,1);
  const upcoming={...assigned('upcoming',0,'2026-10-30T11:00:00Z'),issuedAt:'2026-10-29T10:00:00Z'};
  clock('10-30T12:00:00Z');assert.equal(store.status(student,context([old,upcoming])).remaining,1);
  const reopened=new HomeworkLivesStore(file,{now:()=>instant('10-30T13:00:00Z')});
  const status=reopened.status(student,context([old,upcoming]));
  assert.equal(status.remaining,1);assert.equal(reopened.data.damagePolicy.since,'2026-10-30T10:00:00.000Z');
  const late=store.status({...student,id:'late-history'},context([assigned('historical',0)]));
  assert.equal(late.history[0].loss,2,'Old unassessed deadlines retain their historical rate');
});

test('existing enabled installations establish cutover before the first lives request',t=>{
  const {store,context,file}=fixture(t);
  delete store.data.damagePolicy;store.save();
  let now=instant('10-30T10:00:00Z');
  const reopened=new HomeworkLivesStore(file,{now:()=>now});
  assert.equal(reopened.data.damagePolicy.since,'2026-10-30T10:00:00.000Z');
  now=instant('10-30T12:00:00Z');
  const work={...assigned('new-after-startup',0,'2026-10-30T11:00:00Z'),issuedAt:'2026-10-29T10:00:00Z'};
  assert.equal(reopened.status(student,context([work])).history[0].loss,1);
});

test('zero-lives explanation is durable, independent of the teacher review and renewed after a corrected deduction', t => {
  const { store, context, file } = fixture(t);
  const work = [assigned('one', 0), assigned('two', 0)];
  const state = store.status(student, context(work));
  assert.equal(state.remaining, 0); assert.ok(state.studentNotice); assert.equal(state.studentNotice.readAt, '');
  assert.throws(() => store.acknowledgeNotice(student, state.month, 'stale'), { status: 409 });
  store.handleReview(student, state.month, 'teacher');
  assert.equal(store.status(student, context(work)).studentNotice.id, state.studentNotice.id);
  store.acknowledgeNotice(student, state.month, state.studentNotice.id);
  const saved = new HomeworkLivesStore(file, { now: () => instant('10-14T10:00:00Z') }).status(student, context(work));
  assert.ok(saved.studentNotice.readAt); assert.equal(saved.remaining, 0);
  assert.equal(saved.pendingReviews.length, 0, 'Acknowledgement does not undo the separate teacher review');
  store.acknowledgeNotice(student, state.month, state.studentNotice.id);
  store.waive(student, 'one', 'Mistaken deduction', 'teacher');
  assert.equal(store.status(student, context(work)).studentNotice, null);
  assert.throws(() => store.acknowledgeNotice(student, state.month, state.studentNotice.id), { status: 409 });
});

test('half of every homework exhausts three lives after 3/4 of either monthly workload',t=>{
  const{store,context}=fixture(t);
  const four=context(Array.from({length:3},(_,i)=>assigned('four-'+i)),4);
  const eight=context(Array.from({length:6},(_,i)=>assigned('eight-'+i)),8);
  assert.equal(store.status(student,four).remaining,0);
  assert.equal(store.status({...student,id:'twice-weekly'},eight).remaining,0);
  assert.equal(store.status(student,four).pendingReviews.length,1);
});
test('partial completion drains consecutive hearts and never makes balance negative',t=>{
  const{store,context}=fixture(t);
  assert.equal(store.status(student,context([assigned('one',30)],4)).remaining,1.6);
  const value=store.status(student,context([assigned('one',30),assigned('two',0)],4));
  assert.equal(value.remaining,0);
  assert.deepEqual(value.history.map(e=>e.deducted),[1.6,1.4]);
});
test('same 80% completion throughout either monthly plan leaves the same balance',t=>{
  const{store,context}=fixture(t);
  for(const count of [4,8])assert.equal(store.status({...student,id:String(count)},context(Array.from({length:count},(_,i)=>assigned(String(i),80)),count)).remaining,1.4);
});
test('reset uses Moscow midnight while unresolved conversation survives the month boundary',t=>{
  const{store,context,clock}=fixture(t),c=context([assigned('a'),assigned('b'),assigned('c')]);
  clock('10-31T20:59:59Z');assert.equal(store.status(student,c).remaining,0);
  clock('10-31T21:00:00Z');const status=store.status(student,c);
  assert.equal(status.month,'2026-11');assert.equal(status.remaining,3);assert.equal(status.pendingReviews[0].month,'2026-10');
  store.handleReview(student,'2026-10','teacher');assert.deepEqual(store.status(student,c).pendingReviews,[]);
});
test('no deduction before deadline and no retroactive punishment after activation',t=>{
  const{store,context,clock}=fixture(t);
  const old={...assigned('old'),issuedAt:'2026-09-29T10:00:00Z'};
  const future=assigned('future',0,'2026-10-14T12:00:00Z');
  assert.equal(store.status(student,context([old,future])).remaining,3);
  clock('10-14T12:00:00Z');assert.equal(store.status(student,context([old,future])).remaining,1);
});
test('leaving a group before the deadline prevents damage even before its homework projection refreshes',t=>{
  const {store,context}=fixture(t);
  const old={...assigned('old-group',0),source:'learning-group'};
  const group={members:[{studentId:student.id,status:'removed',leftAt:'2026-10-10T16:00Z'}]};
  const c=context([old]);c.isHomeworkRequired=h=>isGroupHomeworkRequired(h,group,student.id);
  c.evaluate=()=>assert.fail('Withdrawn homework must not be graded');
  assert.equal(store.status(student,c).remaining,3);
  assert.deepEqual(store.status(student,c).history,[]);
});
test('membership correction waives only erroneous group damage and cancels a false review',t=>{
  const {store,context}=fixture(t);
  const groupWork={...assigned('old-group',0),source:'learning-group'};
  const c=context([groupWork,assigned('individual',50)]);
  assert.equal(store.status(student,c).remaining,0);
  c.isHomeworkRequired=h=>isGroupHomeworkRequired(h,{members:[{studentId:student.id,status:'removed',leftAt:'2026-10-10T16:00Z'}]},student.id);
  const corrected=store.status(student,c);
  assert.equal(corrected.remaining,2);
  assert.deepEqual(corrected.pendingReviews,[]);
  assert.equal(corrected.history.find(e=>e.id==='old-group').waivedById,'group-membership');
  assert.equal(corrected.history.find(e=>e.id==='individual').deducted,1);
  assert.equal(store.status(student,c).remaining,2);
});
test('departure after the due date preserves an existing group homework deduction',t=>{
  const {store,context}=fixture(t);
  const c=context([{...assigned('old-group',50),source:'learning-group'}]);
  c.isHomeworkRequired=h=>isGroupHomeworkRequired(h,{members:[{studentId:student.id,status:'removed',leftAt:'2026-10-11T16:00Z'}]},student.id);
  assert.equal(store.status(student,c).remaining,2);
  assert.equal(store.status(student,c).history[0].waivedAt,undefined);
});
test('new pupils lose half as much through eight lessons, even across months; the ninth lesson ends adaptation', t => {
  const {store, context, clock, file} = fixture(t), pupil = {...student, id:'new', createdAt:'2026-10-02T10:00:00Z'};
  const first = {...assigned('first', 0), issuedAt:'2026-10-03T17:00:00Z'};
  const c = context([first]); c.completedLessonTimes = [instant('10-03T16:00:00Z')];
  const initial = store.status(pupil,c);
  assert.equal(initial.remaining,2); assert.equal(initial.history[0].damageMultiplier,0.5);
  clock('11-10T12:00:00Z');
  const eighth = {...assigned('eighth',0,'2026-11-10T10:00:00Z'),issuedAt:'2026-11-02T18:00:00Z'};
  c.completedLessonTimes = Array.from({length:8},(_,i)=>instant(`10-${String(3+i*3).padStart(2,'0')}T16:00:00Z`));
  c.homeworks=[first,eighth];
  assert.equal(store.status(pupil,c).remaining,2);
  const ninth = {...assigned('ninth',0,'2026-11-10T11:00:00Z'),issuedAt:'2026-11-09T17:00:00Z'};
  c.startedLessonTimes=[...c.completedLessonTimes,instant('11-09T16:00:00Z')];
  c.homeworks.push(ninth);
  const result=store.status(pupil,c);
  assert.equal(result.remaining,0);assert.equal(result.adaptation.active,false);
  assert.equal(result.history.find(e=>e.id==='ninth').damageMultiplier,1);
  assert.equal(result.history.find(e=>e.id==='eighth').loss,1,'Earlier assignments retain the discount after the ninth lesson');
  const saved = new HomeworkLivesStore(file,{now:()=>instant('11-10T12:00:00Z')}).status(pupil,c);
  assert.equal(saved.remaining,0);assert.equal(saved.history.find(e=>e.id==='eighth').damageMultiplier,0.5);
});

test('adoption of the new policy never creates retroactive damage for work protected by the old introductory month', t => {
  const {store, context} = fixture(t), pupil={...student,id:'legacy-new',createdAt:'2026-10-02T10:00:00Z'};
  const settings=store.data.teachers[Object.keys(store.data.teachers)[0]];
  delete settings.introPolicySince; store.save();
  const c=context([assigned('protected',0)]);c.completedLessonTimes=[];
  assert.equal(store.status(pupil,c).remaining,3);
  assert.equal(store.status(pupil,c).history.length,0);
});

test('checks persist across restart, repeat reads and changes to later progress',t=>{
  const{store,file,context}=fixture(t),c=context([assigned('a')]);store.status(student,c);
  const reopened=new HomeworkLivesStore(file,{now:()=>instant('10-15T10:00:00Z')});
  const changed=context([assigned('a',100)]);changed.evaluate=()=>assert.fail('Frozen assignment was evaluated again');
  assert.equal(reopened.status(student,changed).remaining,2);
  assert.equal(reopened.status(student,changed).history.length,1);
});
test('manual waiver restores available life and can cancel a false conversation alert',t=>{
  const{store,context}=fixture(t),c=context([assigned('a'),assigned('b'),assigned('c')]);store.status(student,c);
  store.waive(student,'a','Домашка не отображалась','teacher');
  assert.equal(store.status(student,c).remaining,1);assert.deepEqual(store.status(student,c).pendingReviews,[]);
  store.waive(student,'a','Повторная проверка','teacher');assert.equal(store.status(student,c).remaining,1);
  const later=context([...c.homeworks,assigned('d')]);assert.equal(store.status(student,later).pendingReviews.length,1);
});
test('monthly quota freezes at first check and an explicit next-month plan carries forward',t=>{
  const{store,context,clock}=fixture(t);store.status(student,context([assigned('a')],4));
  assert.throws(()=>store.setPlan(student,8,'2026-10'),e=>e.status===409);
  assert.equal(store.status(student,context([assigned('a')],8)).plannedCount,4);
  store.setPlan(student,8,'2026-11');clock('12-01T12:00:00Z');assert.equal(store.status(student,context([],4)).plannedCount,8);
});
test('uncertain deadline data creates a manual check instead of a penalty',t=>{
  const{store,context}=fixture(t),c=context([assigned('uncertain')]);c.evaluate=()=>({reliable:false,reason:'Нет времени решения'});
  const value=store.status(student,c);assert.equal(value.remaining,3);assert.ok(value.needsReview);assert.deepEqual(value.pendingReviews,[]);
});
test('cancelled attendance does not reduce the baseline workload; selected group days are respected',()=>{
  const schedule=[{weekdayKey:'wednesday',time:'20:00',excludedDates:['2026-10-07']},{weekdayKey:'friday',time:'20:00'}];
  assert.equal(estimateHomeworkPlan(schedule,'2026-10'),8);
  assert.equal(estimateHomeworkPlan(schedule,'2026-10',e=>e.weekdayKey==='friday'),4);
});
test('a broken history file cannot silently reset hearts or be overwritten',t=>{
  const{file}=fixture(t);fs.writeFileSync(file,'{broken');const store=new HomeworkLivesStore(file);
  assert.throws(()=>store.settings('teacher'),e=>e.status===503);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('optional, deleted and unscheduled work never consumes hearts',t=>{
  const{store,context}=fixture(t),c=context([{...assigned('optional',0),assignmentTier:'optional'},{...assigned('deleted',0),deletedAt:'2026-10-09'}, {...assigned('no-deadline',0),dueAt:''}]);
  c.evaluate=()=>assert.fail('Excluded homework was measured');assert.equal(store.status(student,c).remaining,3);
});

const testsDb={5:{basic:[{id:'py-1'},{id:'py-2'}]},4:{basic:[{id:'ege-1'}]}};
const goal=(number,ids,optional=false)=>({type:'task',taskNumber:number,levelId:number>=100?'python':'basic',targetQuestionIds:ids,targetQuestions:ids.map((_,i)=>i+1),assignmentTier:optional?'optional':'required'});
const homework={id:'python',issuedAt:'2026-10-02T10:00:00Z',dueAt:'2026-10-09T17:00:00Z',goals:[goal(5,['py-1','py-2'])]};
const now=instant('10-14T10:00:00Z');
const result=data=>homeworkDeadlineResult(homework,data,testsDb,[],now);
test('Independent EGE assignments have independent deadline windows; optional goals are excluded',()=>{
  const data={homeworks:[homework,{...assigned('ege'),issuedAt:'2026-10-03T10:00:00Z'}],solvedByTask:{5:{basic:{solved:['py-1'],answerHistory:{'py-1':[{correct:true,submittedAt:'2026-10-08T10:00:00Z'}]}}}}};
  assert.equal(result(data).percent,50);
  assert.equal(homeworkDeadlineResult({...homework,goals:[...homework.goals,goal(4,['ege-1'],true)]},data,testsDb,[],now).percent,50);
});
test('late success does not change the result at deadline and estimated legacy success is not punished',()=>{
  const late={solvedByTask:{5:{basic:{solved:['py-1'],answerHistory:{'py-1':[{correct:true,submittedAt:'2026-10-10T10:00:00Z'}]}}}}};
  assert.equal(result(late).percent,0);
  assert.equal(result({solvedByTask:{5:{basic:{solved:['py-1']}}}}).reliable,false);
  assert.equal(result({solvedByTask:{5:{basic:{solved:['py-1'],answerHistory:{'py-1':[{correct:true,submittedAt:'2026-09-28T10:00:00Z'}]}}}}}).percent,50);
});
test('removed question targets require manual review rather than counting the remaining question as a full homework',()=>{
  assert.equal(homeworkDeadlineResult(homework,{}, {5:{basic:[{id:'py-1'}]}},[],now).reliable,false);
});
test('a finished mock with one answer out of four counts as 25%, not as full completion',()=>{
  const h={...homework,goals:[{type:'mock',mockExamId:'exam',targetTaskKeys:['1','2','3','4']}]};
  const data={mockAttempts:{exam:{homeworkId:'python',status:'finished',finishedAt:'2026-10-08T10:00:00Z',updatedAt:'2026-10-08T10:00:00Z',answers:{1:'answer'}}}};
  assert.equal(homeworkDeadlineResult(h,data,testsDb,[],now).percent,25);
});

test('Python-only, legacy and theory homework never consumes hearts, while mixed work measures EGE only', t => {
  const {store, context} = fixture(t);
  const py={...assigned('practice',0),studyTrack:'python',goals:[goal(101,['py-1'])]};
  const c=context([py,{...py,id:'legacy',goals:[],taskNumber:101,levelId:'python'}, {...py,id:'theory',goals:[],checklistItems:[{text:'Watch'}]}]);
  c.evaluate=()=>assert.fail('Python practice must not be graded');
  assert.equal(store.status(student,c).remaining,3);
  assert.deepEqual(store.status(student,c).history,[]);
  assert.equal(homeworkDeadlineResult(py,{},testsDb,[],now),null);
  const mixed={...py,id:'mixed',goals:[goal(101,['missing-snapshot']),goal(4,['ege-1'])]};
  assert.equal(homeworkDeadlineResult(mixed,{},testsDb,[],now).percent,0);
  const done={solvedByTask:{4:{basic:{solved:['ege-1'],answerHistory:{'ege-1':[{correct:true,submittedAt:'2026-10-08T10:00Z'}]}}}}};
  assert.equal(homeworkDeadlineResult(mixed,done,testsDb,[],now).percent,100);
  assert.equal(homeworkDeadlineResult({...mixed,goals:[goal(101,['py-1']),goal(4,['ege-1'],true)]},done,testsDb,[],now),null);
});

test('old Python damage is waived once, restores hearts and cancels a false conversation alert', t => {
  const {store,context}=fixture(t);
  const h={...assigned('py-old',0),studyTrack:'python'};
  const row=store.record(student);
  row.months['2026-10']={plannedCount:4,events:{'py-old':{id:'py-old',loss:2,reliable:true,percent:0,dueAt:h.dueAt},ege:{id:'ege',loss:1,reliable:true,percent:50,dueAt:h.dueAt}},review:{month:'2026-10',createdAt:'2026-10-11'}};
  store.save();
  const c=context([h]);c.evaluate=()=>assert.fail('Old Python must not be re-graded');
  const corrected=store.status(student,c);
  assert.equal(corrected.remaining,2);
  assert.deepEqual(corrected.pendingReviews,[]);
  assert.equal(corrected.history.find(e=>e.id==='py-old').waivedById,'python-practice-policy');
  assert.equal(corrected.history.find(e=>e.id==='ege').deducted,1);
  const saved=fs.readFileSync(store.file,'utf8');
  assert.equal(store.status(student,c).remaining,2);
  assert.equal(fs.readFileSync(store.file,'utf8'),saved);
});

test('mixed historical deductions are recalculated for EGE once and never grow retroactively', t => {
  const {store,context}=fixture(t);
  for (const [id,newPercent,expectedLoss] of [['restore',100,0],['no-extra-punishment',0,1]]) {
    const pupil={...student,id};const h={...assigned(id,50),goals:[goal(101,['py-1']),goal(4,['ege-1'])]};
    const row=store.record(pupil);
    row.months['2026-10']={plannedCount:4,events:{[id]:{id,loss:1,reliable:true,percent:50,totalCount:2,completedCount:1,dueAt:h.dueAt}}};store.save();
    const c=context([h]);let calls=0;c.evaluate=()=>{calls++;return{reliable:true,percent:newPercent,totalCount:1,completedCount:newPercent/100};};
    const status=store.status(pupil,c);
    assert.equal(status.remaining,3-expectedLoss);
    assert.equal(status.history[0].previousAssessment.percent,50);
    assert.equal(status.history[0].percent,newPercent);
    assert.equal(status.history[0].totalCount,1);
    store.status(pupil,c);assert.equal(calls,1);
  }
});

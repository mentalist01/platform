import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudyPlan,arrangeStudyPlan,dropStudyBlock,moveStudyBlock,completeStudyPlan,countStudyTasks,isStudyPlanDraft,studyPlanFingerprint} from './egeStudyPlan.js';
import {splitStudyStage,mergeStudyStages,studyPlanStages,studyPlanDisplay,withStudyStages,validStudyStages} from './studyPlanStages.js';
import {nextStudyStep,studyBlockStatus} from './studentStudyProgress.js';
import {validateStudyPlan} from '../../server/egeStudyPlan.js';

function route() {
  const plan=splitStudyStage(createStudyPlan(),'26',2),stages=studyPlanStages(plan),first=stages.find(stage=>stage.id==='26');
  stages.splice(stages.indexOf(first),1);stages.splice(stages.findIndex(stage=>stage.id==='22')+1,0,first);
  return arrangeStudyPlan(withStudyStages(plan,stages));
}
test('one topic can occur twice with canonical parts, stable progress keys and no duplicate exam count',()=>{
  const plan=route(),view=studyPlanDisplay(plan);assert.equal(countStudyTasks(plan.order),20);
  assert.equal(view.order[view.order.indexOf('22')+1],'26');assert.equal(view.order.at(-1),'26~3');
  assert.deepEqual(view.blocks['26~3'].parts,plan.blocks['26'].parts);assert.equal(view.blocks['26~3'].fromPart,3);
  assert.equal(isStudyPlanDraft(plan),true);assert.deepEqual(validateStudyPlan(plan),plan);
  assert.notEqual(studyPlanFingerprint(createStudyPlan()),studyPlanFingerprint(plan));
});
test('next topic follows parts 1–2, then task 5, and returns to part 3 at the end',()=>{
  const plan=route(),record={current:{blockId:'26',partNumber:1},completed:{'22:1':'yes','22:2':'yes','26:1':'yes'}};
  assert.deepEqual(nextStudyStep(plan,record),{blockId:'26',partNumber:2});
  record.current.partNumber=2;record.completed['26:2']='yes';assert.deepEqual(nextStudyStep(plan,record),{blockId:'5',partNumber:1});
  record.current={blockId:'24',partNumber:1};assert.deepEqual(nextStudyStep(plan,record),{blockId:'26',partNumber:3});
  record.current={blockId:'26',partNumber:3};assert.equal(studyBlockStatus(plan,record,'26',plan.stages.find(s=>s.id==='26')),'completed');assert.equal(studyBlockStatus(plan,record,'26',plan.stages.at(-1)),'current');
  const merged=mergeStudyStages(plan,'26');assert.equal(merged.stages.filter(s=>s.blockId==='26').length,1);assert.equal(merged.stages.find(s=>s.id==='26').toPart,8);assert.ok(record.completed['26:2']);
});
test('drag and sequence controls retain stage ranges; reversing parts is rejected',()=>{
  const plan=route(),view=studyPlanDisplay(plan),free=dropStudyBlock(plan,'26~3',{x:2200,y:1600});assert.equal(studyPlanDisplay(free).blocks['26~3'].x,2200);
  const moved=dropStudyBlock(plan,'26~3',view.blocks['5']);assert.ok(validStudyStages(moved));assert.equal(studyPlanDisplay(moved).order.at(-1),'24');
  const adjacent=splitStudyStage(createStudyPlan(),'26',2);assert.equal(moveStudyBlock(adjacent,'26~3',-1),adjacent);
  const full=completeStudyPlan(plan);assert.equal(countStudyTasks(full.order),27);assert.ok(full.stages.some(s=>s.id==='26~3'));
});
test('server rejects overlapping, missing, reversed, duplicate and malformed stages',()=>{
  const plan=route();
  for(const change of [p=>p.stages.push(null),p=>p.stages.push(p.stages[0]),p=>p.stages.at(-1).fromPart=2,p=>p.stages.at(-1).toPart=7,p=>p.stages.at(-1).x=Infinity,p=>p.stages.at(-1).blockId='other']) {
    const bad=structuredClone(plan);change(bad);assert.equal(isStudyPlanDraft(bad),false);assert.throws(()=>validateStudyPlan(bad),e=>e.status===400);
  }
});

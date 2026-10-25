import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDY_PLAN_IDS,STUDY_CARD,createStudyPlan,arrangeStudyPlan,completeStudyPlan,countStudyTasks,moveStudyBlock,dropStudyBlock,isStudyPlanDraft,studyPlanBounds} from './egeStudyPlan.js';

test('initial teacher route preserves requested order, editable parts and 2027 topic coverage',()=>{
  const plan=createStudyPlan();
  assert.equal(countStudyTasks(plan.order),20);
  assert.deepEqual(STUDY_PLAN_IDS.filter(id=>!plan.order.includes(id)),['1','2','6','10','12','15','23']);
  assert.equal(plan.blocks['7'].parts.length,3);assert.equal(plan.blocks['26'].parts.length,8);
  assert.equal(plan.blocks['5'].parts.length,0,'Do not guess unknown part counts');
  assert.match(plan.blocks['10'].title,/IP/);assert.match(plan.blocks['13'].title,/программ/);assert.match(plan.blocks['23'].title,/граф/);
  assert.equal(isStudyPlanDraft(plan),true);assert.equal(isStudyPlanDraft({...plan,order:['99']}),false);
});
test('adding omitted tasks keeps teacher sequence and custom part names, arrangement does not overlap',()=>{
  const original=createStudyPlan();original.blocks['26'].parts[0]='Сортировка';
  const plan=completeStudyPlan(original);
  assert.equal(countStudyTasks(plan.order),27);assert.equal(plan.order.length,25);
  assert.deepEqual(plan.order.filter(id=>original.order.includes(id)),original.order);
  assert.equal(plan.blocks['26'].parts[0],'Сортировка');
  const first=plan.blocks[plan.order[0]],second=plan.blocks[plan.order[1]];
  assert.ok(second.x>=first.x+STUDY_CARD.width);
  assert.equal(studyPlanBounds(plan).height,plan.blocks[plan.order.at(-1)].y+STUDY_CARD.height+60);
});
test('sequence movement and rearranging preserve task metadata and allow undo via immutable history',()=>{
  const original=createStudyPlan(),moved=moveStudyBlock(original,'18',-1);
  assert.equal(moved.order[3],'18');assert.equal(original.order[3],'3');
  const free=structuredClone(moved);free.blocks['18'].x=1000;free.blocks['18'].note='Сначала третий';
  assert.equal(arrangeStudyPlan(free).blocks['18'].note,'Сначала третий');
  assert.equal(moveStudyBlock(original,'4',-1),original);
});
test('dropping onto another block changes sequence, empty-space drops preserve the route',()=>{
  const plan=createStudyPlan();
  const moved=dropStudyBlock(plan,'4',{x:plan.blocks['11'].x,y:plan.blocks['11'].y});
  assert.deepEqual(moved.order.slice(0,3),['7','11','4']);
  const free=dropStudyBlock(plan,'4',{x:2000,y:1400});
  assert.deepEqual(free.order,plan.order);assert.equal(free.blocks['4'].x,2000);assert.equal(plan.blocks['4'].x,60);
});

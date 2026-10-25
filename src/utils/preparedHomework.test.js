import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreparedHomeworkGoal,preparedHomeworkProgress} from './preparedHomework.js';
import {normalizeHomeworkComposerDraftForm} from './homeworkComposerDraft.js';
import {buildHomeworkStatistics} from './homeworkStats.js';
import {normalizeHomeworkDayPlanItems} from './homeworkDayPlan.js';
import {buildHomeworkCarryoverDraft} from './homeworkComposer.js';
const goal={type:'prepared',preparedId:'12345678-1234-1234-1234-123456789abc',title:'5',taskNumber:17,partNumber:2};
test('prepared goals survive drafts and day planning as one explicitly named task',()=>{
  assert.equal(normalizeHomeworkComposerDraftForm({goals:[goal]}).goals[0].preparedId,goal.preparedId);
  const items=normalizeHomeworkDayPlanItems({homework:{goals:[goal]}});assert.equal(items.length,1);assert.equal(items[0].goal.preparedId,goal.preparedId);
  assert.equal(normalizePreparedHomeworkGoal({...goal,preparedId:'../secret'}),null);
  assert.deepEqual(preparedHomeworkProgress(goal),{totalCount:1,solvedCount:0,pendingCount:1,completedAt:null});
});
test('homework totals count the checked result and keep late completion separate from deadline completion',()=>{
  const entry={id:'hw',issuedAt:'2026-10-25T09:00:00Z',dueAt:'2026-10-26T09:00:00Z',goals:[goal]};
  let [stats]=buildHomeworkStatistics({homeworks:[entry],studentData:{},testsDb:{},mockExams:[],nowMs:Date.parse('2026-10-27T12:00:00Z')});assert.equal(stats.totalCount,1);assert.equal(stats.completedCount,0);
  const completed={...goal,preparedResult:{completedAt:'2026-10-26T10:00:00Z',attempts:2,wrongCount:1}};
  [stats]=buildHomeworkStatistics({homeworks:[{...entry,goals:[completed]}],studentData:{},testsDb:{},mockExams:[],nowMs:Date.parse('2026-10-27T12:00:00Z')});assert.equal(stats.completedCount,1);assert.equal(stats.checkpointCompletedCount,0);
});
test('unfinished prepared work is carried over with the same personal workspace; finished work is omitted',()=>{
  const entry={id:'hw',goals:[goal],homeWork:''};
  assert.equal(buildHomeworkCarryoverDraft({homework:entry,studentData:{},testsDb:{}}).goals[0].preparedId,goal.preparedId);
  assert.equal(buildHomeworkCarryoverDraft({homework:{...entry,goals:[{...goal,preparedResult:{completedAt:'2026-10-25T12:00:00Z'}}]},studentData:{},testsDb:{}}).goals.length,0);
});

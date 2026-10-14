import test from 'node:test';import assert from 'node:assert/strict';
import {groupEgeCancellationsForAssignment,filterCancelledGroupEgeGoals} from './groupHomeworkCancellations.js';
import {mergeGroupHomeworkCarryover} from './groupHomeworkCarryover.js';
const goal={type:'task',taskNumber:4,levelId:'basic',includeAll:true,targetQuestions:[1,2],targetQuestionIds:['one','two']};
const record={id:'cancel',groupId:'g',sourceAssignmentIds:['old'],taskNumber:4,levelId:'basic',targetQuestionIds:['one']};
test('cancellation is tied to old issuance and group; a new issuance and revoked cancellation are allowed',()=>{
 assert.equal(groupEgeCancellationsForAssignment([record],'g','old').length,1);
 for(const [group,id]of[['other','old'],['g','new']])assert.deepEqual(groupEgeCancellationsForAssignment([record],group,id),[]);
 assert.deepEqual(groupEgeCancellationsForAssignment([{...record,revokedAt:'2026-10-14'}],'g','old'),[]);
});
test('partial cancellation keeps ID-number pairing; full cancellation clears fallback primary targets',()=>{
 const work={id:'old',source:'learning-group',learningGroupId:'g',learningAssignmentId:'old',goals:[goal],taskNumber:4,levelId:'basic',targetQuestions:[1,2],targetQuestionIds:['one','two'],learningEgeCancellations:[record]};
 const filtered=filterCancelledGroupEgeGoals(work);assert.deepEqual(filtered[0].targetQuestions,[2]);assert.deepEqual(filtered[0].targetQuestionIds,['two']);assert.equal(filtered[0].includeAll,false);
 const empty=mergeGroupHomeworkCarryover([{...work,learningEgeCancellations:[{...record,targetQuestionIds:['one','two']}]}])[0];
 assert.deepEqual(empty.goals,[]);assert.equal(empty.taskNumber,null);assert.deepEqual(empty.targetQuestionIds,[]);
 assert.deepEqual(work.goals[0].targetQuestionIds,['one','two']);
});

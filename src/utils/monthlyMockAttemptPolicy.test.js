import test from 'node:test';
import assert from 'node:assert/strict';
import {getMonthlyMockAttemptPolicy,getBestMonthlyMockAttempt,mockAttemptMonth} from './monthlyMockAttemptPolicy.js';

const tasks={1:{},4:{},10:{},11:{}};
const exams=['06','07','08','09','10'].map((number,index)=>({id:`exam-${index+1}`,tasks,monthlyAssignments:{teacher:[`2026-${number}`]}}));
const options={exams,exam:exams[4],teacherId:'teacher',month:'2026-10',now:Date.parse('2026-10-18T12:00Z')};
test('the first four personal monthly exams allow three attempts, the fifth allows one',()=>{
  for(let i=0;i<5;i++)assert.equal(getMonthlyMockAttemptPolicy({...options,exam:exams[i],month:`2026-${String(i+6).padStart(2,'0')}`}).maxAttempts,i<4?3:1);
  const newcomer=getMonthlyMockAttemptPolicy({...options,studentCreatedAt:'2026-10-01T12:00Z'});
  assert.equal(newcomer.ordinal,1);assert.equal(newcomer.maxAttempts,3);
  assert.equal(mockAttemptMonth({finishedAt:'2026-10-16T14:35Z'},exams[4],'teacher'),'2026-10');
});
test('the best allowed attempt is stable across worse retakes, ties and unfinished retries',()=>{
  const make=(attemptNumber,solved)=>({examId:'exam-5',attemptId:`try-${attemptNumber}`,attemptNumber,monthlyMockMonth:'2026-10',monthlyMockOrdinal:1,finishedAt:`2026-10-16T14:${30+attemptNumber}:00Z`,tasks,solved});
  const data={mockAttemptResults:[make(1,{1:true,4:true,10:true}),make(2,{1:true,4:true,10:true,11:true}),make(3,{1:true})]};
  assert.equal(getBestMonthlyMockAttempt({...options,studentData:data}).attempt.attemptNumber,2);
  assert.equal(getMonthlyMockAttemptPolicy({...options,studentData:data}).remainingAttempts,0);
  const fifth={...data,mockAttemptResults:data.mockAttemptResults.map(item=>({...item,monthlyMockOrdinal:5}))};
  assert.equal(getBestMonthlyMockAttempt({...options,studentData:fifth}).score,20);
  const archive=getMonthlyMockAttemptPolicy({...options,now:Date.parse('2026-11-01T00:00+03:00'),studentData:data});
  assert.equal(archive.archived,true);assert.equal(archive.canRestart,false);
});

test('earlier assigned full mocks count once per month, self-practice and partial homework do not',()=>{
  const exam={id:'current',tasks,monthlyAssignments:{teacher:['2026-10']}};
  const old={id:'old',tasks},result={examId:'old',attemptId:'sept',finishedAt:'2026-09-13T12:00Z',tasks,assignmentSource:'homework'};
  const input={exams:[old,exam],exam,teacherId:'teacher',month:'2026-10',now:options.now};
  assert.equal(getMonthlyMockAttemptPolicy({...input,studentData:{mockAttemptResults:[result,{...result,attemptId:'sept-repeat'}]}}).ordinal,2);
  assert.equal(getMonthlyMockAttemptPolicy({...input,studentData:{mockAttemptResults:[{...result,assignmentSource:'self'}]}}).ordinal,1);
  assert.equal(getMonthlyMockAttemptPolicy({...input,studentData:{mockAttemptResults:[{...result,targetTaskKeys:['1']}]}}).ordinal,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {copyLegacyMockExams,remapScopedMockReferences} from './mockExamTenancy.js';

test('legacy libraries become independent and references/history stay with their teacher',()=>{
  const exam={id:'old',title:'Same title',tasks:{25:{answers:['1','2']}},access:{all:true,students:['p','q'],mode:'timer'},monthlyAssignments:{a:['2026-11'],b:['2026-10']},monthlyReviewVideos:{a:{url:'a'},b:{url:'b'}}};
  const students={p:'a',q:'b'};
  const copied=copyLegacyMockExams({exams:[exam],teacherIds:['a','b'],primaryTeacherId:'a',studentTeachers:students});
  const [a,b]=copied.exams;
  assert.equal(a.id,'old'); assert.notEqual(b.id,a.id);
  assert.deepEqual(a.monthlyAssignments,{a:['2026-11']});assert.deepEqual(b.monthlyAssignments,{b:['2026-10']});
  assert.deepEqual(b.monthlyReviewVideos,{b:{url:'b'}});
  assert.deepEqual(a.access.students,['p']);assert.deepEqual(b.access.students,['q']);
  b.tasks[25].answers[0]='changed';assert.equal(a.tasks[25].answers[0],'1');assert.equal(exam.tasks[25].answers[0],'1');
  const ledger={p:{mockAttempts:{old:{answers:{25:['1','2']},examSnapshot:{id:'old'}}}},q:{mockAttempts:{old:{answers:{25:['3','4']}}},mockAttemptResults:[{examId:'old',solved:{25:true}}],homeworks:[{goals:[{type:'mock',mockExamId:'old'}]}]}};
  const remapped=remapScopedMockReferences(ledger,{mappings:copied.mappings,studentTeachers:students});
  assert.deepEqual(remapped.p,ledger.p);
  assert.deepEqual(remapped.q.mockAttempts[b.id].answers,{25:['3','4']});
  assert.equal(remapped.q.mockAttemptResults[0].examId,b.id);assert.equal(remapped.q.homeworks[0].goals[0].mockExamId,b.id);
  assert.deepEqual(copyLegacyMockExams({exams:copied.exams,teacherIds:['a','b'],primaryTeacherId:'a'}).exams,copied.exams,'Reapplying does not clone private libraries again');
});

test('personal generated exams stay with their pupil instead of being copied to other teachers',()=>{
  const exam={id:'personal',source:'personal-random',generatedForStudentId:'q',access:{all:false,students:['q']}};
  const copied=copyLegacyMockExams({exams:[exam],teacherIds:['a','b'],primaryTeacherId:'a',studentTeachers:{q:'b'}});
  assert.deepEqual(copied.exams,[{...exam,teacherId:'b'}]);
  assert.deepEqual(copied.mappings,{a:{},b:{}});
  assert.throws(()=>copyLegacyMockExams({exams:[exam],teacherIds:['a','b'],primaryTeacherId:'a'}),/owner/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {getLearningGroupCalendarParticipants} from './groupCalendarParticipants.js';

test('historical transferred pupils stay editable while an inactive pupil does not become phantom debt', () => {
  const entry = {isLearningGroupEvent:true,groupId:'old-group',participantIds:['a','b','c','ivan','inactive','artem'],
    memberPaymentStatuses:[...['a','b','c'].map(studentId=>({studentId,status:'paid'})),
      ...['ivan','artem'].map(studentId=>({studentId,status:'not-required',participationRequired:false,absenceWaived:false}))]};
  const before = structuredClone(entry);
  const rows = getLearningGroupCalendarParticipants(entry,{ivan:'Иван М',artem:'Артём'});
  assert.deepEqual(rows.map(row=>row.studentId),['a','b','c','ivan','artem']);
  assert.equal(rows.filter(row=>row.status!=='not-required').length,3);
  assert.equal(rows.find(row=>row.studentId==='ivan').studentName,'Иван М');
  assert.equal(rows.find(row=>row.studentId==='artem').participationRequired,false);
  assert.deepEqual(entry,before,'The historical lesson snapshot remains intact');
});

test('empty authoritative payment rows do not fall back to charging historical IDs', () => {
  assert.deepEqual(getLearningGroupCalendarParticipants({isLearningGroupEvent:true,groupId:'g',participantIds:['old'],memberPaymentStatuses:[]}),[]);
});

test('older calendar entries without payment projection retain participant names and order', () => {
  const entry={isLearningGroupEvent:true,groupId:'g',participantIds:['a','b'],participants:[{studentId:'a',name:'Первый'}]};
  assert.deepEqual(getLearningGroupCalendarParticipants(entry,{b:'Второй'}).map(row=>row.studentName),['Первый','Второй']);
  assert.deepEqual(getLearningGroupCalendarParticipants({...entry,isLearningGroupEvent:false}),[]);
});

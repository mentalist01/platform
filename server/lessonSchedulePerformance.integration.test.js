import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';
import {createBalanceAccount} from './studentPaymentBalances.js';

test('lesson reminder reads preserve schedule ownership and leave wallet reconciliation to the full calendar', {timeout:60000},async()=>{
  const day=new Date(Date.now()-3*86400000).toISOString().slice(0,10),now=new Date().toISOString();
  const account=createBalanceAccount({openingByMonth:{[day.slice(0,7)]:900},now});
  const f=await createGroupHomeworkFixture(undefined,write=>{
    write('progress',{'student-a':{schedule:[{id:'individual',date:day,time:'18:00',durationMinutes:60,studentId:'student-a'}],homeworks:[],progress:{}}});
    write('teacher-finances',{'teacher-a':{studentProfiles:{'student-a':{lessonPrice:900}},studentPaymentBalances:{version:1,enabledAt:now,accounts:{'student-a':account}}}});
  });
  const finance=path.join(f.data,'teacher-finances.json');
  try{
    const before=fs.readFileSync(finance,'utf8');
    const own=await f.request('/api/student-schedule?studentId=student-a&purpose=lesson',f.tokens['student-a']);
    assert.ok(own.some(entry=>entry.id==='individual'));
    assert.ok(own.every(entry=>!Object.hasOwn(entry,'paymentStatusByDate')));
    const teacher=await f.request('/api/teacher-schedule?purpose=lesson',f.tokens['teacher-a']);
    assert.ok(teacher.some(entry=>entry.id==='individual'&&entry.studentId==='student-a'));
    assert.ok(teacher.every(entry=>!Object.hasOwn(entry,'studentHomeworkProgress')));
    const marks=await f.request('/api/teacher-calendar-marks?purpose=lesson',f.tokens['teacher-a']);assert.ok(marks.marks);
    assert.equal(fs.readFileSync(finance,'utf8'),before,'background reminders must not reconcile or rewrite the financial journal');
    const unrelated=await f.request('/api/student-schedule?studentId=student-a&purpose=lesson',f.tokens['student-c']);assert.ok(unrelated.every(entry=>entry.id!=='individual'),'a pupil can only read their own schedule, even when another ID is supplied');
    await f.request('/api/teacher-schedule?purpose=lesson',f.tokens['student-a'],undefined,'GET',403);
    await f.request('/api/teacher-calendar-marks?purpose=lesson',f.tokens['student-a'],undefined,'GET',403);
    const other=await f.request('/api/teacher-schedule?purpose=lesson',f.tokens['teacher-b']);assert.ok(other.every(entry=>entry.studentId!=='student-a'));
    const full=await f.request('/api/student-schedule?studentId=student-a',f.tokens['teacher-a']);
    assert.ok(full.some(entry=>entry.id==='individual'));
    const after=JSON.parse(fs.readFileSync(finance,'utf8'));
    const balance=after['teacher-a'].studentPaymentBalances.accounts['student-a'];
    assert.equal(balance.entries.reduce((sum,entry)=>sum+entry.creditCents,0),account.entries.reduce((sum,entry)=>sum+entry.creditCents,0),'ordinary reconciliation preserves the received funds');
  }finally{await f.stop();}
});

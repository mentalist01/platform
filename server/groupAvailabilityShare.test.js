import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {registerGroupAvailabilityShare} from './groupAvailabilityShare.js';
import {addCalendarDays,moscowDay,AVAILABILITY_WEEKDAYS,weekdayIndex} from '../src/utils/groupAvailability.js';

test('teacher summary uses all current groups, one fresh calendar, no pupil names, no mutations and protects access',async t=>{
  const app=express();app.use((req,_res,next)=>{req.auth={'teacher':{role:'teacher',id:'t'},'other':{role:'teacher',id:'other'},'pupil':{role:'student',id:'a'}}[req.headers.authorization];next();});
  const members=['a','b','c'].map(studentId=>({studentId,status:'active',name:'PRIVATE PUPIL'}));
  const groups=['g1','g2','missing','other','closed','deleted'].map(id=>({id,name:id,teacherId:id==='other'?'other':'t',status:id==='closed'?'completed':'active',members,...(id==='deleted'?{deletedAt:'yesterday'}:{})}));
  const startDate=addCalendarDays(moscowDay(),1),day=weekdayIndex(startDate),slot=`${day}-600`;
  const config={startDate,days:[0,1,2,3,4,5,6],startMinute:600,endMinute:720,durationMinutes:60,weeks:8};
  const answers=Object.fromEntries(['a','b','c'].map((id,i)=>[id,{choices:{[slot]:i===2?'maybe':'yes'},name:'PRIVATE PUPIL'}]));
  const polls=Object.fromEntries(['g1','g2','other'].map(id=>[id,{config,answers,status:'approved'}]));
  const before=JSON.stringify({groups,polls});let calls=0,fail=false;
  registerGroupAvailabilityShare(app,{groups:()=>structuredClone(groups),polls:()=>structuredClone(polls),canManage:(auth,group)=>auth.role==='teacher'&&auth.id===group.teacherId,
    getEntries:async (teacher,through)=>{calls++;assert.ok(through>=addCalendarDays(startDate,56));assert.equal(teacher,'t');if(fail)throw Error('calendar unavailable');return [{groupId:'g1',teacherId:'t',weekdayKey:AVAILABILITY_WEEKDAYS[day],time:'10:00',durationMinutes:60},{weekdayKey:AVAILABILITY_WEEKDAYS[day],time:'10:30',durationMinutes:30,cancelled:true,subject:'PRIVATE LESSON'}];}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/learning-groups/availability-share?teacherId=other`;
  const get=async auth=>{const res=await fetch(url,{headers:auth?{authorization:auth}:{}});return {status:res.status,data:await res.json()};};
  for(const auth of ['', 'pupil'])assert.equal((await get(auth)).status,403);
  const result=await get('teacher');assert.equal(result.status,200);assert.equal(calls,1,'One calendar request for all groups');
  assert.deepEqual(result.data.groups.map(group=>group.groupId),['g1','g2','missing']);
  assert.equal(result.data.groups[0].slots[0].busy,false,'This group’s own lesson remains an enrolment option');
  assert.equal(result.data.groups[1].slots[0].busy,true,'Another group is a teacher conflict');
  assert.equal(result.data.groups[0].slots[0].flexibleCount,1);assert.equal(result.data.groups[2].slots.length,0);
  assert.ok(!JSON.stringify(result.data).includes('PRIVATE'));assert.equal(JSON.stringify({groups,polls}),before);
  fail=true;const unavailable=await get('teacher');assert.equal(unavailable.status,200);assert.ok(unavailable.data.calendarError);assert.equal(unavailable.data.groups[0].slots[0].busy,null);
  assert.equal(JSON.stringify({groups,polls}),before,'Unavailable calendar does not change preferences');
});

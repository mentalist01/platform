import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {participationDay} from '../src/utils/groupParticipation.js';
import {getStudentPaymentReminderItems} from '../src/utils/studentPaymentReminder.js';

test('teacher can waive and restore one missed group lesson across calendar, debt and finance without changing payments or access', {timeout:45000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'group-absence-')), data=path.join(root,'data'); fs.mkdirSync(data);
  const write=(name,value)=>fs.writeFileSync(path.join(data,name+'.json'),JSON.stringify(value));
  const read=name=>JSON.parse(fs.readFileSync(path.join(data,name+'.json'),'utf8'));
  const before=new Date(Date.now()-40*86400000).toISOString();
  const days=[-5,-3,2].map(offset=>participationDay(Date.now()+offset*86400000));
  write('teachers',[{id:'t',code:'teacher',name:'Teacher',createdAt:before},{id:'other',code:'other',name:'Other'}]);
  write('students',['a','b'].map(id=>({id,teacherId:'t',code:id,name:id,grade:'11',studyStatus:'active',createdAt:before})));
  write('tests',{}); write('mock-exams',[]);
  write('progress',Object.fromEntries(['a','b'].map(id=>[id,{schedule:[],homeworks:[],mockAttempts:{}}])));
  write('learning-groups',[{id:'g',teacherId:'t',name:'Группа 2',status:'active',startedAt:before,createdAt:before,pricePerLesson:1000,
    members:['a','b'].map(studentId=>({studentId,status:'active',joinedAt:before}))}]);
  write('learning-lesson-sessions',days.map((day,index)=>({id:'l'+index,groupId:'g',teacherId:'t',participantIds:['a','b'],
    startAt:day+'T20:00:00+03:00',durationMinutes:60,topic:'Lesson',source:'availability-plan',status:index===2?'scheduled':'completed',createdAt:before,updatedAt:before})));
  const paidKey=`t:learning-group-session-l0:${days[0]}:b:20:00:paid`;
  write('teacher-calendar-marks',{t:{[paidKey]:before}});
  const probe=net.createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),NODE_ENV:'test',TZ:'Europe/Moscow',
    PLATFORM_CALENDAR_TIME_ZONE:'Europe/Moscow',PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),
    COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1',LEARNING_GROUP_RTC_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
  let logs=''; child.stdout.on('data',c=>{logs+=c;});child.stderr.on('data',c=>{logs+=c;});
  t.after(async()=>{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);
    if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;;i++){try{if((await fetch(base+'/api/client-build-version')).ok)break;}catch{/* Starting. */}
    if(i>150||child.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
  const call=async(route,token,body,method='GET',status=200)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.equal(r.status,status,`${route}: ${JSON.stringify(j)}`);return j;};
  const teacher=(await call('/api/login',null,{code:'teacher'},'POST')).token;
  const other=(await call('/api/login',null,{code:'other'},'POST')).token;
  const a=(await call('/api/login',null,{code:'a'},'POST')).token;
  const b=(await call('/api/login',null,{code:'b'},'POST')).token;
  const route='/api/learning-groups/g/lessons/l0/absence';
  const mark=(studentId,absent,token=teacher,status=200)=>call(route,token,{studentId,absent},'PUT',status);
  await mark('a',true,a,403);await mark('a',true,other,403);await mark('foreign',true,teacher,404);await mark('a','yes',teacher,400);
  await call(route.replace('l0','l2'),teacher,{studentId:'a',absent:true},'PUT',409);
  await mark('b',true,teacher,409);
  const financeRoute='/api/teacher-finance?month='+days[0].slice(0,7);
  await call(financeRoute,teacher);
  const ledger=()=>Object.values(read('teacher-finances').t.lessonLedger);
  assert.ok(ledger().some(row=>row.studentId==='a'&&row.dayKey===days[0]));
  const progress=fs.readFileSync(path.join(data,'progress.json'),'utf8');
  const first=await mark('a',true);const second=await mark('a',true);
  const occurrence={id:'learning-group-session-l0',groupId:'g',studentId:'a',date:days[0],dayKey:days[0],time:'20:00',durationMinutes:60};
  await call('/api/teacher-lesson-payment',teacher,{occurrence,paid:true},'POST',409);
  assert.deepEqual(second.lesson.absenceWaivers,first.lesson.absenceWaivers,'Repeated marking is idempotent');
  assert.deepEqual(second.lesson.participantIds,['a','b']);assert.deepEqual(second.lesson.participationOverrides||{},{});
  const rows=await call('/api/teacher-schedule',teacher), row=rows.find(e=>e.lessonId==='l0');
  assert.equal(row.memberPaymentStatuses.find(m=>m.studentId==='a').absenceWaived,true);
  assert.equal(row.memberPaymentStatuses.find(m=>m.studentId==='a').status,'not-required');
  assert.equal(row.memberPaymentStatuses.find(m=>m.studentId==='b').status,'paid');
  const peerLesson=await call('/api/learning-groups/g/lessons/l0',b);
  assert.deepEqual(peerLesson.lesson.absenceWaivers,{},'Other pupils do not receive the private absence mark');
  const schedule=await call('/api/student-schedule',a);
  const missed=schedule.find(e=>e.lessonId==='l0'); assert.ok(missed,'The lesson remains in history');
  assert.equal(missed.payment.statesByDate[days[0]].participationRequired,true,'Attendance waiver does not alter enrolment');
  assert.deepEqual(getStudentPaymentReminderItems(schedule).map(r=>r.dateKey),[days[1]]);
  await call(financeRoute,teacher);
  assert.ok(!ledger().some(r=>r.studentId==='a'&&r.dayKey===days[0]),'Old unpaid ledger snapshot removed');
  assert.ok(ledger().some(r=>r.studentId==='b'&&r.dayKey===days[0]&&r.paid),'Other participant payment retained');
  assert.ok((await call('/api/student-schedule',b)).find(e=>e.lessonId==='l0').payment.statesByDate[days[0]].paid);
  await mark('a',false);await call(financeRoute,teacher);
  assert.ok(ledger().some(r=>r.studentId==='a'&&r.dayKey===days[0]&&!r.paid),'Undo restores the lesson charge');
  assert.deepEqual(getStudentPaymentReminderItems(await call('/api/student-schedule',a)).map(r=>r.dateKey).sort(),days.slice(0,2).sort());
  assert.equal(read('teacher-calendar-marks').t[paidKey],before);
  assert.equal(fs.readFileSync(path.join(data,'progress.json'),'utf8'),progress,'Homework and answers unchanged');
});

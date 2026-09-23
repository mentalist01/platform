import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { addCalendarDays, moscowDay, weekdayIndex, AVAILABILITY_WEEKDAYS } from '../src/utils/groupAvailability.js';

test('full server: pupil choices become group lessons and teacher/student calendar entries, stay private and survive restart', {timeout:60000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-group-poll-')); const data=path.join(root,'data'); fs.mkdirSync(data);
  const seed=(name,value)=>fs.writeFileSync(path.join(data,name),JSON.stringify(value));
  const createdAt=new Date().toISOString();
  seed('teachers.json',[{id:'t',name:'Teacher',code:'110001',createdAt},{id:'other',name:'Other',code:'220001',createdAt}]);
  seed('students.json',['a','b','outsider'].map((id,i)=>({id,teacherId:i<2?'t':'other',name:id,code:String(110101+i),createdAt,deletedAt:null})));
  const startDate=addCalendarDays(moscowDay(),1); const occupiedDay=weekdayIndex(startDate);
  seed('progress.json',{a:{schedule:[{id:'private-lesson',weekdayKey:AVAILABILITY_WEEKDAYS[occupiedDay],time:'10:00',durationMinutes:60,subject:'PRIVATE NAME'}],homeworks:[],mockAttempts:{}},b:{schedule:[],homeworks:[],mockAttempts:{}}});
  seed('tests.json',{}); seed('mock-exams.json',[]);
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  let child; let logs='';
  const stop=async()=>{if(!child||child.exitCode!==null)return;const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;};
  t.after(async()=>{await stop();fs.rmSync(root,{recursive:true,force:true});});
  const boot=async()=>{
    child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,
      NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),
      COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1',LEARNING_GROUP_RTC_ENABLED:'0',PLATFORM_CALENDAR_TIME_ZONE:'Europe/Moscow'},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
    for(let i=0;i<180;i++) {if(child.exitCode!==null)throw Error(logs);try {if((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
    throw Error(logs);
  };
  const req=async(url,token='',body,expected=200)=>{
    const r=await fetch(`http://127.0.0.1:${port}/api${url}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const value=await r.json();assert.equal(r.status,expected,`${url}: ${JSON.stringify(value)}\n${r.status>=500?logs:''}`);return value;
  };
  await boot(); const teacher=(await req('/login','',{code:'110001'})).token;
  const tokens=await Promise.all(['110101','110102','110103'].map(async code=>(await req('/login','',{code})).token));
  const group=(await req('/learning-groups',teacher,{name:'Together',studentIds:['a','b'],plannedStartDate:startDate},201)).group;
  const base=`/learning-groups/${group.id}/availability`;
  await req(base,'',undefined,401); await req(base,tokens[2],undefined,403);
  const opened=await req(`${base}/open`,teacher,{startDate,durationMinutes:60,startMinute:600,endMinute:1200,days:[0,1,2,3,4,5,6]});
  assert.ok(opened.blocked[`${occupiedDay}-600`]); assert.ok(!JSON.stringify(opened).includes('PRIVATE NAME'));
  const roundId=opened.poll.id; const slots=['0-720','3-720'];
  for(const token of tokens.slice(0,2)) await req(`${base}/answer`,token,{roundId,version:0,choices:Object.fromEntries(slots.map(s=>[s,'yes']))});
  const p=(await req(`${base}/propose`,tokens[0],{roundId,slots})).poll.proposal;
  for(const token of tokens.slice(0,2)) await req(`${base}/vote`,token,{roundId,proposalId:p.id,choice:'yes'});
  assert.equal((await req(`${base}/approve`,teacher,{roundId,proposalId:p.id})).poll.status,'approved');
  const lessons=(await req(`/learning-groups/${group.id}/lessons`,teacher)).lessons;
  assert.equal(lessons.length,16); assert.ok(lessons.every(l=>l.source==='availability-plan'));
  assert.equal(new Set(lessons.map(l=>l.id)).size,16);
  const calendar=await req('/teacher-schedule',teacher);
  assert.equal(calendar.filter(e=>e.groupId===group.id).length,16);
  const studentCalendar=await req('/student-schedule?studentId=a',tokens[0]);
  assert.equal(studentCalendar.filter(e=>e.groupId===group.id).length,16,'Student schedule must include new group lessons');
  assert.ok(studentCalendar.some(e=>e.lessonId===lessons[0].id));
  const outsiderCalendar=await req('/student-schedule?studentId=outsider',tokens[2]);
  assert.ok(!outsiderCalendar.some(e=>e.groupId===group.id));
  await stop(); await boot();
  const again=await req(`/learning-groups/${group.id}/lessons`,teacher);
  assert.deepEqual(again.lessons.map(l=>l.id).sort(),lessons.map(l=>l.id).sort());
});

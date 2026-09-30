import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encryptGoogleCalendarTokens } from './googleCalendarWriteback.js';
import { moscowDay, addCalendarDays, weekdayIndex, AVAILABILITY_WEEKDAYS } from '../src/utils/groupAvailability.js';

for (const kind of ['future','previous-local','previous-google']) test(`full server: ${kind}, payment follows, retry survives restart`, {timeout:60000},async t=>{
  const correctPrevious=kind!=='future',previousGoogle=kind==='previous-google';
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-reschedule-integration-'));const data=path.join(root,'data');fs.mkdirSync(data);
  const seed=(file,value)=>fs.writeFileSync(path.join(data,file),JSON.stringify(value));
  const createdAt=new Date().toISOString();const date=addCalendarDays(moscowDay(),correctPrevious?-7:1),target=addCalendarDays(moscowDay(),10);
  const requestedDate=correctPrevious?addCalendarDays(date,14):date;
  const source={id:'weekly',weekdayKey:AVAILABILITY_WEEKDAYS[weekdayIndex(date)],time:'16:00',durationMinutes:60,subject:'Занятие'};
  const paidEntryId=previousGoogle?`google-ical-${crypto.createHash('sha1').update(`t:previous-uid:${new Date(`${date}T16:00:00+03:00`).toISOString()}`).digest('hex').slice(0,18)}`:'weekly';
  const key=`t:${paidEntryId}:${date}:a:16:00:paid`;
  seed('teachers.json',[{id:'t',name:'Teacher',code:'741001',createdAt}]);seed('students.json',[{id:'a',name:'Аня',teacherId:'t',code:'741002',createdAt,deletedAt:null}]);
  seed('progress.json',{a:{schedule:[source],homeworks:[],mockAttempts:{}}});seed('tests.json',{});seed('mock-exams.json',[]);
  seed('teacher-calendar-marks.json',{t:{[key]:createdAt}});
  seed('teacher-finances.json',{t:{studentProfiles:{a:{lessonPrice:1000}},months:{[date.slice(0,7)]:{students:{a:{paidAmount:1000}}}},paymentAllocations:{[key]:{
    originMarkKey:key,currentMarkKey:key,currentEntryId:paidEntryId,currentDayKey:date,currentTime:'16:00',currentDurationMinutes:60,
    studentId:'a',amount:1000,status:'allocated',sourceEntryId:paidEntryId,sourceDayKey:date,sourceTime:'16:00',sourceDurationMinutes:60,sourceMarkValue:createdAt,createdAt,updatedAt:createdAt}}}});
  seed('teacher-calendar-google.json',{t:{calendarId:'test-calendar',encryptedTokens:encryptGoogleCalendarTokens({accessToken:'fixture-token',expiresAtMs:Date.now()+3600000},'fixture-secret')}});
  const preload=path.join(root,'google-fixture.mjs');
  if(previousGoogle) fs.writeFileSync(path.join(root,'google-state.json'),JSON.stringify([{id:'previous-event',iCalUID:'previous-uid',etag:'"fixture"',summary:'Аня',
    start:{dateTime:`${date}T16:00:00+03:00`},end:{dateTime:`${date}T17:00:00+03:00`},extendedProperties:{private:{}}}]));
  fs.writeFileSync(preload,`import fs from 'node:fs';const original=globalThis.fetch;const file=${JSON.stringify(path.join(root,'google-state.json'))};
    globalThis.fetch=async(url,opts={})=>{if(!String(url).startsWith('https://www.googleapis.com/calendar/v3/'))return original(url,opts);
      const u=new URL(url);const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
      if(opts.method==='POST'){const body=JSON.parse(opts.body);const event={...body,iCalUID:'fixture-created-uid'};state.push(event);fs.writeFileSync(file,JSON.stringify(state));return new Response(JSON.stringify(event));}
      if(opts.method==='PATCH'){const index=state.findIndex(e=>e.id===decodeURIComponent(u.pathname.split('/').at(-1)));if(index<0)return new Response('{}',{status:404});state[index]={...state[index],...JSON.parse(opts.body)};fs.writeFileSync(file,JSON.stringify(state));return new Response(JSON.stringify(state[index]));}
      const items=u.searchParams.has('privateExtendedProperty')?state.filter(e=>e.extendedProperties?.private?.ivan100Reschedule===u.searchParams.get('privateExtendedProperty').split('=')[1]):state.filter(e=>(!u.searchParams.has('iCalUID')||e.iCalUID===u.searchParams.get('iCalUID'))&&(!u.searchParams.has('timeMin')||(Date.parse(e.start.dateTime)<Date.parse(u.searchParams.get('timeMax'))&&Date.parse(e.end.dateTime)>Date.parse(u.searchParams.get('timeMin')))));
      return new Response(JSON.stringify({items}));};`);
  const port=await new Promise(resolve=>{const probe=net.createServer().listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
  let child,logs='';const stop=async()=>{if(!child||child.exitCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill();await done;};
  t.after(async()=>{await stop();fs.rmSync(root,{recursive:true,force:true});});
  const boot=async()=>{child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1',
    GOOGLE_CALENDAR_OAUTH_CLIENT_ID:'test',GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET:'test',GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY:'fixture-secret',GOOGLE_CALENDAR_OAUTH_REDIRECT_URI:'http://localhost/fixture'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
    for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok)return;}catch{/* Wait for the isolated server to listen. */}await new Promise(r=>setTimeout(r,100));}throw Error(logs);};
  const req=async(url,token='',body,status=200)=>{const r=await fetch(`http://127.0.0.1:${port}/api${url}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v)+'\n'+logs.slice(-1000));return v;};
  await boot();const teacher=(await req('/login','',{code:'741001'})).token;const student=(await req('/login','',{code:'741002'})).token;
  await req('/lesson-reschedules','',undefined,401);
  const availability=await req('/lesson-reschedules/availability',student);const lesson=availability.lessons.find(l=>l.date===requestedDate);assert.ok(lesson);
  assert.ok(availability.lessons.some(l=>l.date===date));
  if(previousGoogle) assert.ok(availability.lessons.find(l=>l.date===date).key.startsWith('previous-uid|'),'Fetch history older than yesterday and prefer the actual Google occurrence');
  const row=await req('/lesson-reschedules',student,{lessonKey:lesson.key,date:target,time:'18:00'});
  assert.equal((await req('/lesson-reschedules',teacher)).requests[0].id,row.id);
  const corrected=availability.lessons.find(l=>l.date===date);
  const approval=await req(`/lesson-reschedules/${row.id}/approve`,teacher,correctPrevious?{lessonKey:corrected.key,sourceDurationMinutes:60}:{});
  assert.equal(approval.status,'approved');assert.equal(approval.source.date,date);assert.equal(approval.requestedSource.date,requestedDate);
  const schedule=await req('/student-schedule?studentId=a',student);assert.ok(schedule.find(e=>e.id==='weekly').excludedDates.includes(date));
  assert.equal(schedule.filter(e=>e.date===target&&e.time==='18:00').length,1);
  if(correctPrevious) assert.ok(!schedule.find(e=>e.id==='weekly').excludedDates.includes(requestedDate),'The future lesson the pupil chose by mistake must stay in the series');
  const calendar=await req('/teacher-schedule',teacher);assert.equal(calendar.filter(e=>e.date===target&&e.time==='18:00').length,1);
  const marks=JSON.parse(fs.readFileSync(path.join(data,'teacher-calendar-marks.json'),'utf8')).t;
  assert.ok(!marks[key]);assert.equal(Object.keys(marks).filter(k=>k.includes(target)&&k.endsWith(':paid')).length,1);
  const finance=JSON.parse(fs.readFileSync(path.join(data,'teacher-finances.json'),'utf8')).t;
  assert.equal(finance.paymentAllocations[key].currentDayKey,target);
  if(date.slice(0,7)!==target.slice(0,7)){assert.equal(finance.months[date.slice(0,7)].students.a.paidAmount,0);assert.equal(finance.months[target.slice(0,7)].students.a.paidAmount,1000);}
  await stop();await boot();assert.equal((await req(`/lesson-reschedules/${row.id}/approve`,teacher,{})).status,'approved');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'google-state.json'),'utf8')).length,1);
  assert.equal((await req('/student-schedule?studentId=a',student)).filter(e=>e.date===target&&e.time==='18:00').length,1);
});

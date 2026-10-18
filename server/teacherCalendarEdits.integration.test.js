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

for (const balances of [false, true]) test(`teacher calendar writes preserve ownership and payment${balances ? ' with wallet' : ''}`, {timeout:60000},async t=>{
  const kind='future';
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
      if(opts.method==='POST'){const body=JSON.parse(opts.body);const event={...body,iCalUID:'uid-'+body.id};state.push(event);fs.writeFileSync(file,JSON.stringify(state));return new Response(JSON.stringify(event));}
      if(opts.method==='PATCH'){const index=state.findIndex(e=>e.id===decodeURIComponent(u.pathname.split('/').at(-1)));if(index<0)return new Response('{}',{status:404});state[index]={...state[index],...JSON.parse(opts.body)};fs.writeFileSync(file,JSON.stringify(state));return new Response(JSON.stringify(state[index]));}
      if(!u.search && !u.pathname.endsWith('/events')){const event=state.find(e=>e.id===decodeURIComponent(u.pathname.split('/').at(-1)));return new Response(JSON.stringify(event||{}),{status:event?200:404});}
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
  if (balances) {
    const preview = await req('/student-payment-balances', teacher);
    await req('/student-payment-balances/enable', teacher, { previewToken: preview.previewToken });
  }

  const move={id:'teacher-move-00001',operation:'move',source:{id:'weekly',date,time:'16:00',durationMinutes:60},target:{date:target,time:'18:00',durationMinutes:60}};
  await req('/teacher-calendar/edits',student,move,403);
  assert.equal((await req('/teacher-calendar/edits',teacher,move)).status,'done');
  await req('/teacher-calendar/edits',teacher,move);
  const schedule=await req('/student-schedule?studentId=a',student);
  assert.ok(schedule.find(e=>e.id==='weekly').excludedDates.includes(date));
  assert.equal(schedule.filter(e=>e.date===target&&e.time==='18:00').length,1);
  const marks=JSON.parse(fs.readFileSync(path.join(data,'teacher-calendar-marks.json'),'utf8')).t;
  assert.ok(!marks[key]);assert.equal(Object.keys(marks).filter(k=>k.includes(target)&&k.endsWith(':paid')).length,1);
  const finance=JSON.parse(fs.readFileSync(path.join(data,'teacher-finances.json'),'utf8')).t;
  if(balances){const account=finance.studentPaymentBalances.accounts.a;assert.equal(Object.values(account.allocations).length,1);assert.equal(Object.values(account.allocations)[0].dayKey,target);}
  else assert.equal(finance.paymentAllocations[key].currentDayKey,target);
  const create=async(id,extra)=>req('/teacher-calendar/edits',teacher,{id,operation:'create',target:{date:target,time:'14:00',durationMinutes:60,title:'Свое название',...extra}});
  await create('teacher-create-a-001',{studentId:'a'});
  let events=await req('/teacher-schedule',teacher);
  const custom=events.find(e=>e.date===target&&e.time==='14:00'&&e.studentId==='a');assert.ok(custom,'Custom title must retain the pupil binding');
  await req('/teacher-calendar/edits',teacher,{id:'teacher-move-a-0002',operation:'move',source:{id:custom.id,date:target,time:'14:00',durationMinutes:60},target:{date:target,time:'14:10',durationMinutes:60}});
  await create('teacher-personal-001',{});
  const group=(await req('/learning-groups',teacher,{name:'Группа проверки',studentIds:['a']},201)).group;
  await req('/learning-groups/'+group.id+'/start',teacher,{});
  await create('teacher-group-00001',{groupId:group.id,time:'20:00'});
  events=await req('/teacher-schedule',teacher);
  const groupEvent=events.find(e=>e.date===target&&e.time==='20:00'&&e.groupId===group.id);assert.ok(groupEvent,'Group keeps its binding with a custom event title');
  const lessonId=groupEvent.lessonId;assert.ok(lessonId);
  await req('/teacher-calendar/edits',teacher,{id:'teacher-group-move-01',operation:'move',source:{id:groupEvent.id,date:target,time:'20:00',durationMinutes:60},target:{date:target,time:'20:10',durationMinutes:60}});
  events=await req('/teacher-schedule',teacher);
  const movedGroup=events.filter(e=>e.date===target&&e.time==='20:10'&&e.groupId===group.id);assert.equal(movedGroup.length,1);assert.equal(movedGroup[0].lessonId,lessonId);
  const sessions=JSON.parse(fs.readFileSync(path.join(data,'learning-lesson-sessions.json'),'utf8')).filter(e=>e.groupId===group.id);
  assert.equal(sessions.length,1,'Move never creates another group lesson');
  const count=JSON.parse(fs.readFileSync(path.join(root,'google-state.json'),'utf8')).length;
  await stop();await boot();const renewed=(await req('/login','',{code:'741001'})).token;
  await req('/teacher-calendar/edits',renewed,move);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'google-state.json'),'utf8')).length,count);
});

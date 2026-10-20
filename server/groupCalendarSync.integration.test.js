import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {encryptGoogleCalendarTokens} from './googleCalendarWriteback.js';
import {addCalendarDays,moscowDay} from '../src/utils/groupAvailability.js';

test('approval publishes group occurrences, survives uncertain Google response and restart, and imports without duplicates', {timeout:60000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'group-google-integration-')),data=path.join(root,'data');fs.mkdirSync(data);
  const seed=(file,value)=>fs.writeFileSync(path.join(data,file),JSON.stringify(value));
  const createdAt=new Date().toISOString(),startDate=addCalendarDays(moscowDay(),1);
  seed('teachers.json',[{id:'t',name:'Teacher',code:'876001',createdAt}]);
  seed('students.json',['a','b'].map((id,n)=>({id,name:id,teacherId:'t',code:String(876002+n),createdAt,deletedAt:null})));
  seed('progress.json',{a:{schedule:[],homeworks:[],mockAttempts:{}},b:{schedule:[],homeworks:[],mockAttempts:{}}});seed('tests.json',{});seed('mock-exams.json',[]);
  seed('teacher-calendar-google.json',{t:{calendarId:'fixture',encryptedTokens:encryptGoogleCalendarTokens({accessToken:'fixture',expiresAtMs:Date.now()+3600000},'fixture-secret')}});
  seed('teacher-calendar-sync.json',{t:{enabled:true,icalUrl:'https://calendar.google.com/calendar/ical/fixture/private-fixture/basic.ics'}});
  const remoteFile=path.join(root,'remote.json'),faultFile=path.join(root,'fault');fs.writeFileSync(remoteFile,'[]');
  const preload=path.join(root,'google.mjs');
  fs.writeFileSync(preload,`import fs from 'node:fs';const original=globalThis.fetch,file=${JSON.stringify(remoteFile)},fault=${JSON.stringify(faultFile)};
    globalThis.fetch=async(url,options={})=>{
      if(!String(url).startsWith('https://www.googleapis.com/calendar/v3/'))return original(url,options);
      const u=new URL(url),events=JSON.parse(fs.readFileSync(file)),method=options.method||'GET';
      if(method==='POST'){const body=JSON.parse(options.body);if(events.some(e=>e.id===body.id))return new Response('{}',{status:409});const event={...body,iCalUID:body.id+'@google.com',etag:'fixture'};events.push(event);fs.writeFileSync(file,JSON.stringify(events));if(fs.existsSync(fault)){fs.unlinkSync(fault);return new Response('{}',{status:503});}return Response.json(event);}
      const id=decodeURIComponent(u.pathname.split('/').at(-1));
      if(id==='events')return Response.json({items:events.filter(e=>e.status!=='cancelled')});
      const event=events.find(e=>e.id===id);if(!event)return new Response('{}',{status:404});
      if(method==='PATCH'){Object.assign(event,JSON.parse(options.body));fs.writeFileSync(file,JSON.stringify(events));}return Response.json(event);
    };`);
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  let child,logs='';
  const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}};
  t.after(async()=>{await stop();fs.rmSync(root,{recursive:true,force:true});});
  const boot=async()=>{
    child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,
      NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1',
      GOOGLE_CALENDAR_OAUTH_CLIENT_ID:'fixture',GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET:'fixture',GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY:'fixture-secret',GOOGLE_CALENDAR_OAUTH_REDIRECT_URI:'http://localhost/fixture'},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
    for(let n=0;n<180;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`http://127.0.0.1:${port}/api/client-build-version`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(logs);
  };
  const req=async(route,token,body,status=200)=>{
    const response=await fetch(`http://127.0.0.1:${port}/api${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value)+'\n'+logs.slice(-1000));return value;
  };
  await boot();const teacher=(await req('/login','',{code:'876001'})).token;
  const pupils=await Promise.all(['876002','876003'].map(async code=>(await req('/login','',{code})).token));
  const group=(await req('/learning-groups',teacher,{name:'Группа 3',studentIds:['a','b'],plannedStartDate:startDate},201)).group;
  const route=`/learning-groups/${group.id}/availability`;
  const roundId=(await req(route+'/open',teacher,{startDate,durationMinutes:60,startMinute:600,endMinute:1380,days:[0,1,2,3,4,5,6]})).poll.id;
  const proposalId=(await req(route+'/propose',teacher,{roundId,slots:['0-1140','3-1140']})).poll.proposal.id;
  await req(route+'/approve',pupils[0],{roundId,proposalId},403);
  assert.deepEqual((await req(route,teacher)).poll.proposal.votes,{});
  fs.writeFileSync(faultFile,'uncertain');
  const approved=await req(route+'/approve',teacher,{roundId,proposalId});
  assert.equal(approved.poll.status,'approved');
  assert.deepEqual(approved.poll.proposal.votes,{},'approval publishes calendars without fabricating student agreement');
  const wait=async expected=>{for(let n=0;n<100;n++){const value=await req(route,teacher);if(value.calendarSync.status===expected)return value;await new Promise(r=>setTimeout(r,50));}throw Error('Sync did not reach '+expected+'\n'+logs);};
  await wait('error');assert.equal(JSON.parse(fs.readFileSync(remoteFile)).length,1);
  const lessons=(await req(`/learning-groups/${group.id}/lessons`,teacher)).lessons;assert.equal(lessons.length,16);
  await req(route+'/sync-calendar',pupils[0],{planId:proposalId},403);
  assert.equal((await req(route,pupils[0])).calendarSync,undefined);
  await stop();await boot();
  const synced=await wait('synced');assert.equal(synced.calendarSync.synced,16);
  await req(route+'/approve',teacher,{roundId,proposalId});await wait('synced');
  assert.equal(JSON.parse(fs.readFileSync(remoteFile)).length,16);
  let calendar=await req('/teacher-schedule',teacher);assert.equal(calendar.filter(e=>e.groupId===group.id).length,16);
  const pupilCalendar=await req('/student-schedule?studentId=a',pupils[0]);assert.equal(pupilCalendar.filter(e=>e.groupId===group.id).length,16);
  const events=JSON.parse(fs.readFileSync(remoteFile));const moved=events[0],id=moved.extendedProperties.private.ivan100LessonId;
  moved.summary='Разбор — своё название';for(const key of ['start','end'])moved[key].dateTime=new Date(Date.parse(moved[key].dateTime)+600000).toISOString();fs.writeFileSync(remoteFile,JSON.stringify(events));
  await req('/teacher-calendar-sync/refresh',teacher,{force:true});
  calendar=await req('/teacher-schedule',teacher);
  const found=calendar.filter(e=>e.lessonId===id);assert.equal(found.length,1);assert.equal(found[0].time,'19:10');assert.equal(found[0].groupId,group.id);
  assert.equal((await req(`/learning-groups/${group.id}/lessons`,teacher)).lessons.length,16,'Google move preserves group room identities');
});

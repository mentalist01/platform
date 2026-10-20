import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRescheduleStore} from './lessonReschedule.js';
import {createGroupCalendarSync} from './groupCalendarSync.js';
import {ensureGoogleCalendarGroupLesson} from './googleCalendarWriteback.js';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'group-calendar-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'sync.json');
  const group={id:'g',teacherId:'t',name:'Группа 3'};
  const lessons=[0,1].map(n=>({id:'l'+n,groupId:'g',teacherId:'t',source:'availability-plan',status:'scheduled',startAt:`2030-10-${21+n}T19:30:00+03:00`,durationMinutes:60}));
  const poll={plan:{id:'p',googleCalendarSync:true}};
  const remote=new Map(),calls=[];
  let timeout=false,offline=false,calendarId='primary';
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url),id=u.pathname.split('/').at(-1),method=options.method || 'GET';calls.push({id,method});
    if(offline) return new Response('{}',{status:503});
    if(method==='POST') {
      const body=JSON.parse(options.body);assert.match(body.id,/^[0-9a-v]{64}$/);
      assert.equal(body.start.timeZone,'Europe/Moscow');assert.equal(body.summary,group.name);
      if(remote.has(body.id))return new Response('{}',{status:409});
      const event={...body,iCalUID:body.id+'@google.com',etag:'fixture'};remote.set(body.id,event);
      if(timeout){timeout=false;throw Error('network timeout after commit');}
      return Response.json(event);
    }
    const event=remote.get(id);if(!event)return new Response('{}',{status:404});
    if(method==='PATCH')Object.assign(event,JSON.parse(options.body));
    return Response.json(event);
  };
  const build=()=>createGroupCalendarSync({store:createRescheduleStore(file),polls:{get:()=>poll,plans:()=>[{groupId:'g',...poll.plan}]},
    getGroup:id=>id==='g'?group:null,readLessons:()=>lessons,materialize:()=>{},
    connection:async()=>({calendarId,accessToken:'fixture'}),
    writeGoogle:value=>ensureGoogleCalendarGroupLesson({...value,fetchImpl}),
    bindLesson:(id,result)=>Object.assign(lessons.find(l=>l.id===id),{externalEventId:result.iCalUID}),now:()=>Date.parse('2030-10-19T00:00:00Z')});
  return {build,group,poll,lessons,remote,calls,setTimeout:()=>timeout=true,setOffline:value=>offline=value,setCalendar:value=>calendarId=value};
}

test('uncertain Google write recovers after restart without duplicates; manual Google edits remain intact',async t=>{
  const f=fixture(t);f.setTimeout();let sync=f.build();sync.enqueue(f.group);await sync.idle();
  assert.equal(sync.status(f.group).status,'error');assert.equal(f.remote.size,1);
  sync=f.build();sync.resume();await sync.idle();
  assert.equal(sync.status(f.group).status,'synced');assert.equal(f.remote.size,2);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
  const moved=[...f.remote.values()][0];moved.start.dateTime='2030-10-21T17:40:00Z';moved.summary='Поменял в Google';
  const before=f.calls.length;sync.enqueue(f.group);sync.enqueue(f.group);await sync.idle();
  assert.equal(f.calls.length,before);assert.equal(moved.summary,'Поменял в Google');
  assert.deepEqual(sync.ownerForEvent('t',moved.iCalUID),{groupId:'g',lessonId:'l0'});
  assert.equal(sync.ownerForEvent('other',moved.iCalUID),undefined);
});

test('new plan cancels only its own future published lessons; pending work stays durable while Google is offline',async t=>{
  const f=fixture(t),sync=f.build();sync.enqueue(f.group);await sync.idle();
  f.lessons[0].status='cancelled';f.setOffline(true);sync.enqueue(f.group);await sync.idle();
  assert.equal(sync.status(f.group).status,'error');assert.equal(f.lessons[0].status,'cancelled');
  f.setOffline(false);sync.enqueue(f.group);await sync.idle();
  assert.equal([...f.remote.values()].filter(e=>e.status==='cancelled').length,1);
  assert.equal(sync.status(f.group).status,'synced');
  const other=[...f.remote.values()][1];other.extendedProperties.private.ivan100GroupId='other';f.lessons[1].status='cancelled';
  sync.enqueue(f.group);await sync.idle();
  assert.equal(sync.status(f.group).status,'error');assert.notEqual(other.status,'cancelled');
});

test('legacy plans require teacher opt-in; a changed destination cannot duplicate an uncertain write',async t=>{
  const f=fixture(t);f.poll.plan.googleCalendarSync=false;const sync=f.build();sync.resume();await sync.idle();assert.equal(f.calls.length,0);
  assert.equal(sync.status(f.group).status,'not_requested');
  f.poll.plan.googleCalendarSync=true;f.setTimeout();sync.enqueue(f.group);await sync.idle();
  f.setCalendar('different');sync.enqueue(f.group);await sync.idle();
  assert.equal(f.remote.size,1);assert.match(sync.status(f.group).error,/другой Google Calendar/);
});

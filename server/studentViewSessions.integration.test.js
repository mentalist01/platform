import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('teacher pupil tabs remain scoped, audited, separate from cookies, and revoked with the parent session',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),a=f.tokens['teacher-a'],b=f.tokens['teacher-b'],p=f.tokens['student-a'];
  const call=async(route,token,{method='GET',body,header=true,cookie=false,status=200}={})=>{
    const r=await fetch(f.base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(header?{'X-Student-View':'1'}:{}),...(cookie?{Cookie:'ege_auth_token='+a}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await r.json();assert.equal(r.status,status,route+': '+JSON.stringify(payload));return {r,payload};
  };
  try{
    const route='/api/students/student-a/open-session';
    await call(route,b,{method:'POST',body:{},status:404});
    await call(route,p,{method:'POST',body:{},status:403});
    await call(route,a,{method:'POST',body:{},header:false,status:403});
    const original=fs.readFileSync(path.join(f.data,'students.json'),'utf8');
    const {payload:view,r}=await call(route,a,{method:'POST',body:{},status:201});
    assert.ok(r.headers.get('set-cookie').includes(a));assert.equal(r.headers.get('set-cookie').includes(view.token),false);assert.equal(view.role,'student');assert.equal(view.id,'student-a');assert.ok(view.token.startsWith('sv_'));
    assert.ok(view.studentView.expiresAt);assert.equal(JSON.stringify(view).includes(a),false);
    assert.equal(fs.readFileSync(path.join(f.data,'students.json'),'utf8'),original);
    const second=(await call('/api/students/student-b/open-session',a,{method:'POST',body:{},status:201})).payload;
    const normal=(await call('/api/session',a)).payload;assert.equal(normal.role,'teacher');
    const current=await call('/api/session',view.token,{cookie:true});assert.equal(current.payload.id,'student-a');assert.equal(current.r.headers.get('set-cookie'),null);
    await call('/api/students',view.token,{status:403});
    await call('/api/students/student-b/open-session',view.token,{method:'POST',body:{},status:403});
    await call('/api/auth/security',view.token,{status:403});
    await call('/api/push/subscription',view.token,{method:'POST',body:{},status:403});
    const audit=fs.readFileSync(path.join(f.data,'student-view-audit.jsonl'),'utf8');assert.ok(audit.includes('student-a'));assert.equal(audit.includes(a),false);assert.equal(audit.includes(view.token),false);
    const persisted=JSON.parse(fs.readFileSync(path.join(f.data,'auth-sessions.json'),'utf8'));
    const entries=Array.isArray(persisted)?persisted:persisted.sessions;
    assert.ok(entries.find(s=>s.token===view.token)?.studentView);
    const ended=await call('/api/logout',view.token,{method:'POST',cookie:true});assert.equal(ended.r.headers.get('set-cookie'),null);
    const rejected=await call('/api/session',view.token,{cookie:true,status:401});assert.equal(rejected.r.headers.get('set-cookie'),null);
    assert.equal((await call('/api/session',second.token)).payload.id,'student-b');
    assert.equal((await call('/api/session',a)).payload.role,'teacher');
    assert.equal((await call('/api/session',p)).payload.id,'student-a','the actual pupil stays logged in');
    await call('/api/logout',a,{method:'POST'});
    await call('/api/session',second.token,{status:401});
    assert.equal((await call('/api/session',p)).payload.id,'student-a');
  }finally{await f.stop();}
});

test('pupil tabs survive a server restart without extending their expiry; deletion and expiry revoke access',{timeout:90000},async()=>{
  const f=await createGroupHomeworkFixture(),teacher=f.tokens['teacher-a'];let restarted;
  const launch=async(id='student-a')=>{
    const response=await fetch(f.base+'/api/students/'+id+'/open-session',{method:'POST',headers:{Authorization:'Bearer '+teacher,'Content-Type':'application/json','X-Student-View':'1'},body:'{}'});
    assert.equal(response.status,201);return response.json();
  };
  try{
    const view=await launch(),expired=await launch('student-b');await f.stop();
    const file=path.join(f.data,'auth-sessions.json'),sessions=JSON.parse(fs.readFileSync(file,'utf8'));
    const list=Array.isArray(sessions)?sessions:sessions.sessions;
    const originalExpiry=list.find(s=>s.token===view.token).expiresAtMs;
    list.find(s=>s.token===expired.token).expiresAtMs=Date.now()-1;
    fs.writeFileSync(file,JSON.stringify(sessions));
    restarted=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(import.meta.dirname,'..'),windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'test',PORT:new URL(f.base).port,PLATFORM_DATA_DIR:f.data,PLATFORM_UPLOADS_DIR:path.join(f.root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(f.root,'json-backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1',LEARNING_GROUP_RTC_ENABLED:'1'}});
    const deadline=Date.now()+30000;
    while(true){try{if((await fetch(f.base+'/api/availability')).ok)break;}catch{}if(Date.now()>deadline)throw Error('Restart timed out');await new Promise(r=>setTimeout(r,100));}
    assert.equal((await f.request('/api/session',view.token)).studentView.expiresAt,new Date(originalExpiry).toISOString());
    await f.request('/api/session',expired.token,null,'GET',401);
    await f.request('/api/students/student-a',teacher,null,'DELETE');
    await f.request('/api/session',view.token,null,'GET',401);
    await f.request('/api/students/student-a/restore',teacher,{});
    await f.request('/api/session',view.token,null,'GET',401,'revoked view never revives');
    assert.equal((await f.request('/api/session',teacher)).role,'teacher');
  }finally{
    if(f.child.exitCode===null&&f.child.signalCode===null)await f.stop();
    if(restarted&&restarted.exitCode===null&&restarted.signalCode===null){const ended=new Promise(r=>restarted.once('exit',r));restarted.kill();await ended;}
  }
});

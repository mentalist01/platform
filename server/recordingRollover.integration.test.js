import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';

for (const scenario of [{mode:'platform'}, {mode:'telemost'}, {mode:'platform',finishEarly:true}, {mode:'platform',disconnect:true}]) {
const {mode,finishEarly,disconnect}=scenario;
test(`consecutive individual lessons in ${mode}${finishEarly?' after explicit stop':disconnect?' after disconnect':' without reconnecting'}`, {timeout: 40000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-rollover-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, `${name}.json`), JSON.stringify(value));
  const start = Date.parse('2026-11-01T19:00:00+03:00');
  const clock = path.join(root, 'clock'); fs.writeFileSync(clock, String(start + 300000));
  const preload = path.join(root, 'clock.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs'; const RealDate=Date; globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[Date.now()]));} static now(){return Number(fs.readFileSync(${JSON.stringify(clock)},'utf8'));} };`);
  const createdAt = '2026-09-01T00:00:00.000Z';
  write('teachers', [{id:'t',name:'Teacher',createdAt}]);
  write('students', [{id:'p',name:'Pupil',teacherId:'t',createdAt,telemostUrl:'https://telemost.yandex.ru/j/fixture'}]);
  write('auth-sessions', ['t','p'].map(id => ({token:`fixture-${id}`,user:{id,name:id,role:id==='t'?'teacher':'student',teacherId:'t'},createdAtMs:start-86400000,expiresAtMs:start+86400000})));
  write('progress', {p:{schedule:[{id:'first',date:'2026-11-01',time:'19:00',durationMinutes:60},{id:'second',date:'2026-11-01',time:'20:00',durationMinutes:60}],homeworks:[]}});
  write('tests',{}); write('mock-exams',[]);
  const reserve=net.createServer().listen(0,'127.0.0.1'); await once(reserve,'listening');
  const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server/index.js'],{cwd:path.resolve(import.meta.dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1'}});
  let logs=''; child.stdout.on('data',b=>logs+=b); child.stderr.on('data',b=>logs+=b);
  const sockets=[];
  t.after(async()=>{sockets.forEach(ws=>ws.terminate()); if(child.exitCode===null){child.kill();await once(child,'exit');} assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('recording-rollover-')); fs.rmSync(root,{recursive:true,force:true});});
  const req=async(route,body,token='fixture-t',method=body===undefined?'GET':'POST')=>{
    const r=await fetch(`http://127.0.0.1:${port}/api${route}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});
    const value=await r.json(); assert.equal(r.status,200,`${route}: ${JSON.stringify(value)}\n${logs.slice(-1000)}`); return value;
  };
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{await req('/session');break;}catch(e){if(i===99)throw e;await delay(100);}}
  const {code}=await req('/desktop-recording/pair',{});
  const {token}=await req('/desktop-recorder/pair',{code,name:'Fixture'});
  await req('/desktop-recorder/poll',{ready:true},token);
  await req('/desktop-recording/settings',{enabled:true},'fixture-t','PUT');
  if(mode==='platform') for(const actor of ['t','p']){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/rtc?_auth=fixture-${actor}`);sockets.push(ws);await once(ws,'open');
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RTC join timed out')),4000);ws.on('message',raw=>{const v=JSON.parse(String(raw));if(v.type==='joined'){clearTimeout(timer);resolve();}});ws.send(JSON.stringify({type:'join',roomId:'rtc:t:p'}));});
  }
  else await req('/telemost/activate',{studentId:'p'});
  const first=await req('/desktop-recording/start',{studentId:'p',audioMode:mode});
  assert.equal(first.occurrence.time,'19:00');
  await req(`/desktop-recorder/jobs/${first.id}`,{status:'recording'},token);
  if(finishEarly) await req('/desktop-recording/stop',{id:first.id,endRecording:true});
  if(disconnect) { sockets.forEach(ws=>ws.close()); await delay(100); }
  fs.writeFileSync(clock,String(start+3600000));
  // The device poll must switch the scheduled lesson even while the browser
  // remains in the same call. No stop/start, new tab or teacher heartbeat.
  let polled=await req('/desktop-recorder/poll',{ready:true},token);
  if(finishEarly || disconnect) {
    assert.equal(polled.currentLesson,undefined,'An explicit stop or absent call must not start the next lesson');
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(data,'desktop-recordings.json'))).jobs).length,1);
    return;
  }
  assert.equal(polled.currentLesson?.occurrence.time,'20:00','The pult must discover the second lesson at the exact boundary');
  const second=polled.currentLesson; assert.notEqual(second.id,first.id);
  assert.equal(polled.jobs.find(j=>j.id===first.id).desired,'stop');
  assert.equal((await req('/desktop-recording/start',{studentId:'p',audioMode:mode})).id,second.id,'Browser heartbeat must agree with the recorder');
  await req(`/desktop-recorder/jobs/${first.id}`,{status:'saved'},token);
  await req(`/desktop-recorder/jobs/${second.id}`,{status:'recording'},token);
  fs.writeFileSync(clock,String(start+90*60000));
  polled=await req('/desktop-recorder/poll',{ready:true},token);
  assert.equal(polled.currentLesson?.id,second.id,'Telemost must not expire 15 minutes after the first lesson');
  assert.equal((await req('/desktop-recording/start',{studentId:'p',audioMode:mode})).id,second.id);
  fs.writeFileSync(clock,String(start+120*60000));
  polled=await req('/desktop-recorder/poll',{ready:true},token);
  assert.equal(polled.currentLesson,undefined,'An ongoing call cannot invent an unscheduled third recording');
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(data,'desktop-recordings.json'))).jobs).length,2);
});
}

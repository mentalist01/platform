import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('complete payment history is private, read-only and survives new receipts beyond 500 entries', {timeout:60000}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'payment-history-')),data=path.join(root,'data');fs.mkdirSync(data);
  const write=(name,value)=>fs.writeFileSync(path.join(data,`${name}.json`),JSON.stringify(value));
  write('teachers',[{id:'owner',name:'Первый',code:'191901'},{id:'other',name:'Второй',code:'191902'}]);
  write('students',[{id:'s1',teacherId:'owner',name:'Дима',code:'191903'}]);
  const rows=Array.from({length:640},(_,i)=>({id:`saved-${i}`,teacherId:'owner',receiverTeacherId:'owner',studentId:'s1',studentName:'Дима',senderName:'Иван П',amount:1,status:'applied',markKeys:[`m${i}`],receivedAt:new Date(Date.UTC(2024,0,1,0,i)).toISOString(),createdAt:new Date(Date.UTC(2024,0,1,0,i)).toISOString()}));
  write('payment-notifications',{items:[...rows,{...rows[0],id:'other-receipt',teacherId:'other',receiverTeacherId:'other'}, {...rows[0],id:'platform-receipt',paymentTarget:'teacher-platform'}, {...rows[0],id:'unassigned',teacherId:'',receiverTeacherId:''}]});
  write('teacher-finances',{});write('teacher-calendar-marks',{});
  const snapshot=()=>['payment-notifications','teacher-finances','teacher-calendar-marks'].map(name=>fs.readFileSync(path.join(data,`${name}.json`),'utf8')).join('\n');
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const base=`http://127.0.0.1:${port}`;let child,logs='';
  const request=async(route,token,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};};
  try {
    child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',MACRODROID_PAYMENT_SECRET:'fixture-history-secret',PAYMENT_NOTIFICATION_TEACHER_ID:'owner'}});
    child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d});
    const until=Date.now()+20000;while(Date.now()<until){try{if((await fetch(base+'/api/availability')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(child.exitCode,null,logs);
    const owner=(await request('/api/login','',{code:'191901'})).body.token,other=(await request('/api/login','',{code:'191902'})).body.token,student=(await request('/api/login','',{code:'191903'})).body.token;
    const before=snapshot();const history=await request('/api/payment-notifications',owner);
    assert.equal(history.status,200);assert.ok(history.cache.includes('no-store'));assert.equal(history.body.notifications.length,640);assert.equal(history.body.history.total,640);
    assert.ok(history.body.notifications.some(row=>row.id==='saved-0'));assert.ok(history.body.notifications.every(row=>row.receiverTeacherId==='owner'&&row.paymentTarget==='student'));
    assert.equal((await request('/api/payment-notifications',other)).body.notifications.length,1);
    assert.equal((await request('/api/payment-notifications?teacherId=other',owner)).body.notifications.length,640);
    assert.equal((await request('/api/payment-notifications',student)).status,403);assert.equal((await request('/api/payment-notifications')).status,401);assert.equal(snapshot(),before);
    const ignored=await request('/api/payment-notifications/tbank','',{secret:'fixture-history-secret',id:'new-ignored',title:'Т-Банк',text:'Списание 100 ₽',receivedAt:'2026-10-06T10:00:00Z'});
    assert.equal(ignored.status,202);assert.equal(ignored.body.notification.status,'ignored');
    const persisted=JSON.parse(fs.readFileSync(path.join(data,'payment-notifications.json'))).items;
    assert.equal(persisted.length,644);assert.ok(persisted.some(row=>row.id==='saved-0'));assert.equal((await request('/api/payment-notifications',owner)).body.notifications.length,641);
  } finally {
    if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('payment-history-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
});

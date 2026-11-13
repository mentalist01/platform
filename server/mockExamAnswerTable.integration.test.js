import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {getMonthlyMockMonth} from '../src/utils/monthlyMockExam.js';

test('mock №25 checks ordered pairs with blank excess rows and preserves them on reopen', {timeout: 45000}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-answer-table-'));
  const data = path.join(root, 'data');
  fs.mkdirSync(data);
  const write = (file, value) => fs.writeFileSync(path.join(data, file), JSON.stringify(value));
  const salt = Buffer.from('answer-table-test').toString('base64');
  const hash = crypto.scryptSync('teacher-test', salt, 64).toString('base64');
  const now = new Date().toISOString();
  write('teachers.json', [{id:'teacher', name:'Teacher', codeHash:`scrypt$${salt}$${hash}`, createdAt:now}]);
  write('students.json', [{id:'student', name:'Student', teacherId:'teacher', code:'student-test', grade:'11', createdAt:now}]);
  write('tests.json', {});
  write('progress.json', {student:{homeworks:[{id:'hw', issuedAt:now, goals:[{type:'mock', mockExamId:'table', mode:'classic'}]}]}});
  const correct = ['600001','437','600002','47','600003','1227','600005','217','600012','16667'];
  write('mock-exams.json', [{id:'table', teacherId:'teacher', title:'Pairs', createdAt:now,
    access:{all:true, students:[], mode:'classic'}, monthlyAssignments:{teacher:[getMonthlyMockMonth()]}, tasks:{25:{question:'Find five pairs', answerTable:{rows:12, columns:2}, answerCountOverride:24, answers:correct}}}]);
  const port = await new Promise(resolve => {
    const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n));});
  });
  const url=`http://127.0.0.1:${port}`;
  let logs='';
  const child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(), env:{...process.env, PORT:String(port), NODE_ENV:'test',
    PLATFORM_DATA_DIR:data, PLATFORM_UPLOADS_DIR:path.join(root,'uploads'), PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'), COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  try {
    let ready=false;
    for(let i=0;i<250;i++) {
      if(child.exitCode!==null)throw Error(logs);
      try{if((await fetch(url+'/api/client-build-version')).ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,logs);
    const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'student-test'})});
    assert.equal(login.status,200,await login.clone().text());
    const {token}=await login.json();
    const request=(route,method='GET',body)=>fetch(url+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const save=async values=>{
      const response=await request('/api/mock-exams/attempt','PUT',{examId:'table',mode:'classic',answers:{25:values}});
      assert.equal(response.status,200,await response.clone().text());return response.json();
    };
    const values=[...correct,...Array(14).fill('')];
    const wrong=[...values];[wrong[1],wrong[3]]=[wrong[3],wrong[1]];
    assert.equal((await save(wrong)).solved['25'],false,'The divisor must remain paired with its number');
    const missing=[...values];missing[3]='';
    assert.equal((await save(missing)).solved['25'],false,'An incomplete required row is wrong');
    const extra=[...values];extra[10]='0';
    assert.equal((await save(extra)).solved['25'],false,'An extra value is not ignored');
    const good=await save(values);
    assert.equal(good.solved['25'],true,'Unused rows stay empty without invalidating the five pairs');
    assert.deepEqual(good.answers['25'],values);
    const persisted=JSON.parse(fs.readFileSync(path.join(data,'progress.json'),'utf8')).student.mockAttempts.table;
    assert.deepEqual(persisted.answers['25'],values);
    assert.equal(persisted.solved['25'],true);
  } finally {
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
    await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))]);
    if(child.exitCode===null)child.kill('SIGKILL');
    // The temporary fixture contains no user data and is confined to this test's directory.
    if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(root,{recursive:true,force:true});
  }
});

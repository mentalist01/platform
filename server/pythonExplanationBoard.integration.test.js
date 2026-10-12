import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { pythonExplanationBoardRoom, PYTHON_EXPLANATION_CONTROL } from '../src/utils/pythonExplanationBoard.js';
import { createLearningGroup, addLearningGroupMember, startLearningGroup } from './learningGroups.js';

const serving = process.env.PYTHON_BOARD_QA_SERVE === '1';
test('Python explanations synchronize, isolate group pupils and survive a server restart', { timeout: serving ? 3600_000 : 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-python-board-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, name+'.json'), JSON.stringify(value));
  const teacher = { id: 'teacher-a', name: 'Тестовый учитель', code: 'python-board-teacher' };
  const students = [{ id: 'student-a', name: 'Тестовый ученик', teacherId: teacher.id, code: 'python-board-pupil', grade: '11' },
    { id: 'student-b', name: 'Другой ученик', teacherId: teacher.id, code: 'python-board-other', grade: '11' }];
  write('teachers', [teacher, { id: 'teacher-b', name: 'Другой учитель', code: 'python-board-outsider' }]);
  write('students', students); write('progress', {}); write('tests', { 205: { python: [
    { id: 'python-board-first', title: 'Повторить сообщение', prompt: 'Введите строку и число N. Выведите строку N раз с помощью цикла for.', starterCode: 's = input()\nn = int(input())\nfor i in range(n):\n    print(s)', tests: [{ input: 'Привет\n3', output: 'Привет\nПривет\nПривет' }] },
    { id: 'python-board-second', title: 'Чётные числа', prompt: 'Выведите чётные числа от 2 до 10.', starterCode: 'for i in range(2, 11, 2):\n    print(i)', tests: [{ input: '', output: '2\n4\n6\n8\n10' }] }
  ] } });
  const now = new Date().toISOString();
  let group = createLearningGroup({ name: 'Тестовая мини-группа', maxStudents: 2 }, { id: 'group-a', teacherId: teacher.id, now });
  for (const student of students) group = addLearningGroupMember(group, student, { actorId: teacher.id, now });
  group = startLearningGroup(group, { now });
  write('learning-groups', [group]);
  write('learning-lesson-sessions', []);
  const port = await new Promise(resolve => { const p = net.createServer(); p.listen(serving ? 55873 : 0, '127.0.0.1', () => { const n=p.address().port; p.close(()=>resolve(n)); }); });
  const base = `http://127.0.0.1:${port}`, room=pythonExplanationBoardRoom(teacher.id,students[0].id), connections=[];
  let child, logs='';
  const wait = async condition => { for(let i=0;i<400;i++){if(await condition())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+logs.slice(-1200)); };
  const start = async () => {
    child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),
      env:{...process.env,PORT:String(port),NODE_ENV:'test',PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_COLLAB_DIR:path.join(root,'collab'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),
        COLLAB_PERSISTENCE:'0',BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS:'250',DISABLE_STARTUP_XP_REBALANCE:'1',LEGACY_LESSON_RECORDING_ENABLED:'0',LEARNING_GROUPS_ENABLED:'1',
        CORS_ALLOWED_ORIGINS:'http://127.0.0.1:5591,http://localhost:5591'},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
    await wait(async()=>{assert.equal(child.exitCode,null,logs);try{return(await fetch(base+'/api/availability')).ok;}catch{return false;}});
  };
  const stop = async()=>{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}};
  const login = async code=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v.token;};
  const connect = async(token,name=room)=>{const doc=new Y.Doc(),provider=new WebsocketProvider(base.replace('http','ws')+'/collab',name,doc,{WebSocketPolyfill:WebSocket,params:{_auth:token},disableBc:true});connections.push({doc,provider});await wait(()=>provider.synced);return doc;};
  const close=()=>{for(const {doc,provider}of connections.splice(0)){provider.destroy();doc.destroy();}};
  const denied = async(token,name=room)=>assert.rejects(new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/collab/'+encodeURIComponent(name)+(token?'?_auth='+token:''));ws.once('error',reject);ws.once('open',()=>{ws.close();resolve();});}),/401|403/);
  try {
    await start();
    const t=await login(teacher.code),p=await login(students[0].code),other=await login(students[1].code),wrong=await login('python-board-outsider');
    const seeded=await fetch(base+'/api/tests',{method:'PUT',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:fs.readFileSync(path.join(data,'tests.json'),'utf8')});
    assert.equal(seeded.status,200);
    await denied(other);await denied(wrong);await denied('');await denied(p,'board-teacher-a-student-a');
    const td=await connect(t),pd=await connect(p);
    td.getArray('items').push([{id:'teacher-stroke',type:'stroke',points:[{x:20,y:20},{x:180,y:120}],color:'#7c3aed',width:5}]);
    await wait(()=>pd.getArray('items').length===1);
    pd.getArray('items').push([{id:'pupil-stroke',type:'stroke',points:[{x:30,y:50},{x:90,y:100}],color:'#16a34a',width:3}]);
    await wait(()=>td.getArray('items').length===2);
    const tb=await connect(t,room+'~pages'),pb=await connect(p,room+'~pages');
    const command={id:'teacher-command',open:true,teacherId:teacher.id,studentId:students[0].id};
    tb.getMap('pageControl').set(PYTHON_EXPLANATION_CONTROL,command);
    await wait(()=>pb.getMap('pageControl').get(PYTHON_EXPLANATION_CONTROL)?.id===command.id);
    pb.getMap('pageControl').set(PYTHON_EXPLANATION_CONTROL,{...command,id:'forged-pupil-command',open:false});
    await new Promise(r=>setTimeout(r,300));
    assert.equal(tb.getMap('pageControl').get(PYTHON_EXPLANATION_CONTROL).id,command.id,'Pupil cannot summon another participant');
    close();await new Promise(r=>setTimeout(r,350));await stop();await start();
    const restored=await connect(await login(teacher.code));
    assert.deepEqual(restored.getArray('items').toArray().map(x=>x.id),['teacher-stroke','pupil-stroke']);
    close();
    if(serving){console.log('PYTHON_BOARD_QA '+JSON.stringify({base,root}));await new Promise(resolve=>process.once('SIGINT',resolve));}
  } finally {
    close();await stop();
    if(!serving){const checked=fs.realpathSync(root);assert.ok(checked.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(checked).startsWith('ivan-python-board-'));fs.rmSync(checked,{recursive:true,force:true});}
  }
});

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
import { PYTHON_EXPLANATION_CONTROL } from '../src/utils/pythonExplanationBoard.js';
import {pythonGroupBoardRoom,pythonGroupCodeBase} from '../src/utils/pythonGroupWorkspace.js';
import { createLearningGroup, addLearningGroupMember, startLearningGroup, createLearningLessonSession } from './learningGroups.js';

const serving = process.env.PYTHON_GROUP_QA_SERVE === '1';
test('Group Python shares code and images only with enrolled pupils, protects controls and persists', { timeout: serving ? 3600_000 : 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivan-python-group-'));
  const data = path.join(root, 'data'); fs.mkdirSync(data);
  const write = (name, value) => fs.writeFileSync(path.join(data, name+'.json'), JSON.stringify(value));
  const teacher = { id: 'teacher-a', name: 'Тестовый учитель', code: 'python-board-teacher' };
  const students = [{ id: 'student-a', name: 'Тестовый ученик', teacherId: teacher.id, code: 'python-board-pupil', grade: '11' },
    { id: 'student-b', name: 'Другой ученик', teacherId: teacher.id, code: 'python-board-other', grade: '11' }];
  write('teachers', [teacher, { id: 'teacher-b', name: 'Другой учитель', code: 'python-board-outsider' }]);
  write('students', [...students,{id:'outsider-student',teacherId:teacher.id,name:'Посторонний ученик',code:'group-python-outsider',grade:'11'}]); write('progress', {}); write('tests', { 205: { python: [
    { id: 'python-board-first', title: 'Повторить сообщение', prompt: 'Введите строку и число N. Выведите строку N раз с помощью цикла for.', starterCode: 's = input()\nn = int(input())\nfor i in range(n):\n    print(s)', tests: [{ input: 'Привет\n3', output: 'Привет\nПривет\nПривет' }] },
    { id: 'python-board-second', title: 'Чётные числа', prompt: 'Выведите чётные числа от 2 до 10.', starterCode: 'for i in range(2, 11, 2):\n    print(i)', tests: [{ input: '', output: '2\n4\n6\n8\n10' }] }
  ] } });
  const now = new Date().toISOString();
  let group = createLearningGroup({ name: 'Тестовая мини-группа', maxStudents: 2 }, { id: 'group-a', teacherId: teacher.id, now });
  for (const student of students) group = addLearningGroupMember(group, student, { actorId: teacher.id, now });
  group = startLearningGroup(group, { now });
  write('learning-groups', [group]);
  const lesson=createLearningLessonSession(group,{startAt:new Date().toISOString(),durationMinutes:120},{id:'group-python-lesson'});lesson.status='active';write('learning-lesson-sessions',[lesson]);
  const port = await new Promise(resolve => { const p = net.createServer(); p.listen(serving ? 55877 : 0, '127.0.0.1', () => { const n=p.address().port; p.close(()=>resolve(n)); }); });
  const base = `http://127.0.0.1:${port}`, room=pythonGroupBoardRoom(group.id), connections=[];
  let child, logs='';
  const wait = async condition => { for(let i=0;i<400;i++){if(await condition())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+logs.slice(-1200)); };
  const start = async () => {
    child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),
      env:{...process.env,PORT:String(port),NODE_ENV:'test',PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_COLLAB_DIR:path.join(root,'collab'),PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),
        COLLAB_PERSISTENCE:'1',BOARD_COLLAB_SNAPSHOT_WRITE_DEBOUNCE_MS:'250',DISABLE_STARTUP_XP_REBALANCE:'1',LEGACY_LESSON_RECORDING_ENABLED:'0',LEARNING_GROUPS_ENABLED:'1',
        CORS_ALLOWED_ORIGINS:'http://127.0.0.1:5598,http://localhost:5598'},stdio:['ignore','pipe','pipe']});
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
    const t=await login(teacher.code),p=await login(students[0].code),other=await login(students[1].code),wrong=await login('python-board-outsider'),outsider=await login('group-python-outsider');
    const seeded=await fetch(base+'/api/tests',{method:'PUT',headers:{authorization:'Bearer '+t,'content-type':'application/json'},body:fs.readFileSync(path.join(data,'tests.json'),'utf8')});
    assert.equal(seeded.status,200);
    await denied(outsider);await denied(wrong);await denied('');await denied(p,'board-teacher-a-student-a');
    const td=await connect(t),pd=await connect(p);
    const codeRoom=`py-collab:${pythonGroupCodeBase(group.id)}:205:python:python-board-first`;
    await denied(outsider,codeRoom);await denied(wrong,codeRoom);
    const tc=await connect(t,codeRoom),pc=await connect(p,codeRoom),oc=await connect(other,codeRoom);
    tc.getText('monaco').insert(0,'print(42)');await wait(()=>pc.getText('monaco').toString()==='print(42)');
    oc.getText('monaco').insert(9,'\n# second pupil');await wait(()=>tc.getText('monaco').toString().includes('second pupil'));
    assert.equal(fs.readFileSync(path.join(data,'progress.json'),'utf8'),'{}','Shared code changes do not award progress');
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2kAAAAABJRU5ErkJggg==','base64');
    const form=new FormData();form.append('roomId',room);form.append('file',new Blob([image],{type:'image/png'}),'group.png');
    const upload=await fetch(base+'/api/board-assets',{method:'POST',headers:{authorization:'Bearer '+t},body:form});assert.equal(upload.status,201,await upload.clone().text());const asset=await upload.json();
    for(const token of[p,other])assert.equal((await fetch(base+asset.url,{headers:{authorization:'Bearer '+token}})).status,200);
    assert.equal((await fetch(base+asset.url,{headers:{authorization:'Bearer '+outsider}})).status,404);

    td.getArray('items').push([{id:'teacher-stroke',type:'stroke',points:[{x:20,y:20},{x:180,y:120}],color:'#7c3aed',width:5}]);
    await wait(()=>pd.getArray('items').length===1);
    pd.getArray('items').push([{id:'pupil-stroke',type:'stroke',points:[{x:30,y:50},{x:90,y:100}],color:'#16a34a',width:3}]);
    await wait(()=>td.getArray('items').length===2);
    const tb=await connect(t,room+'~pages'),pb=await connect(p,room+'~pages');
    const command={id:'teacher-command',open:true,teacherId:teacher.id,groupId:group.id};
    tb.getMap('pageControl').set(PYTHON_EXPLANATION_CONTROL,command);
    await wait(()=>pb.getMap('pageControl').get(PYTHON_EXPLANATION_CONTROL)?.id===command.id);
    pb.getMap('pageControl').set(PYTHON_EXPLANATION_CONTROL,{...command,id:'forged-pupil-command',open:false});
    await new Promise(r=>setTimeout(r,300));
    assert.equal(tb.getMap('pageControl').get(PYTHON_EXPLANATION_CONTROL).id,command.id,'Pupil cannot summon another participant');
    close();await new Promise(r=>setTimeout(r,500));await stop();await start();
    const restored=await connect(await login(teacher.code));
    assert.deepEqual(restored.getArray('items').toArray().map(x=>x.id),['teacher-stroke','pupil-stroke']);
    const restoredCode=await connect(await login(teacher.code),codeRoom);assert.equal(restoredCode.getText('monaco').toString(),'print(42)\n# second pupil');
    close();
    if(serving){console.log('PYTHON_GROUP_QA '+JSON.stringify({base,root}));await new Promise(resolve=>process.once('SIGINT',resolve));}
  } finally {
    close();await stop();
    if(!serving){const checked=fs.realpathSync(root);assert.ok(checked.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(checked).startsWith('ivan-python-group-'));fs.rmSync(checked,{recursive:true,force:true});}
  }
});

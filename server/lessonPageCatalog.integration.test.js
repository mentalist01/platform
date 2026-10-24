import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {LeveldbPersistence} from 'y-leveldb';
import * as Y from 'yjs';
import WebSocket from 'ws';
import {WebsocketProvider} from 'y-websocket';
import {createLearningGroup,addLearningGroupMember,startLearningGroup,createLearningLessonSession} from './learningGroups.js';
import {COLLAB_CODE_PAGES_KEY,createCollabCodePage,getCollabSolutionChannels,listCollabCodePages} from '../src/utils/collabSolutions.js';


test('one lesson catalog links all board/code rooms, isolates private code and survives restart',{timeout:process.env.LESSON_PAGES_QA_SERVE==='1'?3600_000:60_000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-lesson-pages-')),data=path.join(root,'data'),collab=path.join(root,'collab');fs.mkdirSync(data);fs.mkdirSync(collab);
  const write=(name,value)=>fs.writeFileSync(path.join(data,name+'.json'),JSON.stringify(value));
  const students=[{id:'a',teacherId:'t',name:'Первый ученик',code:'qa-page-a',grade:'11'},{id:'b',teacherId:'t',name:'Второй ученик',code:'qa-page-b',grade:'11'},{id:'c',teacherId:'t',name:'Индивидуальный ученик',code:'qa-page-individual',grade:'11'}];
  write('teachers',[{id:'t',name:'Тестовый учитель',code:'qa-page-teacher'},{id:'other',name:'Другой учитель',code:'qa-page-other'}]);write('students',students);write('progress',{});write('tests',{});
  let group=createLearningGroup({name:'Тестовая группа',maxStudents:2},{id:'g',teacherId:'t'});for(const student of students.slice(0,2))group=addLearningGroupMember(group,student,{actorId:'t'});group=startLearningGroup(group);
  const lesson=createLearningLessonSession(group,{startAt:new Date().toISOString(),durationMinutes:120},{id:'lesson-x'});lesson.status='active';write('learning-groups',[group]);write('learning-lesson-sessions',[lesson]);
  const snapshots=path.join(collab,'board-snapshots');fs.mkdirSync(snapshots);
  const snapshot=(room,doc)=>{const filename=room.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80)+'-'+crypto.createHash('sha1').update(room).digest('hex').slice(0,12)+'.bin';fs.writeFileSync(path.join(snapshots,filename),Y.encodeStateAsUpdate(doc));};
  for(const room of ['board-t-c~pages','board-lesson-lesson-x~pages']){const book=new Y.Doc();book.getMap('pages').set('board-page-2',{title:'Задание 8',createdAt:2});snapshot(room,book);book.destroy();}
  const canvas=new Y.Doc();canvas.getArray('items').push([{id:'old-explanation',type:'text',text:'Старая схема',x:150,y:150,fontSize:28,color:'#7c3aed',width:260,height:80}]);snapshot('board-t-c~page~board-page-2',canvas);canvas.destroy();
  const seed=new LeveldbPersistence(collab);
  for(const [room,id,text] of [['collab-t-c','old-individual','print(8)'],['collab-lesson-lesson-x~student~a','old-a-page','print("a")'],['collab-lesson-lesson-x~student~b','old-b-page','print("b")']]) {
    const doc=new Y.Doc(),page=createCollabCodePage(doc,{id,name:'Задание 8'});const channels=getCollabSolutionChannels(doc,page.mainSolutionId);channels.codeText.insert(0,text);channels.testFileText.insert(0,'saved input');channels.runMap.set('output','saved output');await seed.storeUpdate('collab/'+room,Y.encodeStateAsUpdate(doc));doc.destroy();
  }await seed.destroy();
  const port=await new Promise(resolve=>{const probe=net.createServer();probe.listen(process.env.LESSON_PAGES_QA_SERVE==='1'?55876:0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});});
  const base='http://127.0.0.1:'+port,connections=[];let child,logs='';
  const wait=async condition=>{for(let n=0;n<400;n++){if(await condition())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+logs.slice(-1800));};
  const start=async()=>{child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,PORT:String(port),NODE_ENV:'test',PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_COLLAB_DIR:collab,PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'1',LEARNING_GROUPS_ENABLED:'1',LEGACY_LESSON_RECORDING_ENABLED:'0',DISABLE_STARTUP_XP_REBALANCE:'1',...(process.env.LESSON_PAGES_QA_SERVE==='1'?{CORS_ALLOWED_ORIGINS:'http://127.0.0.1:5597,http://localhost:5597'}:{})},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);await wait(async()=>{try{return(await fetch(base+'/api/availability')).ok;}catch{return false;}});};
  const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}};
  const request=async(token,room,input,status=200)=>{const r=await fetch(base+'/api/lesson-pages'+(input?'':'?room='+encodeURIComponent(room)),{method:input?'POST':'GET',headers:{authorization:'Bearer '+token,...(input?{'content-type':'application/json'}:{})},...(input?{body:JSON.stringify({...input,room})}:{})});assert.equal(r.status,status,(await r.clone().text())+logs.slice(-1600));return r.json();};
  const login=async code=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const session=await r.json();assert.equal(r.status,200,session.error);if(code==='qa-page-teacher'){assert.equal(session.role,'teacher');assert.equal(session.id,'t');}return session.token;};
  const connect=async(room,token)=>{const doc=new Y.Doc(),provider=new WebsocketProvider(base.replace('http','ws')+'/collab',room,doc,{WebSocketPolyfill:WebSocket,params:{_auth:token},disableBc:true});connections.push({doc,provider});await wait(()=>provider.synced);return doc;};
  const close=()=>{for(const {doc,provider} of connections.splice(0)){provider.destroy();doc.destroy();}};
  try {
    await start();const teacher=await login('qa-page-teacher'),pupil=await login('qa-page-a'),other=await login('qa-page-other'),individualPupil=await login('qa-page-individual');
    const individual=await request(teacher,'collab-t-c');assert.deepEqual(individual.pages.map(p=>p.id),['main','board-page-2']);
    await request(other,'collab-t-c',undefined,403);await request(individualPupil,'collab-t-c',{action:'create',name:'Denied'},403);
    const personal=await connect('collab-t-c',teacher);assert.equal(listCollabCodePages(personal)[1].mainSolutionId,'page-old-individual');
    assert.equal(getCollabSolutionChannels(personal,'page-old-individual').codeText.toString(),'print(8)');
    const board=await connect('board-t-c~pages',teacher),drawing=await connect('board-t-c~page~board-page-2',individualPupil);assert.equal(drawing.getArray('items').get(0).id,'old-explanation');
    const created=await request(teacher,'collab-t-c',{action:'create',name:'Новая общая'});await wait(()=>board.getMap('pages').has(created.id)&&listCollabCodePages(personal).some(p=>p.id===created.id));
    await request(teacher,'board-t-c~pages',{action:'rename',id:created.id,name:'Переименована'});await wait(()=>listCollabCodePages(personal).some(p=>p.name==='Переименована'));
    await request(teacher,'collab-t-c',{action:'delete',id:created.id});await wait(()=>listCollabCodePages(personal).length===2);
    await request(teacher,'board-t-c~pages',{action:'restore',id:created.id});await wait(()=>listCollabCodePages(personal).length===3);
    const parts=[];
    for(let i=1;i<=8;i++)parts.push(await request(teacher,'board-t-c~pages',{action:'create',name:`26 · Часть ${i}`,parentId:created.id}));
    await request(teacher,'board-t-c~pages',{action:'update',id:'board-page-2',name:'Прежняя часть',parentId:created.id});
    await wait(()=>listCollabCodePages(personal).length===11);
    assert.equal((await request(teacher,'collab-t-c')).pages.filter(page=>page.parentId===created.id).length,9);
    assert.equal(personal.getMap(COLLAB_CODE_PAGES_KEY).get('board-page-2').parentId,created.id,'Code and board share the same parent');
    assert.equal(getCollabSolutionChannels(personal,'page-old-individual').codeText.toString(),'print(8)');
    assert.equal(drawing.getArray('items').get(0).text,'Старая схема');
    await request(teacher,'board-t-c~pages',{action:'update',id:created.id,name:'Cycle',parentId:parts[0].id},400);
    await request(teacher,'board-t-c~pages',{action:'create',name:'Too deep',parentId:parts[0].id},400);
    await request(individualPupil,'board-t-c~pages',{action:'update',id:parts[0].id,name:'Denied',parentId:''},403);
    await request(teacher,'board-t-c~pages',{action:'delete',id:created.id});
    const withoutParent=await request(teacher,'board-t-c~pages');assert.equal(withoutParent.pages.length,10);assert.ok(withoutParent.pages.some(page=>page.id===parts[0].id&&!page.parentId),'Removing a parent preserves its child pages');
    await request(teacher,'board-t-c~pages',{action:'restore',id:created.id});
    const shared=await request(teacher,'collab-lesson-lesson-x');assert.deepEqual(shared.pages.map(p=>p.id),['main','board-page-2']);
    const a=await connect('collab-lesson-lesson-x~student~a',pupil),b=await connect('collab-lesson-lesson-x~student~b',teacher);
    assert.equal(getCollabSolutionChannels(a,listCollabCodePages(a)[1].mainSolutionId).codeText.toString(),'print("a")');
    assert.equal(getCollabSolutionChannels(b,listCollabCodePages(b)[1].mainSolutionId).codeText.toString(),'print("b")');
    assert.equal(a.getText('solution:page-old-b-page:code').toString(),'','Other pupil content is not copied');
    await request(pupil,'collab-lesson-lesson-x~student~b',undefined,403);await request(pupil,'collab-lesson-lesson-x~student~a',{action:'delete',id:'board-page-2'},403);
    const groupNew=await request(teacher,'board-lesson-lesson-x~pages',{action:'create',name:'Всем ученикам'});await wait(()=>[a,b].every(doc=>listCollabCodePages(doc).some(p=>p.id===groupNew.id)));
    close();await new Promise(r=>setTimeout(r,100));await stop();await start();
    const restored=await connect('collab-t-c',await login('qa-page-teacher'));assert.equal(listCollabCodePages(restored).length,11);assert.equal(getCollabSolutionChannels(restored,'page-old-individual').testFileText.toString(),'saved input');assert.equal(getCollabSolutionChannels(restored,'page-old-individual').runMap.get('output'),'saved output');
    assert.equal((await request(await login('qa-page-teacher'),'collab-t-c')).pages.find(page=>page.id===parts[7].id).parentId,created.id,'Eight parts survive restart');
    assert.equal((await request(await login('qa-page-teacher'),'collab-lesson-lesson-x')).pages.length,3);
    if(process.env.LESSON_PAGES_QA_SERVE==='1'){close();console.log('LESSON_PAGES_QA '+JSON.stringify({base,root}));await new Promise(resolve=>process.once('SIGINT',resolve));}
  }finally{close();await stop();if(process.env.LESSON_PAGES_QA_SERVE!=='1')fs.rmSync(root,{recursive:true,force:true});}
});

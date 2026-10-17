import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import net from 'node:net';import crypto from 'node:crypto';import{spawn}from'node:child_process';import{LeveldbPersistence}from'y-leveldb';import*as Y from'yjs';import WebSocket from'ws';import{WebsocketProvider}from'y-websocket';
import{createLearningGroup,addLearningGroupMember,startLearningGroup,createLearningLessonSession}from'./learningGroups.js';
import{getCollabSolutionChannels,listCollabCodePages}from'../src/utils/collabSolutions.js';

test('group pages and private code survive finishing, new lesson, reconnect and full server restart',{timeout:process.env.GROUP_NOTEBOOK_QA_SERVE==='1'?3600_000:60000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-group-notebook-')),data=path.join(root,'data'),collab=path.join(root,'collab');fs.mkdirSync(data);fs.mkdirSync(collab);
 const write=(n,v)=>fs.writeFileSync(path.join(data,n+'.json'),JSON.stringify(v));
 const students=['a','b','c'].map(id=>({id,teacherId:'t',name:id,code:'qa-notebook-'+id,grade:'11'}));
 write('teachers',[{id:'t',name:'Учитель',code:'qa-notebook-teacher'},{id:'other',name:'Другой',code:'qa-notebook-other'}]);write('students',students);write('progress',{});write('tests',{});
 let group=createLearningGroup({name:'Группа 2',maxStudents:3},{id:'g',teacherId:'t'});for(const s of students.slice(0,2))group=addLearningGroupMember(group,s,{actorId:'t'});group=startLearningGroup(group);
 const old=createLearningLessonSession(group,{startAt:new Date(Date.now()-86400000).toISOString(),durationMinutes:60},{id:'old-lesson'});old.status='completed';
 const current=createLearningLessonSession(group,{startAt:new Date().toISOString(),durationMinutes:60},{id:'current-lesson'});current.status='active';write('learning-groups',[group]);write('learning-lesson-sessions',[old,current]);
 const dir=path.join(collab,'board-snapshots');fs.mkdirSync(dir);const name=room=>room.split('/').pop().replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80)+'-'+crypto.createHash('sha1').update(room).digest('hex').slice(0,12)+'.bin';
 const source=new Y.Doc();source.getArray('items').push([{id:'old-stroke',type:'text',text:'Решение прошлого урока',x:10,y:10}]);const sourceBytes=Buffer.from(Y.encodeStateAsUpdate(source));fs.writeFileSync(path.join(dir,name('board-lesson-old-lesson')),sourceBytes);
 const db=new LeveldbPersistence(collab);for(const owner of ['', '~student~a','~student~b']){const doc=new Y.Doc();getCollabSolutionChannels(doc,'main').codeText.insert(0,owner?'private '+owner:'print(42)');await db.storeUpdate('collab/collab-lesson-old-lesson'+owner,Y.encodeStateAsUpdate(doc));doc.destroy();}await db.destroy();
 const port=await new Promise(resolve=>{const probe=net.createServer().listen(process.env.GROUP_NOTEBOOK_QA_SERVE==='1'?53579:0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>resolve(p));});}),base='http://127.0.0.1:'+port;let child,logs='';const connections=[];
 const wait=async check=>{for(let n=0;n<400;n++){if(await check())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out '+logs.slice(-5500));};
 const start=async()=>{child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(import.meta.dirname,'..'),windowsHide:true,env:{...process.env,PORT:String(port),CORS_ALLOWED_ORIGINS:'http://127.0.0.1:5675',NODE_ENV:'test',PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:path.join(root,'uploads'),PLATFORM_COLLAB_DIR:collab,PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backups'),COLLAB_PERSISTENCE:'1',LEARNING_GROUPS_ENABLED:'1',LEGACY_LESSON_RECORDING_ENABLED:'0',DISABLE_STARTUP_XP_REBALANCE:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);await wait(async()=>{try{return(await fetch(base+'/api/availability')).ok;}catch{return false;}});};
 const stop=async()=>{if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}};
 const request=async(route,token,body,method=body?'POST':'GET',status=200)=>{const r=await fetch(base+route,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const t=await r.text();assert.equal(r.status,status,t+logs.slice(-500));return t?JSON.parse(t):null;};
 const pages=(token,input)=>request('/api/lesson-pages'+(input?'':'?room=board-group-g~pages'),token,input?{room:'board-group-g~pages',...input}:undefined);
 const login=async code=>(await request('/api/login','',{code:'qa-notebook-'+code})).token;
 const connect=async(room,token)=>{const doc=new Y.Doc(),provider=new WebsocketProvider(base.replace('http','ws')+'/collab',room,doc,{WebSocketPolyfill:WebSocket,params:{_auth:token},disableBc:true});connections.push({doc,provider});await wait(()=>provider.synced);return doc;};
 const close=()=>{for(const{doc,provider}of connections.splice(0)){provider.destroy();doc.destroy();}};
 try{
  await start();let teacher=await login('teacher'),a=await login('a'),b=await login('b');
  const initial=await pages(teacher);assert.equal(initial.canEdit,true);const restored=initial.pages.find(p=>p.title.startsWith('Страница 1 ·'));assert.ok(restored);
  const drawing=await connect('board-group-g~page~'+restored.id,teacher);assert.equal(drawing.getArray('items').get(0).id,'old-stroke');
  const shared=await connect('collab-group-g',teacher),personalA=await connect('collab-group-g~student~a',a),personalB=await connect('collab-group-g~student~b',b);
  const solution=doc=>getCollabSolutionChannels(doc,listCollabCodePages(doc).find(p=>p.id===restored.id).mainSolutionId);
  const readonlyShared=await connect('collab-group-g',a);readonlyShared.getText('monaco').insert(0,'forbidden shared change');
  const denied=await new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/collab/board-group-g~page~unknown-page?_auth='+encodeURIComponent(teacher));ws.once('unexpected-response',(_req,res)=>{res.resume();ws.terminate();resolve(res.statusCode);});ws.once('open',()=>{ws.close();reject(Error('Unknown page connected'));});ws.on('error',()=>{});});assert.equal(denied,403);
  assert.equal(solution(shared).codeText.toString(),'print(42)');assert.equal(solution(personalA).codeText.toString(),'private ~student~a');assert.equal(solution(personalB).codeText.toString(),'private ~student~b');
  await request('/api/lesson-pages?room=collab-group-g~student~b',a,undefined,'GET',403);await request('/api/lesson-pages?room=board-group-g~pages',await login('other'),undefined,'GET',403);
  await request('/api/lesson-pages?room=board-group-g~pages',await login('c'),undefined,'GET',403);
  await request('/api/learning-groups/g/lessons/current-lesson',teacher,{status:'completed'},'PATCH');
  await request('/api/learning-groups/g/lessons',teacher,{startAt:new Date(Date.now()+2*86400000).toISOString(),durationMinutes:60,topic:'Новый урок'},'POST',201);
  assert.equal((await pages(teacher)).canEdit,true);
  drawing.getArray('items').push([{id:'after-finish',type:'text',text:'Продолжение'}]);solution(personalA).codeText.insert(solution(personalA).codeText.length,'\nprint(99)');
  await wait(()=>fs.readdirSync(dir).some(n=>n.startsWith('board-group-g')));
  const newPage=await pages(teacher,{action:'create',name:'Следующее задание'});assert.ok((await pages(teacher)).pages.some(p=>p.id===newPage.id));
  const echo=await connect('board-group-g~page~'+restored.id,teacher);await wait(()=>echo.getArray('items').length===2);
  close();await wait(()=>{try{const d=new Y.Doc();Y.applyUpdate(d,fs.readFileSync(path.join(dir,name('board-group-g~page~'+restored.id))));return d.getArray('items').length===2;}catch{return false;}});await stop();await start();teacher=await login('teacher');a=await login('a');
  assert.equal((await pages(teacher)).pages.length,initial.pages.length+1);
  const again=await connect('board-group-g~page~'+restored.id,teacher),againA=await connect('collab-group-g~student~a',a);
  const againShared=await connect('collab-group-g',teacher);assert.equal(againShared.getText('monaco').toString(),'');
  assert.equal(again.getArray('items').length,2);assert.equal(solution(againA).codeText.toString(),'private ~student~a\nprint(99)');
  assert.deepEqual(fs.readFileSync(path.join(dir,name('board-lesson-old-lesson'))),sourceBytes,'original lesson snapshot unchanged');
  // Membership changes close an already authorized notebook connection.
  if(process.env.GROUP_NOTEBOOK_QA_SERVE!=='1'){await request('/api/learning-groups/g/members/a',teacher,undefined,'DELETE');await wait(()=>!connections.find(c=>c.doc===againA).provider.wsconnected);}
  if(process.env.GROUP_NOTEBOOK_QA_SERVE==='1'){console.log('GROUP_NOTEBOOK_QA '+JSON.stringify({base,root}));await new Promise(r=>process.once('SIGINT',r));}
 }finally{close();await stop();if(process.env.GROUP_NOTEBOOK_QA_SERVE!=='1')fs.rmSync(root,{recursive:true,force:true});}
});

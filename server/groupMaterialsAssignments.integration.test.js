import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('personal group homework unlocks only its recipients materials, including completed and ordinary personal homework', {timeout:60000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-personal-group-'));
  const data=path.join(root,'data'),uploads=path.join(root,'uploads');fs.mkdirSync(data);fs.mkdirSync(uploads);
  const seed=(name,value)=>fs.writeFileSync(path.join(data,name),JSON.stringify(value));
  const createdAt=new Date().toISOString();
  seed('teachers.json',[{id:'t',name:'Teacher',code:'110001',createdAt}]);
  seed('students.json',['a','b','c'].map((id,i)=>({id,teacherId:'t',name:id,code:String(110101+i),createdAt,deletedAt:null})));
  seed('tests.json',{});seed('mock-exams.json',[]);
  const baseMaterial={teacherId:'t',kind:'resource',scope:'teacher',createdAt,updatedAt:createdAt};
  seed('learning-materials.json',[
    {...baseMaterial,id:'file-video',title:'Video file',mimeType:'video/mp4',storageName:'fixture.mp4',originalName:'fixture.mp4'},
    {...baseMaterial,id:'direct-video',title:'Direct homework video',url:'https://rutube.ru/video/abcdef0123456789abcdef0123456789/'},
  ]);
  seed('progress.json',{a:{progress:{},homeworks:[{id:'personal',issuedAt:createdAt,homeWork:'Watch',materialIds:['direct-video'],completedAt:createdAt}]}});
  fs.writeFileSync(path.join(uploads,'fixture.mp4'),'test fixture');
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  let logs='';
  const child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),env:{...process.env,NODE_ENV:'test',PORT:String(port),PLATFORM_DATA_DIR:data,PLATFORM_UPLOADS_DIR:uploads,PLATFORM_JSON_BACKUPS_DIR:path.join(root,'backup'),COLLAB_PERSISTENCE:'0',DISABLE_STARTUP_XP_REBALANCE:'1',LEARNING_GROUPS_ENABLED:'1'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
  t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}fs.rmSync(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(`${base}/api/client-build-version`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const req=async(url,token='',body,method=body?'POST':'GET',status=200)=>{
    const r=await fetch(`${base}/api${url}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
    const d=await r.json();assert.equal(r.status,status,`${method} ${url}: ${JSON.stringify(d)} ${r.status>=500?logs:''}`);return d;
  };
  const [teacher,a,b,c]=await Promise.all(['110001','110101','110102','110103'].map(async code=>(await req('/login','',{code})).token));
  const group=(await req('/learning-groups',teacher,{name:'Personal assignments',studentIds:['a','b']},'POST',201)).group;
  const g=`/learning-groups/${group.id}`;
  const video=(await req(`${g}/materials`,teacher,{title:'Theory',kind:'resource',url:'https://rutube.ru/video/0123456789abcdef0123456789abcdef/'},'POST',201)).material;
  assert.ok((await req('/learning-materials',teacher)).materials.some(m=>m.id==='file-video'));
  assert.ok((await req('/learning-materials',teacher)).materials.some(m=>m.id===video.id));
  assert.ok(!(await req(`${g}/materials`,a)).materials.some(m=>m.id===video.id));
  assert.ok((await req(`${g}/materials`,a)).materials.some(m=>m.id==='direct-video'));
  assert.ok(!(await req(`${g}/materials`,b)).materials.some(m=>m.id==='direct-video'));
  await req(`${g}/assignments`,teacher,{title:'Invalid',recipientMode:'selected',recipientIds:['c']},'POST',400);
  await req(`${g}/assignments`,teacher,{title:'Invalid',recipientMode:'selected',recipientIds:[]},'POST',400);
  const draft=(await req(`${g}/assignments`,teacher,{title:'Personal',status:'draft',recipientMode:'selected',recipientIds:['a'],materialIds:[video.id,'file-video']},'POST',201)).assignment;
  assert.deepEqual(draft.recipientIds,['a']);
  assert.ok(!(await req(`${g}/materials`,a)).materials.some(m=>m.id===video.id));
  await req(`${g}/assignments/${draft.id}`,teacher,{status:'assigned'},'PATCH');
  const visible=(await req(`${g}/materials`,a)).materials;
  assert.ok(visible.some(m=>m.id===video.id));
  const file=visible.find(m=>m.id==='file-video');assert.ok(file?.downloadUrl);
  const download=token=>fetch(`${base}${file.downloadUrl}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await download(a)).status,200);
  assert.equal((await download(b)).status,404);
  assert.ok(!(await req(`${g}/materials`,b)).materials.some(m=>m.id===video.id));
  assert.ok(!(await req(`${g}/assignments`,b)).assignments.some(m=>m.id===draft.id));
  await req(`${g}/members`,teacher,{studentId:'c'});
  assert.ok(!(await req(`${g}/assignments`,c)).assignments.some(m=>m.id===draft.id));
  await req(`${g}/assignments/${draft.id}`,teacher,{status:'closed'},'PATCH');
  assert.ok((await req(`${g}/materials`,a)).materials.some(m=>m.id===video.id));
  await req(`${g}/assignments`,teacher,{title:'Everyone',recipientMode:'all',materialIds:[video.id]},'POST',201);
  assert.ok((await req(`${g}/materials`,b)).materials.some(m=>m.id===video.id));
});

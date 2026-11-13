import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {telegramIdentity,buildDirectory,matchDirectory,PlatformDirectory} from '../platform-directory.mjs';
import {createDirectoryServer} from '../directory-server.mjs';

const teacher='owner',at='2026-11-13T12:00:00.000Z',now=()=>Date.parse(at);
function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'reply-directory-'));t.after(()=>{assert.equal(path.dirname(d),path.resolve(os.tmpdir()));fs.rmSync(d,{recursive:true,force:true});});return d;}
const sources=()=>({students:[{id:'s1',name:'Мира',teacherId:teacher,code:'SECRET',balance:2000},{id:'s2',name:'Егор',teacherId:teacher},{id:'foreign',name:'Other',teacherId:'other'},{id:'deleted',teacherId:teacher,deletedAt:at}],groups:[{id:'g',name:'Группа 3',teacherId:teacher,status:'active',members:[{studentId:'s1',status:'active'},{studentId:'s2',status:'removed'}]},{id:'old',name:'Закончилась',teacherId:teacher,status:'completed',members:[{studentId:'s1',status:'active'}]}],studentContacts:[{teacherId:teacher,studentId:'s1',name:'Ученица',url:'https://t.me/Real_Student',notes:'PRIVATE_NOTE',contacts:[{value:'https://web.telegram.org/a/#123456'}]},{teacherId:'other',studentId:'s2',url:'https://t.me/another_wrong'},{teacherId:'other',studentId:'foreign',url:'https://t.me/foreign_student'},{teacherId:teacher,studentId:'deleted',url:'https://t.me/deleted_student'}],parentContacts:[{teacherId:teacher,studentId:'s1',name:'Мама',url:'https://t.me/shared_parent'},{teacherId:teacher,studentId:'s2',name:'Мама',url:'https://t.me/shared_parent'}]});
test('Telegram contact parsing accepts exact public usernames and private-chat ids only',()=>{
  assert.deepEqual(telegramIdentity('@Real_Student'),{username:'real_student'});
  assert.deepEqual(telegramIdentity('tg://user?id=123456'),{userId:123456});
  assert.deepEqual(telegramIdentity('https://web.telegram.org/k/#123456'),{userId:123456});
  for(const v of ['https://evil.test/?q=real_student','https://t.me/share','https://t.me/c/123/1','https://t.me/+79991234567','https://web.telegram.org/a/#-100123','https://wa.me/79991234567','Я @Real_Student'])assert.equal(telegramIdentity(v),null);
});
test('directory is owner-scoped, role-aware and contains no credentials, balances or notes',()=>{
 const d=buildDirectory(sources(),teacher,at),serialized=JSON.stringify(d);
 assert.equal(d.members.length,2);assert.doesNotMatch(serialized,/SECRET|PRIVATE_NOTE|balance|foreign_student|another_wrong|deleted_student|Закончилась/);
 const m=matchDirectory(d,{telegramUserId:123456,username:'unrelated'},teacher,now());assert.equal(m.status,'matched');assert.equal(m.matches[0].studentName,'Мира');assert.equal(m.matches[0].role,'student');assert.deepEqual(m.matches[0].groups,[{id:'g',name:'Группа 3'}]);
 assert.equal(matchDirectory(d,{username:'REAL_STUDENT'},teacher,now()).status,'matched');
 const parent=matchDirectory(d,{username:'shared_parent'},teacher,now());assert.equal(parent.status,'ambiguous');assert.equal(parent.matches.length,2);
 assert.equal(matchDirectory(d,{username:'foreign_student'},teacher,now()).status,'not_found');
 assert.equal(matchDirectory(d,{telegramUserId:999},teacher,now()).status,'not_found');
 assert.equal(matchDirectory(d,{username:'real_student'},'other',now()).status,'unavailable');
 assert.equal(matchDirectory(d,{username:'real_student'},teacher,now()+21*60000).status,'stale');
});
test('fresh lookup uses the scoped HTTPS source; unavailable or stale data never becomes a confirmed match',async t=>{
 const directory=fixture(t),config={platformDirectory:{teacherId:teacher,url:'https://ivan100.ru/api/reply-assistant/directory'}};let calls=0,clock=now();
 const client=new PlatformDirectory(config,{directory,now:()=>clock,loadSecret:async()=> 'SCOPED_TOKEN',fetcher:async(url,options)=>{calls++;assert.equal(url.hostname,'ivan100.ru');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer SCOPED_TOKEN');return new Response(JSON.stringify(buildDirectory(sources(),teacher,at)));}});
 const sender={username:'real_student'};assert.equal((await client.lookup(sender)).status,'matched');assert.equal((await client.lookup(sender)).status,'matched');assert.equal(calls,1);
 clock+=21*60000;client.fetcher=async()=>new Response('{}',{status:401});assert.equal((await client.lookup(sender)).status,'stale');
 fs.unlinkSync(path.join(directory,'platform-directory.json'));clock+=60000;assert.equal((await client.lookup(sender)).status,'unavailable');
 config.platformDirectory.url='https://attacker.invalid/';clock+=60000;let external=false;client.fetcher=async()=>{external=true;};assert.equal((await client.lookup(sender)).status,'unavailable');assert.equal(external,false);
 config.platformDirectory.url='https://ivan100.ru/api/reply-assistant/directory';clock+=60000;fs.writeFileSync(path.join(directory,'platform-directory.json'),JSON.stringify({version:1,teacherId:teacher,generatedAt:'invalid',members:[]}));client.fetcher=async()=>new Response(JSON.stringify(buildDirectory(sources(),teacher,new Date(clock).toISOString())));assert.equal((await client.lookup(sender)).status,'matched');
});
test('sidecar has authenticated read-only routes and fails closed when production files are unavailable',async t=>{
 const dataDir=fixture(t),s=sources(),token='a'.repeat(48);
 for(const [file,value] of Object.entries({'students.json':s.students,'learning-groups.json':s.groups,'student-contacts.json':{version:1,contacts:s.studentContacts},'student-parent-contacts.json':{version:1,contacts:s.parentContacts}}))fs.writeFileSync(path.join(dataDir,file),JSON.stringify(value));
 const server=createDirectoryServer({dataDir,teacherId:teacher,token,now:()=>at});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}/api/reply-assistant/directory`,headers={Authorization:'Bearer '+token};
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers,method:'POST'})).status,404);
 const response=await fetch(url,{headers});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).members.length,2);
 fs.unlinkSync(path.join(dataDir,'students.json'));const bad=await fetch(url,{headers});assert.equal(bad.status,503);assert.doesNotMatch(await bad.text(),/SECRET|token|root/);
});

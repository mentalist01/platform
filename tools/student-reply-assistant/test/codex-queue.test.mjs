import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CodexQueueClient} from '../codex-queue.mjs';

const thread='01a1d2a4-c8ea-7213-8ed2-4bfcadb23b07';
function fixture(send) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ivan-draft-queue-'));
  const client=new CodexQueueClient('codex',directory,'Drafts only',{directory,send,timeoutMs:25,pollMs:2});
  return {directory,client,cleanup(){fs.rmSync(directory,{recursive:true,force:true});}};
}
test('queue delivery uses an explicit matching receipt, with no pupil text on the command line',async()=>{
 let calls=0;const f=fixture(async(command,id,message)=>{calls++;assert.equal(id,thread);assert.doesNotMatch(message,/PRIVATE_PUPIL_TEXT/);const request=JSON.parse(fs.readFileSync(path.join(f.directory,fs.readdirSync(f.directory)[0],'request.json'),'utf8'));fs.writeFileSync(request.responsePath,JSON.stringify({requestId:request.requestId,draft:'Кому: Тест\nОтвет для отправки: Пришли условие.'}));});
 try{await f.client.start(thread);assert.match(await f.client.draft('PRIVATE_PUPIL_TEXT'),/Пришли условие/);assert.match(await f.client.draft('PRIVATE_PUPIL_TEXT'),/Пришли условие/);assert.equal(calls,1);}finally{f.cleanup();}
});
test('an unconfirmed delivery is not sent again after a timeout or restart',async()=>{
 let calls=0;const send=async()=>{calls++;};const f=fixture(send);
 try{await f.client.start(thread);await assert.rejects(f.client.draft('pending'),e=>e.queueReceiptPending===true);const next=new CodexQueueClient('codex',f.directory,'Drafts only',{directory:f.directory,send,timeoutMs:15,pollMs:2});await next.start(thread);await assert.rejects(next.draft('pending'),e=>e.queueReceiptPending===true);assert.equal(calls,1);}finally{f.cleanup();}
});
test('wrong request receipts cannot be presented as a draft',async()=>{
 const f=fixture(async()=>{const job=path.join(f.directory,fs.readdirSync(f.directory)[0]);fs.writeFileSync(path.join(job,'response.json'),JSON.stringify({requestId:'another-pupil',draft:'Wrong answer'}));});
 try{await f.client.start(thread);await assert.rejects(f.client.draft('test'),/Invalid Codex receipt/);}finally{f.cleanup();}
});

test('technical reports come only from the matching receipt and are cleared for the next draft',async()=>{
 let calls=0;const f=fixture(async()=>{const folders=fs.readdirSync(f.directory);const job=folders.find(name=>!fs.existsSync(path.join(f.directory,name,'response.json')));const request=JSON.parse(fs.readFileSync(path.join(f.directory,job,'request.json')));calls++;fs.writeFileSync(request.responsePath,JSON.stringify({requestId:request.requestId,draft:'Кому: Тест\nОтвет для отправки: Пришли снимок ошибки.',technicalIssue:calls===1?{summary:'Ошибка таблицы',actual:'Не открылась',evidenceMessageIds:[7]}:null}));});
 try{await f.client.start(thread);await f.client.draft('Technical request');assert.equal(f.client.lastTechnicalIssue.summary,'Ошибка таблицы');assert.deepEqual(f.client.lastTechnicalIssue.evidenceMessageIds,[7]);await f.client.draft('Ordinary request');assert.equal(f.client.lastTechnicalIssue,null);}finally{f.cleanup();}
});

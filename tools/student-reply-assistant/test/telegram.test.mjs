import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TelegramReader} from '../telegram.mjs';
const token='123:'+('a'.repeat(32));
const ok=value=>({ok:true,status:200,json:async()=>({ok:true,result:value})});
test('a bot with an existing webhook is rejected without deleting or changing it',async()=>{
 const calls=[];const reader=new TelegramReader(token,async url=>{const method=url.split('/').at(-1);calls.push(method);return ok(method==='getMe'?{is_bot:true,can_connect_to_business:true}:{url:'https://existing.invalid/hook'});});
 await assert.rejects(reader.check(),/already has a webhook/);assert.deepEqual(calls,['getMe','getWebhookInfo']);
 await assert.rejects(reader.call('sendMessage',{chat_id:1,text:'never'}),/only reads/);assert.equal(calls.length,2);
});
test('transport errors never expose the token',async()=>{
 const reader=new TelegramReader(token,async()=>{throw Error('fetch failed '+token);});await assert.rejects(reader.call('getMe'),error=>!error.message.includes(token));
});
test('attachment names cannot choose paths and excessive files are rejected',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-file-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const reader=new TelegramReader(token,async url=>url.includes('/getFile')?ok({file_path:'documents/file_1.txt',file_size:2}):new Response('ok'));
 const result=await reader.download({id:'file',name:'../../stolen.txt',kind:'document',bytes:2},dir,1024);assert.equal(path.dirname(result.path),dir);assert.equal(fs.readFileSync(result.path,'utf8'),'ok');
 await assert.rejects(reader.download({id:'file',name:'data.txt',bytes:5000},dir,1024),/larger/);
});

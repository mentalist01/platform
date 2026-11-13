import test from 'node:test';
import assert from 'node:assert/strict';
import {serve} from '../ui-server.mjs';
import {AssistantRunner} from '../runner.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('the local panel rejects unauthenticated and cross-origin access',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'reply-panel-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const config={telegramOwnerId:null,allowedChatIds:[],allPrivateChats:false,autoDraft:false,debounceMs:1000,maxFileBytes:1024,codexThreadId:'test'};
 const runner=new AssistantRunner(config,{inboxFile:path.join(directory,'inbox.json')});
 const panel=await serve({onReady:()=>{},runner,stateDirectory:directory});
 try {
   const url=new URL(panel.panelUrl),key=url.hash.slice(1),root=url.origin;
   assert.equal((await fetch(root+'/api/state')).status,403);
   assert.equal((await fetch(root+'/api/state',{headers:{'x-assistant-key':key,Origin:'https://foreign.invalid'}})).status,403);
   const response=await fetch(root+'/api/state',{headers:{'x-assistant-key':key}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.running,false);assert.equal(data.config.autoDraft,false);
   assert.equal((await fetch(root+'/api/config',{method:'POST',headers:{'x-assistant-key':key,'Content-Type':'application/json'},body:JSON.stringify({telegramOwnerId:888,allowedChatIds:[1],autoDraft:true})})).status,400);
   panel.runner.config.telegramOwnerId=888;panel.runner.config.allowedChatIds=[123];
   panel.runner.inbox.data.connections.test={ownerId:888,enabled:true};
   panel.runner.inbox.data.cases.test={key:'test',name:'Тестовый ученик',chatId:123,connectionId:'test',revision:1,messages:[{id:1,outgoing:false,text:'Нужна помощь с задачей'}]};
   const context=()=>fetch(root+'/api/context',{method:'POST',headers:{'x-assistant-key':key,'Content-Type':'application/json'},body:JSON.stringify({key:'test'})});
   let reply=await context();assert.equal(reply.status,200);assert.match((await reply.json()).prompt,/Нужна помощь с задачей/);
   panel.runner.config.allowedChatIds=[];assert.equal((await context()).status,400);
   panel.runner.config.allowedChatIds=[123];panel.runner.inbox.data.connections.test.ownerId=777;assert.equal((await context()).status,400);
   const page=await fetch(root);assert.match(await page.text(),/Ответы ученикам/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 } finally {await panel.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TechnicalEscalations} from '../escalations.mjs';
import {AssistantRunner} from '../runner.mjs';
const root='01a0f144-7aa5-7631-9668-b1cb8fc1eb38',replies='01a1d2a4-c8ea-7213-8ed2-4bfcadb23b07';
const config=()=>({technicalThreadId:root,codexThreadId:replies,codexCommand:'codex',telegramOwnerId:100,allowedChatIds:[],allPrivateChats:true,autoDraft:true,debounceMs:1000,maxFileBytes:1024});
const item=()=>({key:'case',revision:1,name:'Test',chatId:200,messages:[{id:7,outgoing:false,date:123,text:'PRIVATE_ERROR'},{id:8,outgoing:true,text:'Unrelated'}]});
const issue={summary:'Таблица не открылась',actual:'Ошибка открытия',evidenceMessageIds:[7],uncertainties:['Версия программы неизвестна']};
function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'reply-issues-'));t.after(()=>{assert.equal(path.dirname(d),path.resolve(os.tmpdir()));fs.rmSync(d,{recursive:true,force:true});});return d;}
test('one issue is durably routed to the configured development chat and the result goes back exactly once',async t=>{
 const directory=fixture(t),calls=[],cfg=config(),send=async(_,id,msg)=>{assert.doesNotMatch(msg,/PRIVATE_ERROR/);calls.push(id);};
 const bridge=new TechnicalEscalations(cfg,{directory,send});const result=await bridge.submit(item(),issue);await bridge.submit(item(),issue);assert.deepEqual(calls,[root]);
 const packet=JSON.parse(fs.readFileSync(path.join(directory,result.issueId,'request.json')));assert.equal(packet.messages.length,1);assert.equal(packet.messages[0].id,7);
 fs.writeFileSync(packet.responsePath,JSON.stringify({issueId:result.issueId,status:'needs_context',message:'Нужна версия помощника'}));
 assert.equal((await bridge.collect(()=>false)).length,0);assert.deepEqual(calls,[root]);
 await bridge.collect();const restarted=new TechnicalEscalations(cfg,{directory,send});await restarted.collect();assert.deepEqual(calls,[root,replies]);
});
test('ordinary questions, invented evidence and uncertain delivery do not trigger repeated forwarding',async t=>{
 const directory=fixture(t);let calls=0;const cfg=config(),send=async()=>{calls++;throw Error('uncertain');};let bridge=new TechnicalEscalations(cfg,{directory,send});
 assert.equal(await bridge.submit(item(),null),null);assert.equal(await bridge.submit(item(),{...issue,evidenceMessageIds:[99]}),null);assert.equal(calls,0);
 const result=await bridge.submit(item(),issue);assert.equal(result.state,'uncertain');bridge=new TechnicalEscalations(cfg,{directory,send});await bridge.submit(item(),issue);assert.equal(calls,1);
 cfg.technicalThreadId=replies;assert.equal(await bridge.submit(item(),issue),null);
});
test('a stale Codex result cannot escalate a pupil who has already been answered',async t=>{
 const directory=fixture(t),cfg=config();let forwarded=0;
 const runner=new AssistantRunner(cfg,{inboxFile:path.join(directory,'inbox.json'),escalations:{enabled:()=>true,submit:async()=>{forwarded++;}},directoryClient:{lookup:async()=>({status:'not_found'})},codexFactory:()=>({async start(){},lastTechnicalIssue:issue,async draft(){runner.inbox.ingest({update_id:3,business_message:{business_connection_id:'c',message_id:2,date:124,from:{id:100},chat:{id:200,type:'private'},text:'Уже ответил'}});return 'Outdated draft';},close(){}})});
 runner.inbox.ingest({update_id:1,business_connection:{id:'c',user:{id:100},is_enabled:true}});runner.inbox.ingest({update_id:2,business_message:{business_connection_id:'c',message_id:1,date:123,from:{id:200},chat:{id:200,type:'private'},text:'Error'}});
 await runner.prepare(Object.values(runner.inbox.data.cases)[0]);assert.equal(forwarded,0);assert.equal(Object.values(runner.inbox.data.cases)[0].status,'answered');
});

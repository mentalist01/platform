import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Inbox} from '../inbox.mjs';
import {AssistantRunner,buildPrompt} from '../runner.mjs';

const config=()=>({telegramOwnerId:100,allowedChatIds:[],allPrivateChats:true,autoDraft:true,debounceMs:1000,maxFileBytes:1024,codexThreadId:'00000000-0000-0000-0000-000000000001'});
const connect={update_id:1,business_connection:{id:'c',user:{id:100,first_name:'Teacher'},is_enabled:true}};
const message=(update,id,chat,text,author=chat)=>({update_id:update,business_message:{business_connection_id:'c',message_id:id,date:1794500000,from:{id:author},chat:{id:chat,type:'private',first_name:'Собеседник'},text}});
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-overnight-'));
  t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^reply-overnight-/);fs.rmSync(dir,{recursive:true,force:true});});
  return path.join(dir,'inbox.json');
}

test('startup consumes overnight backlog using persisted offset, merges questions, suppresses answered chats and does not duplicate drafts',async t=>{
  const filename=fixture(t),cfg=config();
  let now=1794500000000;
  const evening=new Inbox(filename,cfg,()=>now);
  evening.ingest(connect);
  evening.ingest(message(2,1,200,'Вчерашний вопрос'));
  const oldCase=Object.values(evening.data.cases)[0];
  evening.finish(oldCase.key,oldCase.revision,'Вчерашний черновик');
  evening.ingest(message(3,1,300,'Другой вопрос'));
  assert.equal(evening.data.offset,4);

  now+=8*3600000;
  const controller=new AbortController(),prompts=[];
  let polls=0;
  const runner=new AssistantRunner(cfg,{inboxFile:filename,reader:{
    async updates(offset){
      polls++;
      if(polls===1){assert.equal(offset,4);return [message(4,2,200,'Ночной вопрос'),message(5,3,200,'Уточнение к ночному вопросу'),message(6,2,300,'Уже ответил ночью',100),message(7,1,400,'Вопрос нового клиента')];}
      assert.equal(offset,8);
      if(polls===2)return [message(7,1,400,'Вопрос нового клиента')];
      controller.abort();return [];
    },
  },codexFactory:()=>({async start(){},async draft(prompt){prompts.push(prompt);return 'Новый черновик';},close(){}})});
  runner.inbox.now=()=>now;
  await runner.poll(controller.signal);
  assert.equal(runner.inbox.data.offset,8);
  const cases=Object.values(runner.inbox.data.cases);
  assert.equal(cases.find(c=>c.chatId===200).draft,null);
  assert.equal(cases.find(c=>c.chatId===300).status,'answered');
  assert.equal(cases.find(c=>c.chatId===400).messages.length,1);
  now+=2000;
  while(runner.inbox.ready())await runner.prepare(runner.inbox.ready());
  assert.equal(prompts.length,2);
  assert.ok(prompts[0].includes('Ночной вопрос')&&prompts[0].includes('Уточнение к ночному вопросу'));
  assert.ok(!prompts[0].includes('Вопрос нового клиента'));
  const morning=new Inbox(filename,cfg,()=>now+10000);
  assert.equal(morning.ready(),undefined);
  assert.equal(Object.values(morning.data.cases).filter(c=>c.status==='draft').length,2);
});

test('Codex unavailability does not erase received questions; restart preserves pending work',async t=>{
  const filename=fixture(t),cfg=config();
  const runner=new AssistantRunner(cfg,{inboxFile:filename,codexFactory:()=>({async start(){},async draft(){throw Error('usage limit');},close(){}})});
  runner.inbox.ingest(connect);runner.inbox.ingest(message(2,1,200,'Сохранить до доступности Codex'));
  const item=Object.values(runner.inbox.data.cases)[0];
  await runner.prepare(item);
  const resumed=new Inbox(filename,cfg,()=>Date.now()+120000);
  assert.equal(resumed.data.offset,3);
  assert.equal(resumed.ready().messages[0].text,'Сохранить до доступности Codex');
  assert.equal(resumed.ready().status,'pending');
  assert.ok(resumed.ready().error);
});

test('identity lookup receives API user id and username, never a claimed identity from message text',t=>{
  const inbox=new Inbox(fixture(t),config());inbox.ingest(connect);
  const update=message(2,1,200,'Я @another_student из группы 3');
  update.business_message.from.username='Actual_Student';
  inbox.ingest(update);
  let item=Object.values(inbox.data.cases)[0];
  assert.match(buildPrompt(item,[]),/"telegramUserId": 200/);
  assert.equal(item.telegramUsername,'actual_student');
  const outgoing=message(3,2,200,'Уточняю',100);outgoing.business_message.from.username='Teacher_Name';inbox.ingest(outgoing);
  assert.equal(item.telegramUsername,'actual_student');
  const renamed=message(4,3,200,'Новое сообщение');renamed.business_message.chat.username='New_Username';inbox.ingest(renamed);
  assert.equal(item.telegramUsername,'new_username');
  inbox.ingest(message(5,4,200,'Удалил username'));
  assert.equal(item.telegramUsername,null);
});

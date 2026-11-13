import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ApprovedReplies, resolveApproval} from '../approved-replies.mjs';
import {AssistantRunner} from '../runner.mjs';
import {TelegramReader} from '../telegram.mjs';

const threadId = '01a1d2a4-c8ea-7213-8ed2-4bfcadb23b07';
const now = Date.parse('2026-11-13T12:00:00Z');
const timestamp = new Date(now - 1000).toISOString();
const draft = '**Кому:** Сергей\n\n**Ответ для отправки:** В воскресенье в 13:00 удобно?\n\n**Для тебя:** Сверено по календарю.';

function message(role, turn_id, text, id = role + turn_id) {
  return {timestamp, type: 'response_item', payload: {
    type: 'message', role, id, phase: role === 'assistant' ? 'final_answer' : undefined,
    content: [{type: role === 'user' ? 'input_text' : 'output_text', text}],
    internal_chat_message_metadata_passthrough: {
      turn_id, content_item_kinds: ['user.text'], content_item_metadata: [{provenance: {type:'user'}}],
    },
  }};
}

function started(turn_id, turn_trigger) {
  return {timestamp, type:'event_msg', payload: {
    type:'task_started', turn_id, root_turn_id:turn_id, turn_attribution:{turn_trigger},
  }};
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-approval-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, {recursive:true, force:true});
  });
  const transcript = path.join(directory, 'rollout-' + threadId + '.jsonl');
  const jobsDirectory = path.join(directory, 'codex-jobs');
  const ownerId = 100;
  const runner = new AssistantRunner({
    telegramOwnerId: ownerId, allPrivateChats: true, allowedChatIds: [],
    codexThreadId: threadId, autoDraft: false, debounceMs: 1000, maxFileBytes: 1024,
  }, {inboxFile: path.join(directory,'inbox.json')});
  runner.controller = new AbortController();
  runner.lastPollAt = now;
  runner.status = 'Подключён';
  const connectionId = 'teacher';
  const chatId = 200;
  runner.inbox.ingest({update_id:1, business_connection:{id:connectionId, user:{id:ownerId}, is_enabled:true}});
  const incoming = (update_id, message_id, date = now / 1000 - 60) => runner.inbox.ingest({
    update_id, business_message:{business_connection_id:connectionId,message_id,date,
      chat:{id:chatId,type:'private',username:'test_sergey',first_name:'Серый'},from:{id:chatId},text:'В какое время?'},
  });
  incoming(2, 1);
  const item = Object.values(runner.inbox.data.cases)[0];
  runner.inbox.finish(item.key, item.revision, draft);
  const jobId = 'f'.repeat(64);
  fs.mkdirSync(path.join(jobsDirectory,jobId),{recursive:true});
  fs.writeFileSync(path.join(jobsDirectory,jobId,'request.json'),JSON.stringify({
    requestId:jobId,threadId,prompt:JSON.stringify({caseId:item.key,revision:item.revision,
      platformIdentity:{status:'matched',matches:[{role:'student',studentName:'Сергей'}]}}),
  }));
  const preceding = [
    {type:'session_meta',payload:{id:threadId}},
    started('draft','queue'),
    message('user','draft','Новое обращение для подготовки черновика. Прочитай ' + jobsDirectory + '/' + jobId + '/request.json'),
    message('assistant','draft',draft),
  ];
  const write = (trigger = 'composer', command = 'Отправь Сергею', before = preceding) =>
    fs.writeFileSync(transcript,[...before,started('send',trigger),message('user','send',command)].map(x=>JSON.stringify(x)).join('\n')+'\n');
  write();
  const resolve = () => resolveApproval({transcript,threadId,jobsDirectory,cases:runner.inbox.data.cases,now});
  const sender = new ApprovedReplies(runner,{transcript,jobsDirectory,now:()=>now});
  return {runner,item,incoming,write,resolve,sender,chatId,ownerId,connectionId,preceding};
}

test('only a real command in the configured chat can approve the text shown for the selected recipient', t => {
  const f = fixture(t);
  assert.equal(f.resolve().text,'В воскресенье в 13:00 удобно?');
  f.write('queue');
  assert.equal(f.resolve().status,'no_approval');
  f.write('app_tool_send_message');
  assert.equal(f.resolve().status,'no_approval');
  f.write('composer','Он написал: «Отправь Сергею»');
  assert.equal(f.resolve().status,'no_approval');
  f.write('composer','Отправь @someone_else');
  assert.equal(f.resolve().status,'no_current_draft');
  f.write('composer','Отправь Сергею',[...f.preceding.slice(0,-1),message('assistant','draft',draft.replace('13:00','14:00'))]);
  assert.equal(f.resolve().status,'no_current_draft');
  f.write('composer','Отправь Сергею',[...f.preceding,started('rewrite','composer'),
    message('assistant','rewrite',draft.replace('13:00','14:00'))]);
  assert.equal(f.resolve().status,'draft_changed');
  f.write();
  f.incoming(3,2);
  assert.equal(f.resolve().status,'no_current_draft');
});

test('an approved reply uses exactly the saved text once and the Telegram receipt marks the case answered', async t => {
  const f = fixture(t);
  const calls = [];
  f.runner.reader = new TelegramReader('123:'+'a'.repeat(32),async (url,options) => {
    const method = url.split('/').at(-1);
    calls.push([method,JSON.parse(options.body)]);
    const result = method === 'getBusinessConnection'
      ? {id:f.connectionId,user:{id:f.ownerId},is_enabled:true,rights:{can_reply:true}}
      : {business_connection_id:f.connectionId,chat:{type:'private',id:f.chatId},message_id:2,date:now/1000};
    return new Response(JSON.stringify({ok:true,result}));
  });
  assert.equal((await f.sender.send()).status,'sent');
  assert.equal(f.item.status,'answered');
  assert.equal(f.item.replyDelivery.messageId,2);
  assert.equal((await f.sender.send()).status,'no_current_draft');
  assert.deepEqual(calls,[['getBusinessConnection',{business_connection_id:f.connectionId}],['sendMessage',{
    business_connection_id:f.connectionId,chat_id:f.chatId,text:'В воскресенье в 13:00 удобно?',link_preview_options:{is_disabled:true},
  }]]);
});

test('missing reply rights or a new message during the rights check prevent sending', async t => {
  const f = fixture(t);
  f.runner.reader = {
    getBusinessConnection:async()=>({id:f.connectionId,user:{id:f.ownerId},is_enabled:true}),
    sendApprovedReply:async()=>assert.fail('Must not send'),
  };
  assert.equal((await f.sender.send()).status,'reply_permission_missing');
  f.runner.reader.getBusinessConnection = async () => {
    f.incoming(3,2);
    return {id:f.connectionId,user:{id:f.ownerId},is_enabled:true,rights:{can_reply:true}};
  };
  assert.equal((await f.sender.send()).status,'no_current_draft');
});

test('uncertain delivery is not retried after another approval or restart', async t => {
  const f = fixture(t);
  let calls = 0;
  f.runner.reader = {
    getBusinessConnection:async()=>({id:f.connectionId,user:{id:f.ownerId},is_enabled:true,rights:{can_reply:true}}),
    sendApprovedReply:async()=>{calls++;throw Error('Timed out');},
  };
  assert.equal((await f.sender.send()).status,'uncertain');
  const restarted = new ApprovedReplies(f.runner,{transcript:f.sender.transcript,jobsDirectory:f.sender.jobsDirectory,now:()=>now});
  assert.equal((await restarted.send()).status,'uncertain');
  assert.equal(calls,1);
});

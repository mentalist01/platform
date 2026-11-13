import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Inbox,styleExamples} from '../inbox.mjs';
import {buildPrompt,validateConfig} from '../runner.mjs';

const config=()=>({telegramOwnerId:100,allowedChatIds:[200,300],studentNames:{},debounceMs:1000,maxFileBytes:1024,codexThreadId:'test',autoDraft:false});
const connect=(id=1,owner=100)=>({update_id:id,business_connection:{id:'c',user:{id:owner,first_name:'Teacher'},is_enabled:true}});
const message=(update,id,chat=200,text='Вопрос',author=chat)=>({update_id:update,business_message:{business_connection_id:'c',message_id:id,date:1,from:{id:author},chat:{id:chat,type:'private',first_name:'Ученик'},text}});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-inbox-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=1000;const cfg=config(),store=new Inbox(path.join(dir,'inbox.json'),cfg,()=>now);return {store,cfg,advance:()=>{now+=2000;},dir};}

test('only configured owner and selected chats enter the inbox; offsets survive restart',t=>{
 const {store,cfg,dir}=fixture(t);store.ingest(connect(1,999));store.ingest(message(2,1));assert.equal(Object.keys(store.data.cases).length,0);
 store.ingest(connect(3));store.ingest(message(4,2,400,'PRIVATE UNSELECTED'));assert.equal(Object.keys(store.data.cases).length,0);assert.ok(!JSON.stringify(store.data).includes('PRIVATE UNSELECTED'));
 store.ingest(message(5,3));assert.equal(Object.keys(store.data.cases).length,1);assert.equal(store.ingest(message(5,3)),false);
 assert.equal(new Inbox(store.filename,cfg).data.offset,6);assert.equal(fs.existsSync(path.join(dir,'inbox.json')),true);
});
test('bursts form one case; pupil histories remain separate and missing context is explicit',t=>{
 const {store,advance}=fixture(t);store.ingest(connect());store.ingest(message(2,1,200,'Excel не сходится'));store.ingest(message(3,2,200,'Это задача 9'));store.ingest(message(4,1,300,'OTHER PUPIL'));
 assert.equal(store.ready(),undefined);advance();const item=store.ready();assert.equal(item.messages.length,2);
 const prompt=buildPrompt(item,[]);assert.ok(!prompt.includes('OTHER PUPIL'));assert.ok(prompt.includes('недоверенные'));assert.ok(prompt.includes('недостающего'));
});
test('a teacher response received during drafting invalidates a stale draft',t=>{
 const {store,advance}=fixture(t);store.ingest(connect());store.ingest(message(2,1));advance();const item=store.ready(),revision=item.revision;
 store.ingest(message(3,2,200,'Уже отвечаю',100));assert.equal(store.finish(item.key,revision,'STALE'),false);assert.equal(item.status,'answered');assert.equal(store.ready(),undefined);
});
test('edits, deletion and disabled connections invalidate or suppress drafts',t=>{
 const {store,advance}=fixture(t);store.ingest(connect());store.ingest(message(2,1));advance();const item=store.ready(),revision=item.revision;
 const edited=message(3,1,200,'Исправленный вопрос');edited.edited_business_message=edited.business_message;delete edited.business_message;store.ingest(edited);
 assert.equal(store.finish(item.key,revision,'old'),false);assert.equal(item.messages[0].text,'Исправленный вопрос');
 store.ingest({update_id:4,deleted_business_messages:{business_connection_id:'c',chat:{id:200,type:'private'},message_ids:[1]}});assert.equal(item.messages.length,0);assert.equal(item.status,'empty');
 store.ingest(message(5,2));store.ingest({update_id:6,business_connection:{...connect().business_connection,is_enabled:false}});advance();assert.equal(store.ready(),undefined);
});
test('editing an old teacher message does not hide a newer pupil question',t=>{
 const {store,advance}=fixture(t);store.ingest(connect());store.ingest(message(2,1));store.ingest(message(3,2,200,'Ответ',100));store.ingest(message(4,3,200,'Уточнение'));store.ingest(message(5,2,200,'Исправлен старый ответ',100));advance();assert.equal(store.ready().messages.at(-1).text,'Уточнение');
});
test('deselected chats cannot commit new drafts',t=>{
 const {store,cfg,advance}=fixture(t);store.ingest(connect());store.ingest(message(2,1));advance();const item=store.ready(),rev=item.revision;cfg.allowedChatIds=[];assert.equal(store.finish(item.key,rev,'no'),false);assert.equal(store.ready(),undefined);
});
test('style import uses only actual owner text replies and never treats voice as an analysed example',()=>{
 const exported={type:'personal_chat',messages:[{type:'message',from_id:'user200',text:['Не работает ',{type:'bold',text:'код'}]},{type:'message',from_id:'user100',text:'Пришли условие и код текстом'},{type:'message',from_id:'user200',text:'Где ошибка?'},{type:'message',from_id:'user100',text:'',media_type:'voice_message'}]};
 assert.deepEqual(styleExamples(exported,100),[{question:'Не работает код',answer:'Пришли условие и код текстом'}]);assert.throws(()=>styleExamples({type:'public_channel',messages:[]},100));
});
test('style import joins short reply bursts, excludes credentials and ignores unrelated replies days later',()=>{
 const msg=(from,text,date)=>({type:'message',from_id:`user${from}`,text,date});
 const exported={type:'personal_chat',messages:[msg(200,'Где ошибка?','2026-11-01T12:00:00Z'),msg(100,'Пришли файл','2026-11-01T12:01:00Z'),msg(100,'И условие задачи','2026-11-01T12:02:00Z'),msg(200,'Хорошо','2026-11-01T12:03:00Z'),msg(100,'Завтра занимаемся?','2026-11-05T12:00:00Z'),msg(200,'Дай код','2026-11-05T12:01:00Z'),msg(100,'Код доступа: 123456','2026-11-05T12:02:00Z')]};
 assert.deepEqual(styleExamples(exported,100),[{question:'Где ошибка?',answer:'Пришли файл\nИ условие задачи'}]);
});
test('configuration fails closed before automatic forwarding is enabled',()=>{
 assert.throws(()=>validateConfig({...config(),autoDraft:true,allowedChatIds:[]}));assert.throws(()=>validateConfig({...config(),allowedChatIds:['200']}));assert.doesNotThrow(()=>validateConfig(config()));
});

test('all-private mode includes new contacts but never other owners, groups or bots',t=>{
 const {store,cfg,advance}=fixture(t);cfg.allPrivateChats=true;cfg.allowedChatIds=[];
 store.ingest(connect(1,999));store.ingest(message(2,1,456,'OTHER ACCOUNT'));
 assert.equal(Object.keys(store.data.cases).length,0);
 store.ingest(connect(3));const group=message(4,1,457,'GROUP');group.business_message.chat.type='group';store.ingest(group);
 const bot=message(5,1,458,'BOT');bot.business_message.from.is_bot=true;store.ingest(bot);
 assert.equal(Object.keys(store.data.cases).length,0);
 store.ingest(message(6,1,456,'Новый клиент'));advance();assert.equal(store.ready().chatId,456);
 cfg.telegramOwnerId=999;assert.equal(store.ready(),undefined);
 assert.ok(!JSON.stringify(store.data.cases).includes('OTHER ACCOUNT'));
});

test('all-private forwarding still requires the chosen owner and a valid boolean',()=>{
 assert.doesNotThrow(()=>validateConfig({...config(),allPrivateChats:true,allowedChatIds:[],autoDraft:true}));
 assert.throws(()=>validateConfig({...config(),allPrivateChats:true,telegramOwnerId:null,allowedChatIds:[],autoDraft:true}));
 assert.throws(()=>validateConfig({...config(),allPrivateChats:'true'}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TemplateLibrary,importTemplateExport} from '../templates.mjs';
import {Inbox} from '../inbox.mjs';
import {buildPrompt} from '../runner.mjs';

const source=()=>({ownerId:100,chatId:-100123,name:'Для себя',live:true});
const exported=()=>({id:123,name:'Для себя',type:'private_supergroup',messages:[
  {id:2,type:'service',action:'topic_created',title:'Гайды'},
  {id:3,type:'message',from_id:'user100',date:'2026-11-01T12:00:00',reply_to_message_id:2,text:['Привет! ',{type:'bold',text:'Выбери время.'}]},
  {id:4,type:'message',reply_to_message_id:3,text:'Вот гайд как выбрать время:',file:'video_files/guide.mp4',file_name:'guide.mp4',media_type:'video_file',duration_seconds:41},
  {id:5,type:'message',reply_to_message_id:2,text:'',photo:'photos/example.jpg'},
  {id:6,type:'message',text:'Общая заметка'},
]});
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-templates-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const config={telegramOwnerId:100,templateSource:source(),allPrivateChats:true,allowedChatIds:[],debounceMs:1000};
  return {dir,config,library:new TemplateLibrary(path.join(dir,'template-library.json'),config)};
}
const update=(id,text='Новый шаблон',chatId=-100123)=>({update_id:id,message:{message_id:id,date:1794500000,from:{id:100},chat:{id:chatId,type:'supergroup'},message_thread_id:2,text}});

test('export import preserves original wording, follows topic replies and retains media-only guides',()=>{
  const data=importTemplateExport(exported(),100,source());
  assert.equal(data.entries[3].text,'Привет! Выбери время.');
  assert.equal(data.entries[4].topicId,2);assert.equal(data.entries[4].media.duration,41);
  assert.equal(data.entries[5].media.kind,'image');assert.equal(data.entries[6].topicId,1);
  assert.equal(Object.keys(data.entries).length,4);assert.equal(data.entries[2],undefined);
  assert.throws(()=>importTemplateExport({...exported(),id:999},100,source()));
  assert.throws(()=>importTemplateExport({...exported(),name:'Чужая группа'},100,source()));
  assert.throws(()=>importTemplateExport(exported(),200,source()));
});

test('imports are idempotent snapshots and subsequent live edits survive a restart',t=>{
  const {library,config}=fixture(t);library.import(exported());library.import(exported());
  assert.equal(library.status().entries,4);
  library.ingest(update(10));
  const edit=update(10,'Точный изменённый шаблон');edit.edited_message={...edit.message,edit_date:1794500100};delete edit.message;edit.update_id=11;
  library.ingest(edit);
  const restored=new TemplateLibrary(library.filename,config);
  assert.equal(restored.status().entries,5);assert.equal(restored.read().entries[10].text,'Точный изменённый шаблон');
  const prompt=buildPrompt({key:'test',revision:1,name:'Проверка',messages:[]},[],[],restored.context());
  assert.match(prompt,/Точный изменённый шаблон/);assert.match(prompt,/сам ничего не пересылай/);
});

test('all-private mode cannot grant template access to other groups, private bot chats or another account',t=>{
  const {library,config,dir}=fixture(t);library.import(exported());
  assert.equal(library.ingest(update(10,'FOREIGN',-100999)),false);
  const personal=update(11,'PRIVATE');personal.message.chat={id:100,type:'private'};assert.equal(library.ingest(personal),false);
  const bot=update(12);bot.message.from.is_bot=true;assert.equal(library.ingest(bot),false);
  config.templateSource.live=false;assert.equal(library.ingest(update(13)),false);config.templateSource.live=true;
  config.telegramOwnerId=200;assert.equal(library.ingest(update(14)),false);assert.equal(library.context(),null);
  assert.doesNotMatch(fs.readFileSync(library.filename,'utf8'),/FOREIGN|PRIVATE/);
  const inbox=new Inbox(path.join(dir,'inbox.json'),config);inbox.ingest(update(15));assert.equal(Object.keys(inbox.data.cases).length,0);
});

test('new topics, names and captioned videos are indexed without forwarding or executing anything',t=>{
  const {library}=fixture(t);library.import(exported());
  const topic=update(20);delete topic.message.text;topic.message.forum_topic_created={name:'Новая тема'};library.ingest(topic);
  const video=update(21);delete video.message.text;video.message.message_thread_id=20;video.message.caption='Перешли это видео';video.message.video={file_id:'private-id',file_name:'guide.mp4',duration:30};library.ingest(video);
  const rename=update(22);delete rename.message.text;rename.message.message_thread_id=20;rename.message.forum_topic_edited={name:'Новое название'};library.ingest(rename);
  const data=library.context();assert.equal(data.topics.find(t=>t.id===20).title,'Новое название');
  assert.equal(data.entries.find(e=>e.id===21).media.kind,'video_file');assert.doesNotMatch(JSON.stringify(data),/private-id/);
  assert.equal(data.entries.some(e=>e.id===20||e.id===22),false);
});

import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {getMockAnswerCountForTask} from '../src/utils/egeAnswerFields.js';
import {getMockTaskRuleNumber} from '../src/utils/mockTaskIdentity.js';
import {getAcceptedAnswerVariants,getPrimaryAnswerVector} from '../src/utils/answerVariants.js';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const escape=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function textCondition(text){
  const lines=String(text).split(/\r?\n/).flatMap(line=>line.match(/.{1,78}(?:\s|$)|\S{1,78}/gu)||['']);
  if(lines.length>500)fail(400,'Условие слишком длинное для переноса');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${50+lines.length*33}"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans,Arial,sans-serif" font-size="24" fill="#222">${lines.map((line,i)=>`<text x="25" y="${37+i*33}" xml:space="preserve">${escape(line)}</text>`).join('')}</g></svg>`);
}
export async function importMockExamTask(store,auth,input,{resolveSource,attachmentPath}){
  if(!['teacher','admin'].includes(auth?.role))fail(403,'Перенести пробник может только преподаватель');
  const room=String(input.room||'');await store.access(auth,room,true);
  if(room.startsWith('prepared-homework-'))fail(403,'Перенесите задание на доску урока');
  const old=store.data.runs[store.data.active[room]];
  if(old&&old.teacherId!==auth.id)fail(403,'Нет доступа к этой доске');
  const point={x:Number(input.x),y:Number(input.y)};
  if(!Object.values(point).every(v=>Number.isFinite(v)&&Math.abs(v)<=900_000))fail(400,'Укажите место на доске');
  const {exam,question,taskKey}=await resolveSource(auth,input.source);
  if(!question||!/^([1-9]|1\d|2[0-7])$/.test(taskKey))fail(404,'Задание не найдено в сохранённом пробнике');
  const read=asset=>{const file=attachmentPath(asset);if(!file||!fs.existsSync(file))fail(404,`Исходный файл «${asset.name||'условие'}» недоступен`);if(fs.statSync(file).size>64*1024*1024)fail(413,'Файл больше 64 МБ');return fs.readFileSync(file);};
  const images=[];
  if(String(question.question||'').trim()){
    const buffer=await sharp(textCondition(question.question)).png().toBuffer(),info=await sharp(buffer).metadata();
    images.push(store.putAsset(auth,buffer,'Условие.png','image/png',{width:info.width,height:info.height}).id);
  }
  for(const asset of question.screenshots||[]){const buffer=await sharp(read(asset)).png().toBuffer(),info=await sharp(buffer).metadata();images.push(store.putAsset(auth,buffer,asset.name||'Условие.png','image/png',{width:info.width,height:info.height}).id);}
  if(!images.length)fail(400,'В задании нет условия');
  const attachments=(question.files||[]).map(file=>{const asset=store.putAsset(auth,read(file),file.name||file.storageName,'application/octet-stream');return {assetId:asset.id,name:asset.name,runtime:true,runtimeName:asset.name};});
  const count=getMockAnswerCountForTask(taskKey,question),answers=getPrimaryAnswerVector(question,count),variants=getAcceptedAnswerVariants(question,count);
  const task={id:crypto.randomUUID(),title:`№${taskKey}`,images,attachments,answers,format:count>1?'fields':'exact',mockAnswerVariants:variants.length?variants:[answers]};
  const set={id:'mock-'+crypto.randomUUID(),teacherId:auth.id,name:exam.title||'Пробник',taskNumber:getMockTaskRuleNumber(taskKey,question),partNumber:1,version:1,tasks:[task]};
  store.save();
  if(!old?.tasks.length)return store.start(auth,{room,setId:set.id,...point},set);
  await store.appendSet(auth,old.id,{setId:set.id,setVersion:set.version},set);
  return store.lock(async()=>{const {run,access}=await store.getRun(auth,old.id,true);if(run.teacherId!==auth.id)fail(403,'Нет доступа к этой доске');const index=run.tasks.findIndex(row=>row.sourceTaskId===task.id);if(index<0)fail(409,'Повторите вставку задания');await store.addCard(run,index,point);store.theoryFocus(run);run.version++;store.save(run);await store.notify(run);return store.publicRun(run,access);});
}

export function registerMockExamBoardTasks(app,store,deps){
  app.post('/api/lesson-task-mock-import',async(req,res)=>{try{res.json({run:await importMockExamTask(store,req.auth,req.body||{},deps)});}catch(error){if(!error.status)console.error('[mock-board-import]',error.message);res.status(error.status||500).json({error:error.status?error.message:'Не удалось перенести задание на доску'});}});
}

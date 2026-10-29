import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {preparedSolutionEntries} from './preparedSetRemoval.js';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';
import {isWorkbookFileName} from './workbookHelper.js';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const isTeacher=auth=>['teacher','admin'].includes(auth?.role);
export const workbookAttempt=(card,assetId)=>card.workbookAttempts?.[assetId]||{id:'',number:1};
export const currentWorkbookSolution=(card,assetId)=>{
  const solution=card.solutions?.[assetId],attempt=workbookAttempt(card,assetId);
  return solution&&(!attempt.id||solution.attemptId===attempt.id)?solution:null;
};

// File bytes already use content-addressed storage. The journal only retains
// immutable metadata; unchanged autosaves within an attempt add no new entry.
export class PreparedWorkbookHistory {
  constructor(directory){this.directory=directory;this.cache=new Map();fs.mkdirSync(directory,{recursive:true});}
  key(runId,cardId,assetId){return digest(`${runId}\0${cardId}\0${assetId}`);}
  read(key){
    if(!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid history key');
    if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return value;}
    const file=path.join(this.directory,key+'.jsonl'),bytes=fs.existsSync(file)?fs.readFileSync(file):Buffer.alloc(0),end=bytes.lastIndexOf(10)+1;
    const rows=bytes.subarray(0,end).toString('utf8').split('\n').filter(Boolean).map(line=>{const {checksum,...row}=JSON.parse(line);if(digest(JSON.stringify(row))!==checksum)throw Error('Повреждена история таблицы');return row;});
    const value={rows,file,ids:new Set(rows.map(row=>row.id)),validBytes:end,truncated:bytes.length!==end};this.cache.set(key,value);
    while(this.cache.size>8)this.cache.delete(this.cache.keys().next().value);
    return value;
  }
  snapshot(key,solution){
    return {id:digest(`${key}\0${solution.id}\0${solution.revision}\0${solution.attemptId||''}`),solutionId:solution.id,name:solution.name,storage:solution.storage,hash:solution.hash,size:solution.size,revision:solution.revision,updatedAt:solution.updatedAt,savedBy:solution.savedBy,attemptId:solution.attemptId||'',attemptNumber:solution.attemptNumber||1};
  }
  list(key,current){
    const rows=this.read(key).rows,last=rows.at(-1);
    return current&&(!last||last.hash!==current.hash||last.name!==current.name||last.attemptId!==(current.attemptId||''))?[...rows,this.snapshot(key,current)]:rows;
  }
  archive(key,solution){
    if(!solution)return this.read(key).rows.length;
    const log=this.read(key),last=log.rows.at(-1);
    if(last?.hash===solution.hash&&last.name===solution.name&&last.attemptId===(solution.attemptId||''))return log.rows.length;
    const row=this.snapshot(key,solution);
    if(log.ids.has(row.id))return log.rows.length;
    if(log.truncated){fs.truncateSync(log.file,log.validBytes);log.truncated=false;}
    const line=JSON.stringify({...row,checksum:digest(JSON.stringify(row))})+'\n',fd=fs.openSync(log.file,'a',0o600);
    try{fs.writeFileSync(fd,line);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    log.rows.push(row);log.ids.add(row.id);log.validBytes+=Buffer.byteLength(line);return log.rows.length;
  }
}

export function registerPreparedWorkbookHistory(app,store){
  const handler=fn=>(req,res,next)=>Promise.resolve().then(()=>{res.setHeader('Cache-Control','private, no-store');res.vary('Authorization');return fn(req,res);}).catch(error=>{if(res.headersSent)return next(error);res.status(error.status||500).json({error:error.status?error.message:'Не удалось открыть историю таблицы. Сохранённые файлы не удалены.'});});
  const context=async(req,write=false)=>{
    const {run,access}=await store.getRun(req.auth,req.params.id,write),input=write?req.body:req.query;
    const entry=preparedSolutionEntries(run).find(entry=>entry.card.id===input.cardId),asset=store.data.assets[input.assetId];
    if(!entry||!asset||!entry.task.attachments.some(a=>a.assetId===asset.id))fail(404,'Файл этой задачи не найден');
    if(write&&(access.readOnly||run.homework||!run.cards.includes(entry.card)||run.groupId&&!isTeacher(req.auth)))fail(403,'Начать новую попытку может преподаватель или участник индивидуального урока');
    return {run,card:entry.card,task:entry.task,asset,key:store.workbookHistory.key(run.id,entry.card.id,asset.id)};
  };
  const view=(row,run,card,asset,currentId)=>({id:row.id,name:row.name,revision:row.revision,sizeBytes:row.size,updatedAt:row.updatedAt,savedBy:row.savedBy,attemptNumber:row.attemptNumber,current:row.id===currentId,url:`/api/lesson-task-runs/${run.id}/workbook-history/${row.id}?`+new URLSearchParams({cardId:card.id,assetId:asset.id})});
  app.get('/api/lesson-task-runs/:id/workbook-history',handler(async(req,res)=>{
    const {run,card,asset,key}=await context(req),rows=store.workbookHistory.list(key,card.solutions?.[asset.id]),before=String(req.query.before||'');
    const end=before?rows.findIndex(row=>row.id===before):rows.length;if(end<0)fail(409,'История изменилась. Откройте её снова.');
    const selected=rows.slice(Math.max(0,end-30),end).reverse();
    res.setHeader('Cache-Control','private, no-store');res.json({attempt:workbookAttempt(card,asset.id),total:rows.length,versions:selected.map(row=>view(row,run,card,asset,rows.at(-1)?.id)),nextBefore:end>30?selected.at(-1).id:null,source:{name:asset.name,url:`/api/lesson-task-runs/${run.id}/workbook-history/source?`+new URLSearchParams({cardId:card.id,assetId:asset.id})}});
  }));
  app.get('/api/lesson-task-runs/:id/workbook-history/:versionId',handler(async(req,res)=>{
    const {card,asset,key}=await context(req),row=req.params.versionId==='source'?asset:store.workbookHistory.list(key,card.solutions?.[asset.id]).find(row=>row.id===req.params.versionId);
    if(!row)fail(404,'Сохранение не найдено');res.setHeader('Cache-Control','private, no-store');res.attachment(row.name);res.sendFile(store.assetFile(row));
  }));
  app.post('/api/lesson-task-runs/:id/workbook-restart',handler(async(req,res)=>{
    const result=await store.lock(async()=>{
      const {run,card,task,asset,key}=await context(req,true),attempt=workbookAttempt(card,asset.id),previous=card.solutions?.[asset.id],mode=card.liveWorkbooks?.[asset.id];
      if(!isWorkbookFileName(asset.name)&&!(/\.(txt|csv|tsv)$/i.test(asset.name)&&(mode?.enabled||[26,27].includes(Number(preparedTaskSource(run,task,card.index).taskNumber)))))fail(415,'Этот файл не подходит для таблицы');
      if(req.body.confirmClosed!==true)fail(400,'Сначала сохраните и закройте таблицы у всех участников');
      if(Number(req.body.expectedRevision)!==(previous?.revision||0)||req.body.expectedAttemptId!==attempt.id)fail(409,'Таблица уже изменилась. Обновите карточку и повторите.');
      const state=mode?.enabled&&store.liveWorkbooks.read(mode.key).state;
      if(state&&state.revision!==state.checkpointRevision)fail(409,'В общей таблице есть несохранённые изменения. Сначала нажмите Ctrl+S и закройте её.');
      const count=store.workbookHistory.archive(key,previous),id=crypto.randomUUID();
      card.workbookAttempts||={};card.workbookAttempts[asset.id]={id,number:attempt.number+1,startedAt:new Date(store.now()).toISOString(),startedBy:{id:req.auth.id,name:req.auth.name,role:req.auth.role}};
      card.workbookHistoryCounts||={};card.workbookHistoryCounts[asset.id]=count;
      if(card.bindings?.[asset.id]){const binding=card.bindings[asset.id];binding.id=digest(run.id+card.id+asset.id+id);binding.generation++;binding.until=0;delete binding.resumedGeneration;}
      if(mode?.enabled){const epoch=crypto.randomUUID();card.liveWorkbooks[asset.id]={enabled:true,epoch,key:store.liveWorkbooks.key(run.id,card.id,asset.id+'-'+epoch),sourceHash:/\.(txt|csv|tsv)$/i.test(asset.name)?digest(BLANK_WORKBOOK_ODS):asset.hash,createdAt:store.now(),...(mode.ordinaryFallback?{ordinaryFallback:true}:{}),...(mode.launchFailures?{launchFailures:mode.launchFailures}:{})};}
      run.version++;store.save(run);await store.notify(run,'file',card.id);
      return {attempt:workbookAttempt(card,asset.id)};
    });res.json(result);
  }));
}

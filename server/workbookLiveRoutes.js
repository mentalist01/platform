import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import {parseWorkbookHelperAuthorization,isWorkbookFileName} from './workbookHelper.js';
import {BLANK_WORKBOOK_ODS} from './blankWorkbook.js';
import {liveDigest,LIVE_WORKBOOK_LIMITS} from './workbookLiveState.js';
import {WorkbookLivePresence} from './workbookLivePresence.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const teacher=auth=>['teacher','admin'].includes(auth?.role);
const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(error=>res.status(error.status||500).json({error:error.message,...(error.previous?{code:'PREVIOUS_TABLE_OPEN',previous:error.previous}:{})}));
const uploads=multer({storage:multer.memoryStorage(),limits:{fileSize:64*1024*1024,files:1,fields:8}});
const actor=auth=>`${auth.role}:${auth.id}`;
const isText=asset=>/\.(txt|csv|tsv)$/i.test(asset.name);
const seed=(store,card,asset)=>card.solutions[asset.id]||{...asset,...(isText(asset)?{name:asset.name.replace(/\.[^.]+$/,'')+' — решение.ods',hash:liveDigest(BLANK_WORKBOOK_ODS),blank:true}:{})};

export function workbookLiveView(store,run,card,assetId){
  const mode=card.liveWorkbooks?.[assetId];if(!mode?.enabled)return null;
  const state=store.liveWorkbooks.read(mode.key).state;
  return {enabled:true,initialized:Boolean(state),revision:state?.revision||0,checkpointRevision:state?.checkpointRevision||0,minimumHelper:'1.4.0',windowsOnly:true};
}

export function registerWorkbookLiveRoutes(app,store,{allowExchange=()=>true,allowContent=()=>true}={}){
  const tickets=new Map(),rates=new Map(),presence=new WorkbookLivePresence();
  const authorize=async(auth,id,cardId,assetId)=>{
    const {run,access}=await store.getRun(auth,id,true);
    if(access.readOnly||(run.groupId&&!teacher(auth)))fail(403,'В группе общую таблицу изменяет преподаватель');
    const card=run.cards.find(c=>c.id===cardId),attachment=card&&run.tasks[card.index].attachments.find(a=>a.assetId===assetId),asset=store.data.assets[assetId];
    if(!card||!attachment||!asset)fail(410,'Задача или файл больше не доступны на доске');
    return {run,card,asset};
  };
  const session=async req=>{
    const token=parseWorkbookHelperAuthorization(req.headers.authorization);if(!token.startsWith('wl_'))return null;
    const entry=store.data.sessions[liveDigest(token)];if(!entry?.live||entry.expires<store.now())fail(401,'Доступ помощника истёк. Откройте общую таблицу с доски.');
    const context=await authorize(entry.auth,entry.runId,entry.cardId,entry.assetId),mode=context.card.liveWorkbooks?.[entry.assetId];
    if(!mode?.enabled||mode.epoch!==entry.epoch)fail(410,'Совместное редактирование завершено. Ваша локальная копия сохранена.');
    return {...context,entry,mode};
  };
  const intercept=handler(async(req,res,next)=>{
    const token=parseWorkbookHelperAuthorization(req.headers.authorization);if(!token.startsWith('wl_'))return next();
    if(req.path.includes('/live/')){
      const now=store.now(),key=liveDigest(token);let rate=rates.get(key);
      if(!rate||rate.start+60000<now){rate={start:now,count:0};rates.set(key,rate);}
      if(++rate.count>600)fail(429,'Слишком много запросов к общей таблице. Повторю позже.');
      if(rates.size>6000)for(const [id,value]of rates)if(value.start+60000<now)rates.delete(id);
    }else if(!allowContent(req))fail(429,'Слишком много запросов к таблице. Повторю позже.');
    req.liveWorkbook=await session(req);next();
  });
  store.registerLiveBoardRoutes=()=>{
  app.post('/api/lesson-task-runs/:id/live',handler(async(req,res)=>{
    const result=await store.lock(async()=>{
      const {run,card,asset}=await authorize(req.auth,req.params.id,req.body.cardId,req.body.assetId);
      if(!teacher(req.auth)||run.teacherId!==req.auth.id)fail(403,'Режим таблицы меняет преподаватель этой доски');
      if(!isWorkbookFileName(asset.name)&&!isText(asset))fail(415,'Этот формат не подходит для совместной таблицы');
      card.liveWorkbooks||={};const old=card.liveWorkbooks[asset.id],enabled=req.body.enabled===true;
      if(Boolean(old?.enabled)===enabled)return store.publicRun(run,{auth:req.auth,readOnly:false});
      if(enabled){
        const writer=card.bindings?.[asset.id];
        if(writer?.until>store.now())fail(409,'Сначала сохраните и закройте открытую таблицу, затем нажмите «Передать файл». После этого можно включить совместный режим.');
        const source=seed(store,card,asset),epoch=crypto.randomUUID();
        card.liveWorkbooks[asset.id]={enabled:true,epoch,key:store.liveWorkbooks.key(run.id,card.id,asset.id+'-'+epoch),sourceHash:source.hash,createdAt:store.now()};
      }else{
        const state=store.liveWorkbooks.read(old.key).state;
        if(state&&state.revision!==state.checkpointRevision)fail(409,'Есть несохранённые общие изменения. Нажмите Ctrl+S в помощнике и дождитесь сохранения на доске.');
        old.enabled=false;old.endedAt=store.now();
      }
      if(card.bindings?.[asset.id]){card.bindings[asset.id].generation++;card.bindings[asset.id].until=0;delete card.bindings[asset.id].resumedGeneration;}
      run.version++;store.save(run);await store.notify(run,'file',card.id);return store.publicRun(run,{auth:req.auth,readOnly:false});
    });res.json({run:result});
  }));
  app.post('/api/lesson-task-runs/:id/live/helper',handler(async(req,res)=>{
    // The normal launch is one action for either individual participant. The
    // lock makes two simultaneous first opens join the same workbook epoch.
    const {run,card,asset,mode}=await store.lock(async()=>{
      const context=await authorize(req.auth,req.params.id,req.body.cardId,req.body.assetId);
      const {run,card,asset}=context;
      let mode=card.liveWorkbooks?.[asset.id];
      if(!mode?.enabled&&req.body.start===true){
        if(!isWorkbookFileName(asset.name)&&!isText(asset))fail(415,'Этот формат не подходит для совместной таблицы');
        const writer=card.bindings?.[asset.id];
        if(writer?.until>store.now()){
          const previous={generation:writer.generation,revision:card.solutions[asset.id]?.revision||0,name:writer.name,
            savedAt:card.solutions[asset.id]?.updatedAt||null,canClose:teacher(req.auth)||writer.actor===actor(req.auth)};
          if(req.body.closePrevious!==true||!previous.canClose||req.body.previousGeneration!==previous.generation)
            throw Object.assign(Error('Этот файл открывали в прежнем режиме. Сохраните таблицу через Ctrl+S и закройте её, чтобы продолжить вместе.'),{status:409,previous});
        }
        const source=seed(store,card,asset),epoch=crypto.randomUUID();
        card.liveWorkbooks||={};
        mode={enabled:true,epoch,key:store.liveWorkbooks.key(run.id,card.id,asset.id+'-'+epoch),sourceHash:source.hash,createdAt:store.now()};
        card.liveWorkbooks[asset.id]=mode;
        if(card.bindings?.[asset.id]){card.bindings[asset.id].generation++;card.bindings[asset.id].until=0;delete card.bindings[asset.id].resumedGeneration;}
        run.version++;store.save(run);await store.notify(run,'file',card.id);
      }
      return {...context,mode};
    });
    if(!mode?.enabled)fail(409,'Преподаватель ещё не включил совместную таблицу');
    const now=store.now();for(const [key,entry]of tickets)if(entry.expires<now)tickets.delete(key);
    if(tickets.size>=1000)fail(429,'Слишком много запусков помощника');
    const ticket='wl_'+crypto.randomBytes(32).toString('base64url');tickets.set(liveDigest(ticket),{runId:run.id,cardId:card.id,assetId:asset.id,epoch:mode.epoch,auth:{id:req.auth.id,role:req.auth.role,name:req.auth.name},expires:now+180000,live:true});
    res.status(201).json({ticket,minimumHelper:'1.4.0'});
  }));
  };
  app.post('/workbook-helper/v1/exchange',handler(async(req,res,next)=>{
    if(!String(req.body?.ticket||'').startsWith('wl_'))return next();
    if(!allowExchange(req))fail(429,'Слишком много запусков помощника');
    const version=String(req.headers['user-agent']||'').match(/IvanEgeWorkbookHelper\/(\d+)\.(\d+)/i);
    if(!version||Number(version[1])<1||Number(version[1])===1&&Number(version[2])<4||/macOS/i.test(req.headers['user-agent']||''))fail(426,'Для совместной таблицы на Windows обновите помощник до версии 1.4 или новее. Обычный режим работает в прежнем помощнике.');
    const hash=liveDigest(req.body.ticket),entry=tickets.get(hash);if(!entry||entry.expires<store.now())fail(410,'Ссылка запуска истекла. Нажмите «Открыть общую таблицу» снова.');
    const {run,card,asset}=await authorize(entry.auth,entry.runId,entry.cardId,entry.assetId),mode=card.liveWorkbooks?.[entry.assetId];
    if(!mode?.enabled||mode.epoch!==entry.epoch)fail(410,'Совместный режим завершён');
    const source=seed(store,card,asset),token='wl_'+crypto.randomBytes(32).toString('base64url'),expires=store.now()+30*86400000;
    store.data.sessions[liveDigest(token)]={...entry,expires};tickets.delete(hash);store.save();
    res.setHeader('Cache-Control','no-store');res.json({token,workbookKey:mode.key,fileName:source.name,solutionName:source.name,revision:source.revision||0,contentHash:source.hash,requiresName:false,expiresAt:new Date(expires).toISOString(),
      live:{protocol:1,epoch:mode.epoch,actorId:liveDigest(actor(entry.auth)),sessionId:liveDigest(token).slice(0,24),limits:LIVE_WORKBOOK_LIMITS},
      sourceText:isText(asset)?{fileName:asset.name,contentHash:asset.hash,sizeBytes:asset.size}:null});
  }));
  app.get('/workbook-helper/v1/content',intercept,handler(async(req,res,next)=>{
    if(!req.liveWorkbook)return next();const {card,asset,mode}=req.liveWorkbook,source=seed(store,card,asset);
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Workbook-Key',mode.key);res.setHeader('X-Workbook-Revision',String(source.revision||0));res.setHeader('X-Workbook-Content-Hash',source.hash);res.attachment(source.name);
    if(source.blank)res.send(BLANK_WORKBOOK_ODS);else res.sendFile(store.assetFile(source));
  }));
  app.get('/workbook-helper/v1/source-text',intercept,handler(async(req,res,next)=>{
    if(!req.liveWorkbook)return next();const {asset}=req.liveWorkbook;if(!isText(asset)||asset.size>16*1024*1024)fail(404,'Исходный текст недоступен');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Source-Text-Content-Hash',asset.hash);res.attachment(asset.name);res.sendFile(store.assetFile(asset));
  }));
  app.put('/workbook-helper/v1/content',intercept,handler(async(req,res,next)=>{if(!req.liveWorkbook)return next();fail(409,'В совместном режиме сохраняется общая версия таблицы, а не отдельная копия.');}));
  app.get('/workbook-helper/v1/live/state',intercept,handler(async(req,res)=>{
    if(!req.liveWorkbook)fail(401,'Требуется доступ совместного помощника');res.setHeader('Cache-Control','no-store');res.json({...store.liveWorkbooks.response(req.liveWorkbook.mode.key,Number(req.query.since??-1)),fileRevision:req.liveWorkbook.card.solutions[req.liveWorkbook.asset.id]?.revision||0});
  }));
  app.post('/workbook-helper/v1/live/presence',intercept,handler(async(req,res)=>{
    if(!req.liveWorkbook)fail(401,'Требуется доступ совместного помощника');
    const {mode,entry}=req.liveWorkbook,state=store.liveWorkbooks.read(mode.key).state;
    res.setHeader('Cache-Control','no-store');
    res.json({...presence.exchange(mode.key,liveDigest(parseWorkbookHelperAuthorization(req.headers.authorization)),entry.auth,req.body.selection,store.now()),revision:state?.revision||0});
  }));
  app.post('/workbook-helper/v1/live/initialize',intercept,handler(async(req,res)=>{
    if(!req.liveWorkbook)fail(401,'Требуется доступ совместного помощника');const {mode}=req.liveWorkbook;
    if(req.body.sourceHash!==mode.sourceHash)fail(409,'Исходный файл уже изменён. Откройте общую таблицу заново.');
    res.json(await store.liveWorkbooks.initialize(mode.key,req.body.book,mode.sourceHash));
  }));
  app.post('/workbook-helper/v1/live/sync',intercept,handler(async(req,res)=>{
    if(!req.liveWorkbook)fail(401,'Требуется доступ совместного помощника');const {mode,entry}=req.liveWorkbook;
    res.setHeader('Cache-Control','no-store');res.json({...await store.liveWorkbooks.submit(mode.key,actor(entry.auth),req.body.command,Number(req.body.since??-1),store.now()),fileRevision:req.liveWorkbook.card.solutions[req.liveWorkbook.asset.id]?.revision||0});
  }));
  app.post('/workbook-helper/v1/live/checkpoint',intercept,uploads.single('file'),handler(async(req,res)=>{
    if(!req.liveWorkbook||!req.file)fail(400,'Файл общей версии не получен');const {mode,entry,run,card}=req.liveWorkbook,revision=Number(req.body.liveRevision);
    const result=await store.liveWorkbooks.checkpoint(mode.key,revision,()=>store.lock(()=>store.saveSolution({auth:entry.auth,run,card,assetId:entry.assetId,buffer:req.file.buffer,name:req.file.originalname,revision:Number(req.body.revision),hash:req.body.contentHash,viaHelper:true,liveEpoch:mode.epoch})));
    res.json({revision:result.revision,contentHash:result.hash,liveRevision:revision,fileName:result.name,solutionName:result.name});
  }));
}

import fs from 'node:fs';
import crypto from 'node:crypto';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const staff=auth=>{if(!['teacher','admin'].includes(auth?.role)||!auth.id)fail(403,'Обмен доступен преподавателям');};
const references=set=>[...new Set([...(set.theoryImages||[]),...set.tasks.flatMap(task=>[...task.images,...task.attachments.map(file=>file.assetId)])])];
const clone=value=>structuredClone(value);

// Explicit publication keeps autosaved, incomplete edits out of another teacher's library.
export class PreparedSetExchange {
  constructor(store,teachers){this.store=store;this.teachers=teachers;}
  active(auth){staff(auth);if(auth.role!=='admin'&&!this.teachers().some(person=>person.id===auth.id&&!person.deletedAt))fail(403,'Аккаунт преподавателя недоступен');}
  directory(auth){this.active(auth);return this.teachers().filter(person=>!person.deletedAt&&person.id!==auth.id).map(person=>({id:person.id,name:person.name||'Преподаватель'}));}
  owned(auth,id){this.active(auth);const set=this.store.data.sets[id];if(!set||set.teacherId!==auth.id)fail(404,'Набор не найден');return set;}
  sharing(auth,id){const set=this.owned(auth,id),share=this.store.data.setShares?.[id];return {id:set.id,version:share?.version||0,recipientIds:share?.recipientIds||[],publishedSetVersion:share?.snapshot?.version||0,publishedAt:share?.publishedAt||null};}
  available(auth,id){
    this.active(auth);const share=this.store.data.setShares?.[id];
    if(!share?.snapshot||!share.recipientIds.includes(auth.id)||!this.teachers().some(person=>person.id===share.teacherId&&!person.deletedAt))fail(404,'Доступ к набору закрыт');
    return share;
  }
  author(id){return this.teachers().find(person=>person.id===id)?.name||'Преподаватель';}
  catalog(auth){
    this.active(auth);const shares=Object.values(this.store.data.setShares||{});
    return {teachers:this.directory(auth),sets:shares.filter(share=>share.snapshot&&share.recipientIds.includes(auth.id)&&this.teachers().some(person=>person.id===share.teacherId&&!person.deletedAt)).map(share=>{
      const set=share.snapshot,copy=Object.values(this.store.data.sets).find(row=>row.teacherId===auth.id&&row.copiedFrom?.setId===set.id&&row.copiedFrom?.setVersion===set.version);
      return {id:set.id,name:set.name,taskNumber:set.taskNumber,partNumber:set.partNumber,taskCount:set.tasks.length,authorName:this.author(share.teacherId),version:share.version,setVersion:set.version,publishedAt:share.publishedAt,copyId:copy?.id||''};
    }).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))};
  }
  publish(auth,id,input){
    const set=this.owned(auth,id),old=this.store.data.setShares?.[id];
    if(Number(input.version)!==(old?.version||0))fail(409,'Доступ изменён в другом окне. Откройте настройки заново.');
    const allowed=new Set(this.directory(auth).map(person=>person.id));
    if(!Array.isArray(input.recipientIds)||input.recipientIds.length>1000||input.recipientIds.some(value=>typeof value!=='string'||!allowed.has(value)))fail(400,'Выберите преподавателя из списка');
    const recipientIds=[...new Set(input.recipientIds)];
    if(recipientIds.length){
      if(set.draft)fail(409,'Заполните условия и ответы и сохраните набор перед публикацией. Закрыть доступ можно и для черновика.');
      this.assets(set);
    }
    const share={teacherId:auth.id,version:(old?.version||0)+1,recipientIds,snapshot:recipientIds.length?clone(set):old?.snapshot||null,publishedAt:new Date(this.store.now()).toISOString()};
    this.store.data.setShares||={};this.store.data.setShares[id]=share;
    try{this.store.save();}catch(error){if(old)this.store.data.setShares[id]=old;else delete this.store.data.setShares[id];throw error;}
    return this.sharing(auth,id);
  }
  assets(set){
    return references(set).map(id=>{
      const asset=this.store.data.assets[id];
      if(!asset||asset.teacherId!==set.teacherId||!fs.existsSync(this.store.assetFile(asset)))fail(409,'Один из файлов набора недоступен. Попросите автора обновить набор.');
      return asset;
    });
  }
  preview(auth,id){
    const share=this.available(auth,id),set=share.snapshot;
    const assetView=assetId=>({...this.store.assetView(assetId),url:`/api/lesson-task-exchange/${id}/assets/${assetId}`});
    return {version:share.version,authorName:this.author(share.teacherId),set:{id:set.id,name:set.name,taskNumber:set.taskNumber,partNumber:set.partNumber,version:set.version,theoryImages:set.theoryImages||[],theoryImageFiles:(set.theoryImages||[]).map(assetView),tasks:set.tasks.map(task=>({...task,imageFiles:task.images.map(assetView),attachments:task.attachments.map(file=>({name:file.name,runtime:file.runtime,runtimeName:file.runtimeName,...assetView(file.assetId)}))}))}};
  }
  asset(auth,id,assetId){const share=this.available(auth,id);if(!references(share.snapshot).includes(assetId))fail(404,'Файл не найден');const asset=this.store.data.assets[assetId];if(!asset||asset.teacherId!==share.teacherId)fail(404,'Файл не найден');return asset;}
  copy(auth,id,input){
    const share=this.available(auth,id),set=share.snapshot;
    if(Number(input.version)!==share.version)fail(409,'Автор обновил набор или доступ. Откройте предпросмотр заново.');
    const previous=Object.values(this.store.data.sets).find(row=>row.teacherId===auth.id&&row.copiedFrom?.setId===set.id&&row.copiedFrom?.setVersion===set.version);
    if(previous)return {set:this.store.setView(previous),alreadyCopied:true};
    const assets=this.assets(set),ids=new Map(assets.map(asset=>[asset.id,crypto.randomUUID()]));
    const copy={...clone(set),id:crypto.randomUUID(),teacherId:auth.id,version:1,updatedAt:new Date(this.store.now()).toISOString(),copiedFrom:{setId:set.id,setVersion:set.version,teacherId:share.teacherId,authorName:this.author(share.teacherId)},theoryImages:(set.theoryImages||[]).map(id=>ids.get(id)),tasks:set.tasks.map(task=>({...clone(task),id:crypto.randomUUID(),images:task.images.map(image=>ids.get(image)),attachments:task.attachments.map(file=>({...clone(file),assetId:ids.get(file.assetId),sourceFileId:''}))}))};
    for(const asset of assets)this.store.data.assets[ids.get(asset.id)]={...clone(asset),id:ids.get(asset.id),teacherId:auth.id};
    this.store.data.sets[copy.id]=copy;
    try{this.store.save();}catch(error){delete this.store.data.sets[copy.id];for(const id of ids.values())delete this.store.data.assets[id];throw error;}
    return {set:this.store.setView(copy),alreadyCopied:false};
  }
}

const route=fn=>async(req,res)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');try{staff(req.auth);await fn(req,res);}catch(error){res.status(error.status||500).json({error:error.status?error.message:'Не удалось выполнить обмен наборами'});}};
export function registerPreparedSetExchangeRoutes(app,store,teachers){
  const exchange=new PreparedSetExchange(store,teachers);
  app.get('/api/lesson-task-set-exchange',route((req,res)=>res.json(exchange.catalog(req.auth))));
  app.get('/api/lesson-task-sets/:id/sharing',route((req,res)=>res.json(exchange.sharing(req.auth,req.params.id))));
  app.put('/api/lesson-task-sets/:id/sharing',route(async(req,res)=>res.json(await store.lock(()=>exchange.publish(req.auth,req.params.id,req.body)))));
  app.get('/api/lesson-task-exchange/:id',route((req,res)=>res.json(exchange.preview(req.auth,req.params.id))));
  app.get('/api/lesson-task-exchange/:id/assets/:assetId',route((req,res)=>{const asset=exchange.asset(req.auth,req.params.id,req.params.assetId);res.type(asset.mime);if(!asset.mime.startsWith('image/'))res.attachment(asset.name);res.sendFile(store.assetFile(asset));}));
  app.post('/api/lesson-task-exchange/:id/copy',route(async(req,res)=>res.status(201).json(await store.lock(()=>exchange.copy(req.auth,req.params.id,req.body)))));
  return exchange;
}

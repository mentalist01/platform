import fs from 'node:fs';
import {effectivePreparedReferences} from './preparedReferencePromotion.js';
import {preparedReferenceName} from './preparedReferenceName.js';

const staff=auth=>['teacher','admin'].includes(auth?.role);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const supported=name=>/\.(xlsx?|xlsm|ods|fods|csv|tsv|txt|pdf|py|zip)$/i.test(name||'');
const limit=64*1024*1024;

export function uploadPreparedReference(store,auth,file){
  if(!staff(auth))fail(403,'Готовое решение добавляет преподаватель');
  if(!file?.buffer?.length)fail(400,'Выберите файл готового решения');
  if(file.buffer.length>limit)fail(413,'Готовое решение должно быть не больше 64 МБ');
  if(!supported(file.originalname))fail(400,'Выберите таблицу, PDF, текст, Python или ZIP');
  return store.putAsset(auth,file.buffer,preparedReferenceName(file.originalname),'application/octet-stream');
}

export function normalizePreparedReferences(store,auth,refs,sources){
  if(refs===undefined)return [];
  if(!Array.isArray(refs)||refs.length>8)fail(400,'К задаче можно прикрепить до 8 файлов готового решения');
  const result=[];
  for(const ref of refs){
    if(!ref||typeof ref!=='object')fail(400,'Некорректный файл готового решения');
    let asset=store.data.assets[ref.assetId];
    if(asset&&asset.teacherId!==auth.id)fail(403,'Нет доступа к готовому решению');
    if(!asset){
      const source=sources.find(file=>file.id===ref.sourceFileId);
      if(!source?.path||!fs.existsSync(source.path))fail(404,'Файл готового решения из конспектов недоступен');
      if(!supported(source.name))fail(400,'Выберите таблицу, PDF, текст, Python или ZIP');
      if(fs.statSync(source.path).size>limit)fail(413,'Готовое решение больше 64 МБ');
      asset=store.putAsset(auth,fs.readFileSync(source.path),source.name,'application/octet-stream');
    }
    if(!supported(asset.name)||asset.size>limit||!fs.existsSync(store.assetFile(asset)))fail(400,'Файл готового решения недоступен');
    if(result.some(file=>file.assetId===asset.id||ref.sourceFileId&&file.sourceFileId===ref.sourceFileId))continue;
    result.push({assetId:asset.id,name:asset.name,sizeBytes:asset.size,...(typeof ref.sourceFileId==='string'?{sourceFileId:ref.sourceFileId.slice(0,160)}:{})});
  }
  return result;
}

export function preparedReferenceView(store,task,run,card,canManage){
  const files=effectivePreparedReferences(store,task,run);if(!files.length)return null;
  const available=canManage||card.status==='solved';
  return {available,files:available?files.map(ref=>{const asset=store.data.assets[ref.assetId];return asset?{id:asset.id,name:asset.name,sizeBytes:asset.size,url:`/api/lesson-task-runs/${run.id}/cards/${card.id}/reference-solution/${asset.id}`} : null;}).filter(Boolean):[]};
}

export async function preparedReferenceAsset(store,auth,runId,cardId,assetId){
  const {run,access}=await store.getRun(auth,runId),card=run.cards.find(row=>row.id===cardId);
  if(!card||!effectivePreparedReferences(store,run.tasks[card.index],run).some(file=>file.assetId===assetId))fail(404,'Готовое решение не найдено');
  if(!(staff(auth)&&!access.readOnly)&&card.status!=='solved')fail(403,'Готовое решение откроется после правильного ответа');
  const asset=store.data.assets[assetId];if(!asset||!fs.existsSync(store.assetFile(asset)))fail(404,'Готовое решение недоступно');
  return asset;
}

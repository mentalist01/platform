import fs from 'node:fs';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';
import {currentWorkbookSolution} from './preparedWorkbookHistory.js';
import {preparedReferenceName} from './preparedReferenceName.js';
import {preparedCheckingChanged} from '../src/utils/preparedTaskContent.js';
import {preparedSolutionEntries} from './preparedSetRemoval.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const workbook=name=>/\.(xlsx?|xlsm|ods|fods|csv|tsv)$/i.test(name||'');
const sameTask=(before,after)=>!preparedCheckingChanged(before,after)
  &&JSON.stringify(before.images)===JSON.stringify(after.images)
  &&JSON.stringify(before.attachments.map(file=>file.assetId))===JSON.stringify(after.attachments.map(file=>file.assetId));
const sourceFor=(store,run,task)=>{
  const source=preparedTaskSource(run,task),set=store.data.sets[source.id];
  return set?.teacherId===run.teacherId?{set,task:set.tasks.find(row=>row.id===source.taskId)}:{};
};
const dismissalKey=(run,task)=>{
  const source=preparedTaskSource(run,task);
  return source.id&&source.taskId?JSON.stringify([run.teacherId,source.id,source.taskId]):'';
};
const isDismissed=(store,run,card)=>Boolean(card.referencePromotionDismissed||store.data.referencePromotionDismissals?.[dismissalKey(run,run.tasks[card.index])]);

// A "no" belongs to the library task, not just one pupil's copy of its card.
// Keep existing declines when upgrading without changing lessons or answers.
export function migratePreparedReferenceDismissals(store){
  let changed=false;
  for(const run of Object.values(store.data.runs))for(const {card,task} of preparedSolutionEntries(run)){
    if(!card.referencePromotionDismissed)continue;
    if(!task)continue;
    const key=dismissalKey(run,task);if(!key||store.data.referencePromotionDismissals?.[key])continue;
    store.data.referencePromotionDismissals||={};store.data.referencePromotionDismissals[key]=new Date(store.now()).toISOString();changed=true;
  }
  if(changed)store.save();
}

export function preparedReferencePromotionState(store,run,card){
  const offer=preparedReferencePromotionView(store,run,card,true,{manual:true});
  const source=sourceFor(store,run,run.tasks[card.index]);
  const replacement=!run.homework&&source.task?.referenceSolutions?.length
    &&sameTask(run.tasks[card.index],source.task);
  const state=!offer?{referencePromotion:null}:isDismissed(store,run,card)
    ?{referencePromotion:null,referencePromotionAvailable:offer}:{referencePromotion:offer};
  return {...state,...(replacement?{referenceReplacementAvailable:true}:{})};
}

// A published library copy is also discoverable after a crash between saving
// the library and refreshing individual run snapshots. Downloads remain gated.
export function effectivePreparedReferences(store,task,run){
  const source=sourceFor(store,run,task);
  // Prefer the published copy during recovery if a crash interrupted updating
  // the lesson snapshots after the library was saved.
  if(source.task&&sameTask(task,source.task)
    &&Array.isArray(source.task.referenceSolutions)
    &&(!source.task.referenceSolutions.length||source.task.referenceSolutions.some(ref=>store.data.assets[ref.assetId]?.generatedReference===true))){
    return source.task.referenceSolutions;
  }
  return task.referenceSolutions||[];
}

async function publishReferenceFiles(store,run,source,references,replaceExisting=false){
  source.task.referenceSolutions=references;
  source.set.version++;source.set.updatedAt=new Date(store.now()).toISOString();
  store.save();
  for(const current of Object.values(store.data.runs)){
    if(current.teacherId!==run.teacherId)continue;
    let changed=false;
    for(const row of current.tasks){
      const origin=preparedTaskSource(current,row);
      if(origin.id===source.set.id&&origin.taskId===source.task.id
        &&(replaceExisting||!row.referenceSolutions?.length)&&sameTask(row,source.task)){
        row.referenceSolutions=structuredClone(references);changed=true;
      }
    }
    if(changed){current.version++;store.save(current);await store.notify(current);}
  }
}

async function replacementContext(store,auth,runId,cardId){
  const {run,access}=await store.getRun(auth,runId,true);
  if(!['teacher','admin'].includes(auth.role)||auth.id!==run.teacherId||access.readOnly||run.homework){
    fail(403,'Разбор заменяет преподаватель этого набора на доске урока');
  }
  const card=run.cards.find(row=>row.id===cardId);
  if(!card)fail(404,'Задача не найдена');
  const task=run.tasks[card.index],source=sourceFor(store,run,task);
  if(!source.task?.referenceSolutions?.length||!sameTask(task,source.task)){
    fail(409,'Задача в наборе изменилась. Обновите её на доске перед заменой разбора.');
  }
  return {run,card,task,source};
}

export async function preparedReferenceReplacementView(store,auth,runId,cardId){
  const {run,card,task,source}=await replacementContext(store,auth,runId,cardId);
  const files=task.attachments.flatMap(attachment=>{
    const solution=currentWorkbookSolution(card,attachment.assetId);
    return solution&&workbook(solution.name)&&solution.size>0&&solution.size<=64*1024*1024
      ?[{assetId:attachment.assetId,...store.solutionView(solution),name:preparedReferenceName(solution.name)}]:[];
  });
  return {
    setName:source.set.name,
    expectedSetVersion:source.set.version,
    expectedReferenceIds:source.task.referenceSolutions.map(ref=>ref.assetId),
    references:source.task.referenceSolutions.map(ref=>({id:ref.assetId,name:ref.name||store.data.assets[ref.assetId]?.name||'Разбор'})),
    files,
  };
}

export async function replacePreparedReference(store,auth,runId,cardId,input={}){
  const {run,card,task,source}=await replacementContext(store,auth,runId,cardId);
  const references=source.task.referenceSolutions;
  if(input.expectedSetVersion!==source.set.version
    ||JSON.stringify(input.expectedReferenceIds)!==JSON.stringify(references.map(ref=>ref.assetId))){
    fail(409,'Разбор или набор уже изменён. Проверьте обновлённые файлы и повторите замену.');
  }
  if(!references.some(ref=>ref.assetId===input.referenceId))fail(409,'Выбранный разбор уже изменён');
  if(input.action==='remove'){
    const next=references.filter(ref=>ref.assetId!==input.referenceId);
    if(!next.length){
      store.data.referencePromotionDismissals||={};
      store.data.referencePromotionDismissals[dismissalKey(run,task)]=new Date(store.now()).toISOString();
    }
    await publishReferenceFiles(store,run,source,next,true);
    return {removed:true};
  }
  if(input.action&&input.action!=='replace')fail(400,'Выберите замену или удаление разбора');
  let file;
  if(input.referenceAssetId){
    file=store.data.assets[input.referenceAssetId];
    if(!file||file.teacherId!==auth.id)fail(403,'Нет доступа к выбранному файлу разбора');
    if(file.size<=0||file.size>64*1024*1024||!/\.(xlsx?|xlsm|ods|fods|csv|tsv|txt|pdf|py|zip)$/i.test(file.name)){
      fail(400,'Выберите таблицу, PDF, текст, Python или ZIP размером до 64 МБ');
    }
  }else{
    if(!task.attachments.some(attachment=>attachment.assetId===input.assetId))fail(404,'Файл этой задачи не найден');
    file=currentWorkbookSolution(card,input.assetId);
    if(!file||file.id!==input.solutionId||file.revision!==input.revision){
      fail(409,'На доске появилось новое сохранение. Проверьте его перед заменой разбора.');
    }
    if(!workbook(file.name)||file.size<=0||file.size>64*1024*1024)fail(400,'Выберите сохранённую таблицу размером до 64 МБ');
  }
  const location=store.assetFile(file);
  if(!fs.existsSync(location))fail(404,'Выбранный файл недоступен');
  const asset=store.putAsset(auth,fs.readFileSync(location),preparedReferenceName(file.name),'application/octet-stream');
  asset.generatedReference=true;
  const next=references.map(ref=>ref.assetId===input.referenceId
    ?{assetId:asset.id,name:asset.name,sizeBytes:asset.size}:ref);
  await publishReferenceFiles(store,run,source,next,true);
  return {replaced:true,name:asset.name};
}

export function preparedReferencePromotionView(store,run,card,canManage,{manual=false}={}){
  if(!canManage||run.homework||card.status!=='solved'||!manual&&isDismissed(store,run,card))return null;
  const task=run.tasks[card.index],source=sourceFor(store,run,task);
  if(!source.task||source.task.referenceSolutions?.length||task.referenceSolutions?.length||!sameTask(task,source.task))return null;
  const files=task.attachments.flatMap(attachment=>{
    const solution=currentWorkbookSolution(card,attachment.assetId);
    return solution?.viaHelper&&workbook(solution.name)&&solution.size>0&&solution.size<=64*1024*1024
      ?[{assetId:attachment.assetId,...store.solutionView(solution),name:preparedReferenceName(solution.name)}]:[];
  });
  return files.length?{setName:source.set.name,taskTitle:task.title||String(source.set.tasks.indexOf(source.task)+1),files}:null;
}

export async function promotePreparedReference(store,auth,runId,cardId,input={}){
  const {run,access}=await store.getRun(auth,runId,true);
  if(!['teacher','admin'].includes(auth.role)||auth.id!==run.teacherId||access.readOnly)fail(403,'Готовый разбор подтверждает преподаватель этого набора');
  const card=run.cards.find(row=>row.id===cardId);
  if(!card)fail(404,'Задача не найдена');
  if(input.action==='dismiss'&&isDismissed(store,run,card))return {attached:false,dismissed:true};
  const offer=preparedReferencePromotionView(store,run,card,true,{manual:true});
  if(!offer)fail(409,'Предложение уже изменилось: обновите задачу. Готовое решение не заменено.');
  if(input.action==='dismiss'){
    const key=dismissalKey(run,run.tasks[card.index]);
    store.data.referencePromotionDismissals||={};store.data.referencePromotionDismissals[key]=new Date(store.now()).toISOString();
    store.save();card.referencePromotionDismissed=true;run.version++;store.save(run);await store.notify(run);
    return {attached:false,dismissed:true};
  }
  if(input.action!=='attach')fail(400,'Подтвердите добавление разбора');
  const file=offer.files.find(row=>row.assetId===input.assetId&&row.id===input.solutionId);
  if(!file||file.revision!==Number(input.revision))fail(409,'Таблица сохранилась заново. Проверьте последнюю версию перед добавлением разбора.');
  const solution=currentWorkbookSolution(card,file.assetId),task=run.tasks[card.index],source=sourceFor(store,run,task);
  const location=store.assetFile(solution);
  if(!fs.existsSync(location))fail(404,'Сохранённая таблица недоступна');
  const asset=store.putAsset(auth,fs.readFileSync(location),preparedReferenceName(solution.name),'application/octet-stream');
  asset.generatedReference=true;
  const references=[{assetId:asset.id,name:asset.name,sizeBytes:asset.size}];
  // Only reference metadata changes. Answers, attempts, history, code, board
  // anchors and ink are retained, including in other pupils' existing runs.
  await publishReferenceFiles(store,run,source,references);
  return {attached:true,name:asset.name};
}

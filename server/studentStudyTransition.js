import {studyPlanStages} from '../src/utils/studyPlanStages.js';
import {MAX_BOARD_PAGES,boardPageRoom} from '../src/utils/boardPages.js';
import {studyTopic,nextStudyStep,studyPageSuggestion,studyPartKey,studyPartCount} from '../src/utils/studentStudyProgress.js';
import {preparedSetParts,preparedPartTaskNumber} from '../src/utils/preparedSetParts.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const partTopic=(set,part)=>studyTopic(preparedPartTaskNumber(set,part),part);
export function studyTransitionPreview(store,auth,record,plan,pages) {
  const next=nextStudyStep(plan,record);
  if(!record.current?.completed||!next)return {next:null,parts:[],sets:[]};
  const sets=Object.values(store.prepared.data.sets).filter(set=>set.teacherId===auth.id&&!set.draft&&studyTopic(set.taskNumber)?.blockId===next.blockId).map(set=>({id:set.id,name:set.name,version:set.version,parts:preparedSetParts(set).map(part=>({...part,partNumber:partTopic(set,part.partNumber).partNumber,sourcePartNumber:part.partNumber,titles:part.taskIds.map(id=>set.tasks.find(task=>task.id===id).title)}))}));
  const count=Math.max(studyPartCount(plan,record,next.blockId),...sets.flatMap(set=>set.parts.map(part=>part.partNumber)));
  const linked=(page,part)=>{const link=record.links[page.id]||studyPageSuggestion(page,pages);return link?.blockId===next.blockId&&link.partNumber===part;};
  const linkedParent=pages.find(page=>record.links[page.id]?.blockId===next.blockId&&page.parentId)?.parentId;
  const roots=pages.filter(page=>!page.parentId&&studyPageSuggestion(page,pages)?.blockId===next.blockId);
  const parent=pages.find(page=>page.id===linkedParent)||(roots.length===1?roots[0]:null);
  const split=plan.stages&&studyPlanStages(plan).filter(stage=>stage.blockId===next.blockId).length>1;
  const stage=split&&studyPlanStages(plan).find(stage=>stage.blockId===next.blockId&&next.partNumber>=stage.fromPart&&next.partNumber<=stage.toPart);
  const start=stage?.fromPart||1,end=stage?.toPart||count;
  const parts=Array.from({length:end-start+1},(_,offset)=>{
    const i=start+offset-1;
    const partNumber=i+1,existing=pages.find(page=>record.links[page.id]?.blockId===next.blockId&&record.links[page.id]?.partNumber===partNumber)||pages.find(page=>page.parentId===parent?.id&&linked(page,partNumber));
    const candidates=sets.flatMap(set=>set.parts.filter(part=>part.partNumber===partNumber).map(part=>({setId:set.id,version:set.version,sourcePartNumber:part.sourcePartNumber,count:part.taskIds.length})));
    const hasRun=Boolean(existing&&store.prepared.data.active[boardPageRoom(`board-${auth.id}-${record.studentId}`,existing.id)]);
    return {partNumber,name:plan.blocks[next.blockId]?.parts[i]||`Часть ${partNumber}`,existingPageId:existing?.id||'',existingPageTitle:existing?.title||'',hasRun,suggested:candidates.length===1?candidates[0]:null};
  });
  return {next,useParent:count>1,parent:parent?{id:parent.id,title:parent.title}:null,name:`Задание №${next.blockId}`,parts,sets,pending:record.stageSetup?.status==='pending'?record.stageSetup:null};
}

// Every created page is journalled immediately. A retried request resumes the
// same operation, including after a server restart, without duplicating pages.
export async function prepareStudyTransition(store,{auth,student,record,input,plan,pages,save}) {
  const preview=studyTransitionPreview(store,auth,record,plan,pages);
  if(!preview.next)fail(409,'Сначала завершите текущую часть. Следующий этап должен быть в плане.');
  if(!/^[a-f0-9-]{36}$/.test(input.operationId||''))fail(400,'Некорректный переход');
  let operation=record.stageSetup;
  if(operation?.status==='pending'&&operation.id!==input.operationId)fail(409,'Предыдущая подготовка не завершена. Продолжите её в окне перехода.');
  if(!operation||operation.id!==input.operationId) {
    if(input.blockId!==preview.next.blockId||Number(input.partNumber)!==preview.next.partNumber)fail(409,'Следующий этап изменился. Откройте окно перехода заново.');
    if(!Array.isArray(input.parts)||input.parts.length!==preview.parts.length)fail(400,'Настройте все части следующей темы');
    const unique=new Set(),parts=[];
    for(const part of input.parts) {
      const number=Number(part.partNumber),expected=preview.parts.find(row=>row.partNumber===number);
      if(!expected||unique.has(number)||typeof part.name!=='string'||!part.name.trim()||part.name.trim().length>80)fail(400,'Проверьте названия и номера частей');unique.add(number);
      let existingPage=null;
      if(part.existingPageId) {
        const existing=pages.find(page=>page.id===part.existingPageId);
        if(!existing||existing.id!==expected.existingPageId)fail(409,'Связанная страница изменилась. Обновите окно перехода.');
        existingPage=existing;
        if(expected.hasRun){parts.push({partNumber:number,name:existing.title,pageId:existing.id,existing:true,hasRun:true});continue;}
      }
      if(part.setId) {
        const set=store.prepared.data.sets[part.setId],source=Number(part.sourcePartNumber),topic=set&&partTopic(set,source);
        if(!set||set.teacherId!==auth.id||set.draft||set.version!==Number(part.version))fail(409,'Выбранный набор изменён или недоступен. Обновите окно перехода.');
        if(topic?.blockId!==preview.next.blockId||topic.partNumber!==number||!preparedSetParts(set).some(row=>row.partNumber===source))fail(400,'В выбранном наборе нет этой части. Отметьте начало следующей части в редакторе набора.');
        parts.push({partNumber:number,name:existingPage?.title||part.name.trim(),setId:set.id,setVersion:set.version,sourcePartNumber:source,pageId:existingPage?.id||'',existing:Boolean(existingPage)});
      } else parts.push({partNumber:number,name:existingPage?.title||part.name.trim(),pageId:existingPage?.id||'',existing:Boolean(existingPage)});
    }
    if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80)fail(400,'Укажите название страницы задания');
    const parentId=preview.parent?.id||'';
    if(pages.length+parts.filter(part=>!part.pageId).length+(preview.useParent&&!parentId?1:0)>MAX_BOARD_PAGES)fail(409,'На доске недостаточно места для новых страниц');
    operation={id:input.operationId,blockId:preview.next.blockId,partNumber:preview.next.partNumber,name:input.name.trim(),useParent:preview.useParent,parentId,parts:parts.sort((a,b)=>a.partNumber-b.partNumber),status:'pending',createdAt:new Date().toISOString()};
    record.stageSetup=operation;await save();
  }
  // Recheck all sets and already-created pages before resuming a partial setup.
  for(const part of operation.parts) {
    if(part.setId){const set=store.prepared.data.sets[part.setId];if(!set||set.teacherId!==auth.id||(!part.runId&&(set.draft||set.version!==part.setVersion)))fail(409,'Набор изменился во время подготовки. Нажмите «Изменить подготовку», выберите актуальный набор и повторите.');}
    if(part.pageId&&!pages.some(page=>page.id===part.pageId))fail(409,'Подготовленная страница удалена. Восстановите её перед продолжением перехода.');
  }
  if(operation.parentId&&!pages.some(page=>page.id===operation.parentId))fail(409,'Страница задания удалена. Восстановите её перед продолжением.');
  const create=async(name,parentId='',key='parent')=>store.createPage(student,{action:'create',name,parentId,creationKey:`study:${operation.id}:${key}`});
  const useParent=operation.useParent??operation.parts.length>1;
  if(useParent&&!operation.parentId) {
    const page=await create(operation.name);operation.parentId=page.id;await save();
  }
  for(const part of operation.parts) {
    if(!part.pageId){const page=await create(useParent?part.name:operation.name,useParent?operation.parentId:'',String(part.partNumber));part.pageId=page.id;record.links[part.pageId]={blockId:operation.blockId,partNumber:part.partNumber};await save();}
    record.links[part.pageId]={blockId:operation.blockId,partNumber:part.partNumber};
    if(part.setId&&!part.runId) {
      const run=await store.prepared.start(auth,{room:boardPageRoom(`board-${auth.id}-${student.id}`,part.pageId),setId:part.setId,setVersion:part.setVersion,partNumber:part.sourcePartNumber,x:120,y:100});
      part.runId=run.id;await save();
    }
  }
  const selected=operation.parts.find(part=>part.partNumber===operation.partNumber),now=new Date().toISOString();
  const position=store.position(auth,student.id,selected.pageId);
  record.current={blockId:operation.blockId,partNumber:selected.partNumber,pageId:selected.pageId,pageTitle:useParent?selected.name:operation.name,completed:false,updatedAt:now,...(position?.blockId===operation.blockId&&position.partNumber===selected.partNumber?position:{})};
  delete record.completed[studyPartKey(operation.blockId,selected.partNumber)];operation.status='done';operation.completedAt=now;await save();
  return selected.pageId;
}

import {preparedSetPartTasks,preparedTaskPartNumber,preparedPartTaskNumber} from './preparedSetParts.js';
import {preparedFileSync} from './preparedFileSync.js';
import {preparedAnswerTableChanged} from './preparedAnswerTable.js';
import {preparedTaskContentChanged} from './preparedTaskContent.js';

export const isPreparedTheory = task => task?.kind==='theory';
export function preparedTheorySequence(set,mode=set.theoryMode) {
  const images=set.theoryImages||[],base={kind:'theory',format:'theory',answers:[],attachments:[],sourceIndex:-1};
  if(!images.length)return [];
  return mode==='steps'?images.map((image,index)=>({...base,id:`theory-${set.id}-sheet-${index+1}`,title:`Теория · ${index+1}`,images:[image],theoryStep:{index,count:images.length}})):
    [{...base,id:`theory-${set.id}`,title:'Теория',images:[...images]}];
}
// A lesson keeps its opening format. Never split an annotated legacy card or
// collapse existing sheets when the library's display preference changes.
export function preparedMissingTheory(run,set,sequence=preparedSetSequence(set,run.partFilters?.[set.id])) {
  const current=run.tasks.filter(task=>isPreparedTheory(task)&&preparedTaskSource(run,task).id===set.id);
  if(current.some(task=>!task.theoryStep))return [];
  const candidates=current.length?preparedTheorySequence(set,'steps'):sequence.filter(isPreparedTheory);
  const known=new Set(current.map(task=>preparedTaskSource(run,task).taskId));
  return candidates.filter(task=>!known.has(task.id));
}
export function preparedSetSequence(set,partNumber) {
  const tasks=preparedSetPartTasks(set,partNumber),split=set.tasks.some(task=>task.startsPart===true);
  const mapped=partNumber!==undefined||split||set.theoryImages?.length?tasks.map(task=>({...task,sourceIndex:set.tasks.indexOf(task),...(split||partNumber!==undefined?{sourcePartNumber:preparedTaskPartNumber(set,set.tasks.indexOf(task)),sourceTaskNumber:preparedPartTaskNumber(set,preparedTaskPartNumber(set,set.tasks.indexOf(task)))}:{})})):tasks;
  if(!set.theoryImages?.length||partNumber!==undefined&&Number(partNumber)!==Number(set.partNumber||1))return mapped;
  return [...preparedTheorySequence(set),...mapped];
}

// Legacy runs keep their original identity. Only newly appended tasks carry
// source metadata, so existing cards, answers and code links never move.
export function preparedTaskSource(run,task,index) {
  return {id:task?.sourceSetId||run.setId,name:task?.sourceSetName||run.name,
    taskNumber:task?.sourceTaskNumber||run.taskNumber,partNumber:task?.sourcePartNumber||run.partNumber,
    version:task?.sourceSetVersion||run.setVersion,taskId:task?.sourceTaskId||task?.id,
    index:task?.sourceIndex??index??run.tasks.indexOf(task)};
}
export function preparedRunSources(run) {
  const sources=[];
  for(const [index,task]of run.tasks.entries()) {
    const source=preparedTaskSource(run,task,index);
    let row=sources.find(row=>row.id===source.id);
    if(!row){row={id:source.id,name:source.name,taskNumber:source.taskNumber,partNumber:source.partNumber,version:source.version,total:0,hasTheory:false,firstIndex:index};sources.push(row);}
    if(isPreparedTheory(task))row.hasTheory=true;else row.total++;
  }
  return sources;
}
export function preparedSourceLatest(run,set) {
  if(!set)return [];
  return run.tasks.flatMap((task,index)=>{
    const source=preparedTaskSource(run,task,index);
    if(source.id!==set.id)return [];
    const sheet=task.theoryStep;
    const latest=isPreparedTheory(task)?{...task,...(sheet?{images:set.theoryImages?.[sheet.index]?[set.theoryImages[sheet.index]]:task.images,theoryStep:{...sheet,count:Math.max(sheet.index+1,set.theoryImages?.length||0)}}:{images:[...(set.theoryImages||[])]})}:set.tasks.find(row=>row.id===source.taskId);
    return latest?[{...latest,id:task.id}]:[];
  });
}
export function preparedSourceUpdates(run,sets) {
  return preparedRunSources(run).map(source=>{
    const set=sets[source.id],sequence=set?preparedSetSequence(set,run.partFilters?.[source.id]):[],latest=preparedSourceLatest(run,set),byId=new Map(latest.map(task=>[task.id,task]));
    const known=new Set(run.tasks.filter(task=>preparedTaskSource(run,task).id===source.id).map(task=>preparedTaskSource(run,task).taskId));
    return {...source,setVersion:set?.version||source.version,
      contentUpdateAvailable:Boolean(set&&!set.draft&&(set.name!==source.name||run.tasks.some(task=>{const row=byId.get(task.id);return row&&preparedTaskContentChanged(task,row);}))),
      theoryUpdateAvailable:Boolean(set&&!set.draft&&preparedMissingTheory(run,set,sequence).length),
      newTasksAvailable:set&&!set.draft?sequence.filter(task=>!isPreparedTheory(task)&&!known.has(task.id)).length:0,
      filesUpdateAvailable:preparedFileSync(run.tasks,latest).changed>0,
      checkingUpdateAvailable:run.tasks.some(task=>{const row=byId.get(task.id);return row&&((task.answerMode||'combined')!==(row.answerMode||'combined')||task.format!==row.format||preparedAnswerTableChanged(task,row)||JSON.stringify(task.answerGroups||null)!==JSON.stringify(row.answerGroups||null));})};
  });
}

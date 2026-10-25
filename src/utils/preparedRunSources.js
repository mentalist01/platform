import {preparedFileSync} from './preparedFileSync.js';
import {preparedAnswerTableChanged} from './preparedAnswerTable.js';

export const isPreparedTheory = task => task?.kind==='theory';
export function preparedSetSequence(set) {
  if(!set.theoryImages?.length)return set.tasks;
  return [{id:`theory-${set.id}`,kind:'theory',title:'Теория',format:'theory',answers:[],images:[...set.theoryImages],attachments:[],sourceIndex:-1},
    ...set.tasks.map((task,index)=>({...task,sourceIndex:index}))];
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
    const latest=set.tasks.find(row=>row.id===source.taskId);
    return latest?[{...latest,id:task.id}]:[];
  });
}
export function preparedSourceUpdates(run,sets) {
  return preparedRunSources(run).map(source=>{
    const set=sets[source.id],latest=preparedSourceLatest(run,set),byId=new Map(latest.map(task=>[task.id,task]));
    const known=new Set(run.tasks.filter(task=>preparedTaskSource(run,task).id===source.id).map(task=>preparedTaskSource(run,task).taskId));
    return {...source,setVersion:set?.version||source.version,
      theoryUpdateAvailable:Boolean(set&&!set.draft&&set.theoryImages?.length&&!source.hasTheory),
      newTasksAvailable:set&&!set.draft?set.tasks.filter(task=>!known.has(task.id)).length:0,
      filesUpdateAvailable:preparedFileSync(run.tasks,latest).changed>0,
      checkingUpdateAvailable:run.tasks.some(task=>{const row=byId.get(task.id);return row&&((task.answerMode||'combined')!==(row.answerMode||'combined')||task.format!==row.format||preparedAnswerTableChanged(task,row));})};
  });
}

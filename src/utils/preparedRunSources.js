import {preparedSetPartTasks,preparedTaskPartNumber,preparedPartTaskNumber} from './preparedSetParts.js';
import {preparedFileSync} from './preparedFileSync.js';
import {preparedAnswerTableChanged} from './preparedAnswerTable.js';
import {preparedTaskContentChanged} from './preparedTaskContent.js';
import {preparedLayoutKey} from './preparedSetLayout.js';

export const isPreparedTheory = task => task?.kind==='theory';
export function preparedTheorySequence(set,mode=set.theoryMode) {
  const images=set.theoryImages||[],base={kind:'theory',format:'theory',answers:[],attachments:[],sourceIndex:-1};
  if(!images.length)return [];
  const placed=Object.values(set.theoryPlacements||{}).some(Boolean),groups=new Map();
  images.forEach((image,index)=>{const target=set.theoryPlacements?.[image]||'',before=target===set.tasks[0]?.id?'':target;if(!groups.has(before))groups.set(before,[]);groups.get(before).push({image,index});});
  return [...groups].flatMap(([before,rows])=>{
    const metadata=placed?{theoryBefore:before,...(mode==='steps'?{}:{theoryIndices:rows.map(row=>row.index)})}:{};
    return mode==='steps'?rows.map(({image,index},blockIndex)=>({...base,...metadata,id:`theory-${set.id}-sheet-${index+1}`,title:`Теория · ${index+1}`,images:[image],...(set.theoryDisplay?.[image]?{theoryDisplay:set.theoryDisplay[image]}:{}),theoryStep:{index,count:images.length,...(placed?{blockIndex,blockCount:rows.length}:{})}})):
      [{...base,...metadata,id:`theory-${set.id}${before?`-before-${before}`:''}`,title:before?'Теория между задачами':'Теория',...(set.theoryDisplay?.[rows[0].image]?{theoryDisplay:set.theoryDisplay[rows[0].image]}:{}),images:rows.map(row=>row.image)}];
  });
}
// Existing lesson cards retain their format and position. Only new theory is
// inserted at its chosen task; moving an annotated sheet remains explicit.
export function preparedMissingTheory(run,set,sequence=preparedSetSequence(set,run.partFilters?.[set.id])) {
  const current=run.tasks.filter(task=>isPreparedTheory(task)&&preparedTaskSource(run,task).id===set.id);
  if(current.some(task=>!task.theoryStep&&!task.theoryIndices))return [];
  const mode=current.length?(current.some(task=>task.theoryStep)?'steps':'together'):set.theoryMode;
  const candidates=current.length?preparedSetSequence({...set,theoryMode:mode},run.partFilters?.[set.id]).filter(isPreparedTheory):sequence.filter(isPreparedTheory);
  const known=new Set(current.map(task=>preparedTaskSource(run,task).taskId));
  return candidates.filter(task=>!known.has(task.id));
}
export function insertPreparedTheory(run,tasks,setId,added){
  const next=[...tasks];
  for(const task of added){
    const before=task.theoryBefore||'',owned=row=>preparedTaskSource(run,row).id===setId;
    const last=next.findLastIndex(row=>owned(row)&&isPreparedTheory(row)&&(row.theoryBefore||'')===before);
    const target=before&&before!=='end'?next.findIndex(row=>owned(row)&&!isPreparedTheory(row)&&preparedTaskSource(run,row).taskId===before):-1;
    const index=last>=0?last+1:target>=0?target:before==='end'?next.findLastIndex(owned)+1:next.findIndex(owned);
    next.splice(index<0?next.length:index,0,task);
  }
  return next;
}
export function preparedTheoryPlacementUpdates(run,set){
  const latest=new Map(preparedSetSequence({...set,theoryMode:'steps'},run.partFilters?.[set.id]).filter(isPreparedTheory).map(task=>[task.id,task]));
  const opened=new Set((run.cards||[]).map(card=>card.index)),updates=new Map();
  run.tasks.forEach((task,index)=>{
    const source=preparedTaskSource(run,task,index),incoming=latest.get(source.taskId);
    if(source.id===set.id&&task.theoryStep&&!opened.has(index)&&incoming&&(task.theoryBefore||'')!==(incoming.theoryBefore||''))updates.set(task.id,incoming);
  });
  return updates;
}
export function preparedSetSequence(set,partNumber) {
  const tasks=preparedSetPartTasks(set,partNumber),split=set.tasks.some(task=>task.startsPart===true);
  const mapped=partNumber!==undefined||split||set.theoryImages?.length?tasks.map(task=>({...task,sourceIndex:set.tasks.indexOf(task),...(split||partNumber!==undefined?{sourcePartNumber:preparedTaskPartNumber(set,set.tasks.indexOf(task)),sourceTaskNumber:preparedPartTaskNumber(set,preparedTaskPartNumber(set,set.tasks.indexOf(task)))}:{})})):tasks;
  const withLayout=cards=>set.boardLayout?cards.map(card=>{
    const boardDisplay=set.boardLayout[preparedLayoutKey(card)];
    return boardDisplay?{...card,boardDisplay}:card;
  }):cards;
  if(!set.theoryImages?.length)return withLayout(mapped);
  const theory=preparedTheorySequence(set),all=partNumber===undefined,first=Number(partNumber)===Number(set.partNumber||1),last=Number(partNumber)===preparedTaskPartNumber(set,set.tasks.length-1);
  return withLayout([...(all||first?theory.filter(row=>!row.theoryBefore):[]),...mapped.flatMap(task=>[...theory.filter(row=>row.theoryBefore===task.id).map(row=>({...row,sourcePartNumber:preparedTaskPartNumber(set,set.tasks.findIndex(value=>value.id===task.id))})),task]),...(all||last?theory.filter(row=>row.theoryBefore==='end'):[])]);
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
    const latest=isPreparedTheory(task)?{...task,theoryDisplay:set.theoryDisplay?.[set.theoryImages?.[sheet?.index??task.theoryIndices?.[0]??0]],...(sheet?{images:set.theoryImages?.[sheet.index]?[set.theoryImages[sheet.index]]:task.images,theoryStep:{...sheet,count:Math.max(sheet.index+1,set.theoryImages?.length||0)}}:{images:task.theoryIndices?task.theoryIndices.map(index=>set.theoryImages?.[index]).filter(Boolean):[...(set.theoryImages||[])]})}:set.tasks.find(row=>row.id===source.taskId);
    return latest?[{...latest,id:task.id,boardDisplay:set.boardLayout?.[preparedLayoutKey({...latest,id:source.taskId})]}]:[];
  });
}
export function preparedSourceUpdates(run,sets) {
  return preparedRunSources(run).map(source=>{
    const set=sets[source.id],sequence=set?preparedSetSequence(set,run.partFilters?.[source.id]):[],latest=preparedSourceLatest(run,set),byId=new Map(latest.map(task=>[task.id,task]));
    const known=new Set(run.tasks.filter(task=>preparedTaskSource(run,task).id===source.id).map(task=>preparedTaskSource(run,task).taskId));
    return {...source,setVersion:set?.version||source.version,
      contentUpdateAvailable:Boolean(set&&!set.draft&&(set.name!==source.name||preparedTheoryPlacementUpdates(run,set).size||run.tasks.some(task=>{const row=byId.get(task.id);return row&&preparedTaskContentChanged(task,row);}))),
      theoryUpdateAvailable:Boolean(set&&!set.draft&&preparedMissingTheory(run,set,sequence).length),
      newTasksAvailable:set&&!set.draft?sequence.filter(task=>!isPreparedTheory(task)&&!known.has(task.id)).length:0,
      filesUpdateAvailable:preparedFileSync(run.tasks,latest).changed>0,
      checkingUpdateAvailable:run.tasks.some(task=>{const row=byId.get(task.id);return row&&((task.answerMode||'combined')!==(row.answerMode||'combined')||task.format!==row.format||preparedAnswerTableChanged(task,row)||JSON.stringify(task.answerGroups||null)!==JSON.stringify(row.answerGroups||null));})};
  });
}

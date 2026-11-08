import {preparedTheoryItems,preparedTheoryItemKeys,theoryCardIdentity} from './interactiveTheoryCatalog.js';
import {preparedSetPartTasks,preparedTaskPartNumber,preparedPartTaskNumber} from './preparedSetParts.js';
import {preparedFileSync} from './preparedFileSync.js';
import {preparedAnswerTableChanged} from './preparedAnswerTable.js';
import {preparedTaskContentChanged} from './preparedTaskContent.js';
import {preparedLayoutKey} from './preparedSetLayout.js';

export const isPreparedTheory = task => task?.kind==='theory';
function legacyPreparedTheorySequence(set,mode=set.theoryMode) {
  const images=set.theoryImages||[],base={kind:'theory',format:'theory',answers:[],attachments:[],sourceIndex:-1};
  if(!images.length)return [];
  const placed=Object.values(set.theoryPlacements||{}).some(Boolean),groups=new Map();
  images.forEach((image,index)=>{const target=set.theoryPlacements?.[image]||'',before=target===set.tasks[0]?.id?'':target;if(!groups.has(before))groups.set(before,[]);groups.get(before).push({image,index});});
  return [...groups].flatMap(([before,rows])=>{
    const metadata=placed?{theoryBefore:before,...(mode==='steps'?{}:{theoryIndices:rows.map(row=>row.index)})}:{};
    return mode==='steps'?rows.map(({image,index},blockIndex)=>({...base,...metadata,id:`theory-${set.id}-sheet-${image}`,title:`Теория · ${index+1}`,images:[image],...(set.theoryDisplay?.[image]?{theoryDisplay:set.theoryDisplay[image]}:{}),theoryStep:{index,count:images.length,...(placed?{blockIndex,blockCount:rows.length}:{})}})):
      [{...base,...metadata,id:`theory-${set.id}${before?`-before-${before}`:''}`,title:before?'Теория между задачами':'Теория',...(set.theoryDisplay?.[rows[0].image]?{theoryDisplay:set.theoryDisplay[rows[0].image]}:{}),images:rows.map(row=>row.image)}];
  });
}
// Mixed cards use the same queue and placement keys; image-only legacy sets
// retain their exact task IDs and grouping.
export function preparedTheorySequence(set,mode=set.theoryMode) {
  const items=preparedTheoryItems(set);
  if(!items.some(item=>item.kind==='interactive'))return legacyPreparedTheorySequence({...set,theoryImages:items.map(item=>item.assetId)},mode);
  const groups=new Map(),base={kind:'theory',format:'theory',answers:[],attachments:[],sourceIndex:-1};
  items.forEach((item,index)=>{
    const target=set.theoryPlacements?.[item.id]||'',before=target===set.tasks[0]?.id?'':target;
    if(!groups.has(before))groups.set(before,[]);
    groups.get(before).push({item,index});
  });
  return [...groups].flatMap(([before,rows])=>{
    const chunks=[];
    rows.forEach(row=>{
      const last=chunks.at(-1);
      if(mode!=='steps'&&row.item.kind==='image'&&last?.[0].item.kind==='image')last.push(row);
      else chunks.push([row]);
    });
    return chunks.map((chunk,blockIndex)=>{
      const {item,index}=chunk[0],interactive=item.kind==='interactive';
      return {...base,id:`theory-${set.id}-sheet-${item.id}`,title:interactive?'Интерактивная теория':`Теория · ${index+1}`,
        images:interactive?[]:chunk.map(row=>row.item.assetId),theoryItemId:item.id,theoryBefore:before,
        ...(interactive?{interactive:{typeId:item.typeId,params:item.params}}:{}),
        ...(set.theoryDisplay?.[item.id]?{theoryDisplay:set.theoryDisplay[item.id]}:{}),
        theoryStep:{index,count:items.length,blockIndex,blockCount:chunks.length}};
    });
  });
}
// Existing lesson cards retain their format and position. Only new theory is
// inserted at its chosen task; moving an annotated sheet remains explicit.
export function preparedTheorySyncPlan(run,set) {
  const current=run.tasks.filter(task=>isPreparedTheory(task)&&preparedTaskSource(run,task).id===set.id);
  const mode=current.length?(current.some(task=>task.theoryStep)?'steps':'together'):set.theoryMode;
  const incoming=preparedSetSequence({...set,theoryMode:mode},run.partFilters?.[set.id]).filter(isPreparedTheory);
  const opened=new Set((run.cards||[]).map(card=>run.tasks[card.index]?.id));
  const matches=new Map();
  const used=new Set();
  for(const row of current){
    const next=incoming.find(task=>!used.has(task.id)&&(row.theoryStep
      ? theoryCardIdentity(task)===theoryCardIdentity(row)
      : preparedTaskSource(run,row).taskId===task.id));
    if(next){matches.set(row.id,next);used.add(next.id);}
  }
  const wholeSetImages=new Set(preparedTheoryItemKeys(set));
  const previousImages=new Set(current.map(theoryCardIdentity));
  for(const row of current){
    if(row.interactive||matches.has(row.id)||!opened.has(row.id)||!row.theoryStep||wholeSetImages.has(theoryCardIdentity(row)))continue;
    // In-place replacement can update the image on the same annotated card.
    const next=incoming.find(task=>!task.interactive&&!used.has(task.id)&&!previousImages.has(theoryCardIdentity(task))
      &&task.theoryStep?.index===row.theoryStep.index&&(task.theoryBefore||'')===(row.theoryBefore||''));
    if(next){matches.set(row.id,next);used.add(next.id);}
  }
  const legacy=current.some(task=>!task.theoryStep&&!task.theoryIndices);
  return {
    matches,
    pending:incoming.filter(task=>!legacy||task.interactive||used.has(task.id)).filter(task=>
      !current.some(row=>opened.has(row.id)&&matches.get(row.id)===task)),
    remove:new Set(current.filter(row=>!opened.has(row.id)).map(row=>row.id)),
    added:incoming.filter(task=>(!legacy||task.interactive)&&!used.has(task.id)),
  };
}
export function insertPreparedTheory(run,tasks,setId,added){
  const next=[...tasks];
  for(const task of added){
    const before=task.theoryBefore||'',owned=row=>preparedTaskSource(run,row).id===setId;
    const last=next.findLastIndex(row=>owned(row)&&isPreparedTheory(row)&&(row.theoryBefore||'')===before);
    const target=before&&before!=='end'?next.findIndex(row=>owned(row)&&!isPreparedTheory(row)&&preparedTaskSource(run,row).taskId===before):-1;
    const index=target>=0?target:last>=0?last+1:before==='end'?next.findLastIndex(owned)+1:next.findIndex(owned);
    next.splice(index<0?next.length:index,0,task);
  }
  return next;
}
export function preparedSetSequence(set,partNumber) {
  const tasks=preparedSetPartTasks(set,partNumber),split=set.tasks.some(task=>task.startsPart===true);
  const mapped=partNumber!==undefined||split||preparedTheoryItems(set).length?tasks.map(task=>({...task,sourceIndex:set.tasks.indexOf(task),...(split||partNumber!==undefined?{sourcePartNumber:preparedTaskPartNumber(set,set.tasks.indexOf(task)),sourceTaskNumber:preparedPartTaskNumber(set,preparedTaskPartNumber(set,set.tasks.indexOf(task)))}:{})})):tasks;
  const withLayout=cards=>set.boardLayout?cards.map(card=>{
    const boardDisplay=set.boardLayout[preparedLayoutKey(card)];
    return boardDisplay?{...card,boardDisplay}:card;
  }):cards;
  if(!preparedTheoryItems(set).length)return withLayout(mapped);
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
export function preparedSourceLatest(run,set, theoryPlan=set&&preparedTheorySyncPlan(run,set)) {
  if(!set)return [];
  return run.tasks.flatMap((task,index)=>{
    const source=preparedTaskSource(run,task,index);
    if(source.id!==set.id)return [];
    if(isPreparedTheory(task)){
      const incoming=theoryPlan.matches.get(task.id);
      if(!incoming)return [];
      return [{...incoming,id:task.id,...(!theoryPlan.remove.has(task.id)?{
        title:task.title,theoryBefore:task.theoryBefore,
        ...(task.theoryStep?{theoryStep:{...task.theoryStep,count:Math.max(task.theoryStep.index+1,incoming.theoryStep.count)}}:{}),
      }: {})}];
    }
    const latest=set.tasks.find(row=>row.id===source.taskId);
    return latest?[{...latest,id:task.id,boardDisplay:set.boardLayout?.[preparedLayoutKey(latest)]}]:[];
  });
}
export function preparedSourceUpdates(run,sets) {
  return preparedRunSources(run).map(source=>{
    const set=sets[source.id],sequence=set?preparedSetSequence(set,run.partFilters?.[source.id]):[],theoryPlan=set&&preparedTheorySyncPlan(run,set),latest=preparedSourceLatest(run,set,theoryPlan),byId=new Map(latest.map(task=>[task.id,task]));
    const known=new Set(run.tasks.filter(task=>preparedTaskSource(run,task).id===source.id).map(task=>preparedTaskSource(run,task).taskId));
    return {...source,setVersion:set?.version||source.version,
      contentUpdateAvailable:Boolean(set&&!set.draft&&(set.name!==source.name||run.tasks.some(task=>{const row=byId.get(task.id);return row?(task.theoryBefore||'')!==(row.theoryBefore||'')||preparedTaskContentChanged(task,row):theoryPlan.remove.has(task.id);}))),
      theoryUpdateAvailable:Boolean(set&&!set.draft&&theoryPlan.added.length),
      newTasksAvailable:set&&!set.draft?sequence.filter(task=>!isPreparedTheory(task)&&!known.has(task.id)).length:0,
      filesUpdateAvailable:preparedFileSync(run.tasks,latest).changed>0,
      checkingUpdateAvailable:run.tasks.some(task=>{const row=byId.get(task.id);return row&&((task.answerMode||'combined')!==(row.answerMode||'combined')||task.format!==row.format||preparedAnswerTableChanged(task,row)||JSON.stringify(task.answerGroups||null)!==JSON.stringify(row.answerGroups||null));})};
  });
}

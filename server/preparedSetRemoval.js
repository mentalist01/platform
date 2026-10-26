import crypto from 'node:crypto';
import {preparedTaskSource} from '../src/utils/preparedRunSources.js';
import {COLLAB_SOLUTIONS_DELETED_KEY} from '../src/utils/collabSolutions.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const rollback=(run,previous)=>{for(const key of Object.keys(run))if(!Object.hasOwn(previous,key))delete run[key];Object.assign(run,previous);};
const withSource=(run,task,index)=>{
  const source=preparedTaskSource(run,task,index);
  return {...task,sourceSetId:source.id,sourceSetName:source.name,sourceTaskNumber:source.taskNumber,
    sourcePartNumber:source.partNumber,sourceSetVersion:source.version,sourceTaskId:source.taskId,sourceIndex:source.index};
};
const reindex=(cards,before,after)=>{
  const positions=new Map(after.map((task,index)=>[task.id,index]));
  return cards.filter(card=>positions.has(before[card.index]?.id)).map(card=>({...card,index:positions.get(before[card.index].id)}));
};
const primary=tasks=>tasks.length?{setId:tasks[0].sourceSetId,name:tasks[0].sourceSetName,
  taskNumber:tasks[0].sourceTaskNumber,partNumber:tasks[0].sourcePartNumber,setVersion:tasks[0].sourceSetVersion}:{};

// Retain removed lesson snapshots privately. A library set and independent
// handwriting are never deleted; restoring uses the same card/code identities.
export async function removePreparedSet(store,run,setId){
  const before=run.tasks.map((task,index)=>withSource(run,task,index));
  const removed=before.filter(task=>task.sourceSetId===setId);
  if(!removed.length)return;
  const doc=await store.board(run.room),items=doc.getArray('items');
  const cards=reindex(run.cards,before,removed).map(card=>({...card,lease:null,codeLease:null,
    bindings:Object.fromEntries(Object.entries(card.bindings||{}).map(([id,binding])=>[id,{...binding,until:0,generation:binding.generation+1}]))}));
  const anchors=new Set(cards.map(card=>card.anchorId));
  const codeDoc=store.code?await store.code(run.room.split('~page~')[0].replace(/^board-/,'collab-')):null;
  const record={id:crypto.randomUUID(),setId,name:removed[0].sourceSetName,removedAt:new Date(store.now()).toISOString(),
    tasks:removed,cards,order:before.map(task=>task.id),anchors:items.toArray().filter(item=>anchors.has(item.id)),
    codeIds:cards.filter(card=>!codeDoc?.getMap(COLLAB_SOLUTIONS_DELETED_KEY).get(card.codeId)).map(card=>card.codeId)};
  const tasks=before.filter(task=>task.sourceSetId!==setId),remaining=reindex(run.cards,before,tasks);
  const previous={...run};
  Object.assign(run,{...primary(tasks),tasks,cards:remaining,detachedSets:[...(run.detachedSets||[]),record],
    teacherCardId:remaining.some(card=>card.id===run.teacherCardId)?run.teacherCardId:remaining.at(-1)?.id||'',
    mode:tasks.length?run.mode:'plain',auto:tasks.length?run.auto:false,awaitingFirstCard:Boolean(tasks.length&&!remaining.length),version:run.version+1});
  try{store.save(run);}catch(error){rollback(run,previous);throw error;}
  await projectPreparedSetRemovals(store,run);
}

export async function restorePreparedSet(store,run,removalId){
  const record=run.detachedSets?.find(row=>row.id===removalId&&!row.restoring);
  if(!record)fail(404,'Убранный набор не найден');
  if(run.tasks.some(task=>preparedTaskSource(run,task).id===record.setId))fail(409,'Этот набор уже есть на странице');
  if([...run.tasks,...record.tasks].filter(task=>task.kind!=='theory').length>100)fail(409,'На странице может быть не больше 100 задач');
  const before=run.tasks.map((task,index)=>withSource(run,task,index));
  const tasks=[...before],known=new Set(tasks.map(task=>task.id)),renamed=new Map();
  const restored=record.tasks.map(task=>{const id=known.has(task.id)?crypto.randomUUID():task.id;known.add(id);renamed.set(task.id,id);return {...task,id};});
  const order=record.order.map(id=>renamed.get(id)||id);
  for(const task of restored){
    const original=order.indexOf(task.id),next=order.slice(original+1).find(id=>tasks.some(row=>row.id===id));
    const previous=order.slice(0,original).reverse().find(id=>tasks.some(row=>row.id===id));
    const index=next?tasks.findIndex(row=>row.id===next):previous?tasks.findIndex(row=>row.id===previous)+1:Math.min(original,tasks.length);
    tasks.splice(index,0,task);
  }
  const cards=[...reindex(run.cards,before,tasks),...reindex(record.cards,restored,tasks)].sort((a,b)=>a.index-b.index);
  const previous={...run};
  Object.assign(run,{...primary(tasks),tasks,cards,mode:'prepared',awaitingFirstCard:false,
    detachedSets:run.detachedSets.map(row=>row===record?{...row,restoring:true}:row),
    teacherCardId:record.cards.at(-1)?.id||run.teacherCardId||cards.at(-1)?.id||'',version:run.version+1});
  try{store.save(run);}catch(error){rollback(run,previous);throw error;}
  await projectPreparedSetRemovals(store,run);
}

export async function projectPreparedSetRemovals(store,run){
  if(!run.detachedSets?.length)return;
  const doc=await store.board(run.room),items=doc.getArray('items');
  const codeDoc=store.code?await store.code(run.room.split('~page~')[0].replace(/^board-/,'collab-')):null;
  for(const record of run.detachedSets){
    const ids=new Set(record.cards.map(card=>card.anchorId));
    doc.transact(()=>{
      if(record.restoring){for(const anchor of record.anchors)if(!items.toArray().some(item=>item.id===anchor.id))items.push([anchor]);}
      else {for(let index=items.length-1;index>=0;index--)if(ids.has(items.get(index)?.id))items.delete(index,1);}
    },'prepared-lesson:set-visibility');
    if(codeDoc)codeDoc.transact(()=>{const deleted=codeDoc.getMap(COLLAB_SOLUTIONS_DELETED_KEY);for(const id of record.codeIds)if(deleted.get(id)!==!record.restoring)deleted.set(id,!record.restoring);},'prepared-code:set-visibility');
  }
  if(run.detachedSets.some(record=>record.restoring)){run.detachedSets=run.detachedSets.filter(record=>!record.restoring);store.save(run);}
}

export const preparedStoredCards=run=>[...run.cards,...(run.detachedSets||[]).flatMap(record=>record.cards)];
export const preparedSolutionEntries=run=>[
  ...run.cards.map(card=>({card,task:run.tasks[card.index]})),
  ...(run.detachedSets||[]).filter(record=>!record.restoring).flatMap(record=>record.cards.map(card=>({card,task:record.tasks[card.index]}))),
];

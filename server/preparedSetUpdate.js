import {preparedAnswerGroups,remapPreparedGroupAnswers} from '../src/utils/preparedAnswerGroups.js';
import {preparedTaskSource,preparedSetSequence,preparedSourceLatest,preparedMissingTheory,isPreparedTheory} from '../src/utils/preparedRunSources.js';
import {preparedCheckingChanged} from '../src/utils/preparedTaskContent.js';
import {preparedAnswerIndices,preparedAnswerTableChanged} from '../src/utils/preparedAnswerTable.js';
import {preparedFileSync} from '../src/utils/preparedFileSync.js';
import {preparedRuntimeFiles} from '../src/utils/preparedRuntimeFiles.js';

const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const schemaChanged=(before,after)=>before.answers.length!==after.answers.length||
  (before.answerMode||'combined')!==(after.answerMode||'combined')||preparedAnswerTableChanged(before,after)||JSON.stringify(before.answerGroups||null)!==JSON.stringify(after.answerGroups||null);

function updatedCard(card,before,after){
  if(isPreparedTheory(before)||!preparedCheckingChanged(before,after))return card;
  const schema=schemaChanged(before,after);
  let answers=card.answers;
  if(schema&&(before.answerGroups||after.answerGroups)){
    try{answers=remapPreparedGroupAnswers(before,after,card.answers);}catch(error){fail(error.message);}
  }else if(schema){
    const values=preparedAnswerIndices(before).map(index=>card.answers[index]||'');
    if(values.slice(after.answers.length).some(value=>value.trim())){
      fail('Новые поля не вмещают введённые ответы. Сохраните их перед уменьшением количества ячеек.');
    }
    answers=after.answers.map(()=> '');
    preparedAnswerIndices(after).forEach((index,position)=>{answers[index]=values[position]||'';});
  }
  // A changed key invalidates a previous failed check, not the pupil's input.
  // Completed work and achievement receipts remain accepted historical results.
  const fieldResults=after.answerMode==='independent'?Array(after.answers.length).fill(null):[];
  if(after.answerMode==='independent')for(const group of preparedAnswerGroups(after)){
    const result=card.status==='solved'?'correct':!schema&&before.format===after.format&&group.indices.every(index=>before.answers[index]===after.answers[index])?card.fieldResults?.[group.indices[0]]||null:null;
    group.indices.forEach(index=>{fieldResults[index]=result;});
  }
  return {...card,answers,fieldResults,lastResult:card.status==='solved'?card.lastResult:null,
    ...(schema?{answerRevision:card.answerRevision+1,lease:null}:{})};
}

// Apply one validated library version only to the requested lesson. No polling,
// respawning, board rewrites or replay of code snapshots is involved.
export function updatePreparedSet(store,run,set){
  const latest=new Map(preparedSourceLatest(run,set).map(task=>[task.id,task]));
  const cardsByIndex=new Map(run.cards.map(card=>[card.index,card]));
  const cardUpdates=new Map();
  let tasks=run.tasks.map((task,index)=>{
    const source=preparedTaskSource(run,task,index);
    if(source.id!==set.id)return {...task,sourceIndex:source.index};
    const incoming=latest.get(task.id);
    const metadata={sourceSetId:source.id,sourceSetName:set.name,sourceTaskNumber:source.taskNumber,
      sourcePartNumber:source.partNumber,sourceSetVersion:set.version,sourceTaskId:source.taskId,sourceIndex:source.index};
    if(!incoming)return {...task,...metadata}; // Removing a library row never erases lesson work.
    const next={...task,...metadata,title:incoming.title,difficult:incoming.difficult===true,
      format:incoming.format,answerMode:incoming.answerMode||'combined',answers:[...incoming.answers],images:[...incoming.images],
      attachments:preparedFileSync([task],[incoming]).tasks[0].attachments};
    if(incoming.theoryStep)next.theoryStep={...incoming.theoryStep};
    delete next.answerTable;delete next.answerCountOverride;delete next.answerGroups;
    if(incoming.answerGroups)next.answerGroups=structuredClone(incoming.answerGroups);
    delete next.referenceSolutions;
    if(incoming.referenceSolutions?.length)next.referenceSolutions=structuredClone(incoming.referenceSolutions);
    if(incoming.answerTable)next.answerTable={...incoming.answerTable};
    if(incoming.answerCountOverride)next.answerCountOverride=incoming.answerCountOverride;
    if(next.attachments.length>16)fail('Слишком много вложений. Используйте новую страницу.');
    try{preparedRuntimeFiles(next.attachments);}catch(error){fail(error.message);}
    const card=cardsByIndex.get(index);
    if(card)cardUpdates.set(card.id,updatedCard(card,task,next));
    return next;
  });
  const known=new Set(run.tasks.filter(task=>preparedTaskSource(run,task).id===set.id).map(task=>preparedTaskSource(run,task).taskId));
  const sequence=preparedSetSequence(set,run.partFilters?.[set.id]);
  const added=sequence.filter(task=>!isPreparedTheory(task)&&!known.has(task.id));
  if(tasks.filter(task=>!isPreparedTheory(task)).length+added.length>100)fail('На странице может быть не больше 100 задач. Создайте новую страницу.');
  tasks=[...tasks,...store.sourceTasks(run,set,added)];
  const theory=preparedMissingTheory(run,set,sequence);
  if(theory.length){
    const index=tasks.findIndex(task=>preparedTaskSource(run,task).id===set.id);
    const last=tasks.findLastIndex(task=>isPreparedTheory(task)&&preparedTaskSource(run,task).id===set.id);
    tasks.splice(last<0?index:last+1,0,...store.sourceTasks(run,set,theory));
  }
  const positions=new Map(tasks.map((task,index)=>[task.id,index]));
  const cards=run.cards.map(card=>({...cardUpdates.get(card.id)||card,index:positions.get(run.tasks[card.index].id)}));
  const patch={tasks,cards,...(run.setId===set.id?{name:set.name,setVersion:set.version}:{})};
  if(JSON.stringify(run.tasks)===JSON.stringify(tasks)&&JSON.stringify(run.cards)===JSON.stringify(cards)&&run.name===(patch.name??run.name)&&run.setVersion===(patch.setVersion??run.setVersion))return false;
  const before={...run};
  Object.assign(run,patch,{version:run.version+1});
  try{store.save(run);}catch(error){Object.assign(run,before);throw error;}
  return true;
}

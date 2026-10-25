import {useState} from 'react';
import {ArrowRight,Layers,Scissors,RefreshCcw} from 'lucide-react';
import {changeStudyProgress,continueStudentStudy,getStudyProgress} from '../services/studentStudyProgress.js';
import {preparedRequest} from '../services/preparedLessonTasks.js';

const initial=preview=>preview.pending?{name:preview.pending.name,parts:preview.pending.parts.map(part=>({...part,version:part.setVersion,choice:part.hasRun?'existing':part.setId?`${part.setId}:${part.sourcePartNumber}`:'none'}))}:{name:preview.name,parts:preview.parts.map(part=>({...part,...part.suggested,choice:part.existingPageId&&part.hasRun?'existing':part.suggested?`${part.suggested.setId}:${part.suggested.sourcePartNumber}`:''}))};
export default function StudentStudyNextStage({teacherId,studentId,data,onUpdate,onDone,onBack,onBusyChange}) {
  const [preview,setPreview]=useState(data.transition),[draft,setDraft]=useState(()=>initial(data.transition)),[operationId,setOperationId]=useState(()=>data.transition.pending?.id||crypto.randomUUID());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[splitId,setSplitId]=useState(''),[boundaries,setBoundaries]=useState({});
  const update=result=>{onUpdate(result);if(result.transition?.next){setPreview(result.transition);setDraft(initial(result.transition));setOperationId(result.transition.pending?.id||crypto.randomUUID());}};
  const execute=async fn=>{if(busy)return;setBusy(true);onBusyChange(true);setError('');try{await fn();}catch(error){setError(error.message);try{update(await getStudyProgress(teacherId,studentId));}catch{/* Existing setup can be resumed after reconnecting. */}}finally{setBusy(false);onBusyChange(false);}};
  const select=(number,value)=>setDraft(previous=>({...previous,parts:previous.parts.map(part=>part.partNumber===number?{...part,choice:value}:part)}));
  const choices=number=>preview.sets.flatMap(set=>set.parts.filter(part=>part.partNumber===number).map(part=>({value:`${set.id}:${part.sourcePartNumber}`,set,part})));
  const prepare=()=>execute(async()=>{
    const parts=draft.parts.map(part=>{
      const option=choices(part.partNumber).find(option=>option.value===part.choice);
      return {partNumber:part.partNumber,name:part.name,existingPageId:part.existingPageId||part.existing&&part.pageId||'',...(option?{setId:option.set.id,version:option.set.version,sourcePartNumber:option.part.sourcePartNumber}:{})};
    });
    const result=await changeStudyProgress(teacherId,studentId,{action:'transition',operationId,blockId:preview.next.blockId,partNumber:preview.next.partNumber,name:draft.name,parts});
    onUpdate(result);await continueStudentStudy(teacherId,studentId);onDone(result);
  });
  const splitSet=preview.sets.find(set=>set.id===splitId),splitTasks=splitSet?.parts.flatMap(part=>part.taskIds.map((id,index)=>({id,title:part.titles[index]})))||[];
  const canSplit=splitId&&preview.parts.slice(1).every(part=>boundaries[part.partNumber])&&preview.parts.slice(1).every((part,index,all)=>{const at=splitTasks.findIndex(task=>task.id===boundaries[part.partNumber]);return at>0&&(!index||at>splitTasks.findIndex(task=>task.id===boundaries[all[index-1].partNumber]));});
  const saveBoundaries=()=>execute(async()=>{
    const result=await preparedRequest('/api/lesson-task-sets'),set=result.sets.find(set=>set.id===splitId);
    if(!set||set.version!==splitSet.version)throw Error('Набор изменён. Обновите окно перехода.');
    const starts=new Set(Object.values(boundaries));
    await preparedRequest(`/api/lesson-task-sets/${set.id}`,{...set,version:set.version,tasks:set.tasks.map((task,index)=>({...task,startsPart:index>0&&starts.has(task.id)}))},'PUT');
    update(await getStudyProgress(teacherId,studentId));setSplitId('');setBoundaries({});
  });
  const ready=draft.name.trim()&&draft.parts.every(part=>Boolean(part.choice));
  return <div className="student-study-next">
    <div className="student-study-next-heading"><Layers size={22}/><div><small>СЛЕДУЮЩИЙ ЭТАП</small><h3>Перейти к заданию №{preview.next.blockId}?</h3><p>{preview.parts.length>1?'Страница задания и отдельная подстраница для каждой части.':'Страница задания с подготовленными материалами.'}</p></div></div>
    {preview.pending&&<p className="student-study-message">Подготовка была прервана. Уже созданные страницы сохраняются; повторный запуск продолжит эту же подготовку.</p>}
    <label className="student-study-next-name">Страница задания<input aria-label="Название страницы следующего задания" maxLength={80} disabled={busy||Boolean(preview.pending)||Boolean(preview.parent)} value={preview.parent?.title||draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/>{preview.parent&&<small>Используем существующую страницу. Её содержимое сохранится.</small>}</label>
    <div className="student-study-next-parts">{draft.parts.map(part=>{
      const existing=part.existingPageId||part.existing&&part.pageId,options=choices(part.partNumber),selected=options.find(option=>option.value===part.choice);
      return <section key={part.partNumber} className={part.partNumber===preview.next.partNumber?'is-next':''}><div><span>↳</span><input aria-label={`Название подстраницы части ${part.partNumber}`} disabled={busy||Boolean(preview.pending)||Boolean(existing)} maxLength={80} value={part.name} onChange={event=>setDraft({...draft,parts:draft.parts.map(row=>row.partNumber===part.partNumber?{...row,name:event.target.value}:row)})}/>{part.partNumber===preview.next.partNumber&&<small>Начнём здесь</small>}</div>
        {existing&&part.hasRun?<p>Уже есть на доске — откроем её, материалы сохранятся.</p>:<>{existing&&<p>Страница уже есть. Добавим выбранные материалы, записи сохранятся.</p>}<label>Материалы<select aria-label={`Набор для части ${part.partNumber}`} disabled={busy||Boolean(preview.pending)} value={part.choice} onChange={event=>select(part.partNumber,event.target.value)}><option value="" disabled>Выберите набор или оставьте страницу пустой</option>{options.map(option=><option key={option.value} value={option.value}>{option.set.name} · часть {option.part.partNumber} · задач: {option.part.taskIds.length}</option>)}<option value="none">Без набора — добавлю позже</option></select></label>{selected&&<small>Задачи: {selected.part.titles.map((title,index)=>title||String(index+1)).join(', ')}</small>}</>}
      </section>;
    })}</div>
    {preview.parts.length>1&&!preview.pending&&preview.sets.some(set=>set.parts.length===1&&set.parts[0].taskIds.length>=preview.parts.length)&&<details className="student-study-split" open={Boolean(splitId)}><summary><Scissors size={15}/>Части объединены в одном наборе?</summary><p>Отметьте, с каких задач начинаются следующие части. Сам набор останется одним.</p><label>Объединённый набор<select aria-label="Объединённый набор" value={splitId} disabled={busy} onChange={event=>{setSplitId(event.target.value);setBoundaries({});}}><option value="">Выберите набор</option>{preview.sets.filter(set=>set.parts[0].partNumber===1&&set.parts.flatMap(part=>part.taskIds).length>=preview.parts.length).map(set=><option key={set.id} value={set.id}>{set.name}</option>)}</select></label>{splitId&&preview.parts.slice(1).map(part=><label key={part.partNumber}>Часть {part.partNumber} начинается с задачи<select aria-label={`Начало части ${part.partNumber}`} value={boundaries[part.partNumber]||''} disabled={busy} onChange={event=>setBoundaries({...boundaries,[part.partNumber]:event.target.value})}><option value="">Выберите задачу</option>{splitTasks.slice(1).map((task,index)=><option key={task.id} value={task.id}>{task.title||`Задача ${index+2}`} · позиция {index+2} в наборе</option>)}</select></label>)}{splitId&&<button type="button" disabled={busy||!canSplit} onClick={()=>void saveBoundaries()}>Сохранить границы частей</button>}</details>}
    {error&&<p className="student-study-error" role="alert">{error}</p>}
    <div className="student-study-actions"><button type="button" disabled={busy} onClick={onBack}>Не сейчас</button><button type="button" className="student-study-primary" disabled={busy||!ready} onClick={()=>void prepare()}>{busy?'Подготавливаем…':preview.pending?'Продолжить подготовку':draft.parts.every(part=>part.choice==='existing')?'Перейти к следующей части':'Создать и перейти'}<ArrowRight size={16}/></button></div>
    {preview.pending&&<button type="button" className="student-study-reset" disabled={busy} onClick={()=>void execute(async()=>update(await changeStudyProgress(teacherId,studentId,{action:'cancel-transition'})))}><RefreshCcw size={14}/>Изменить подготовку · созданные страницы сохранятся</button>}
  </div>;
}

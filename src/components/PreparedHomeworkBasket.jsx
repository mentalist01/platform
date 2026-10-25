import {useEffect,useRef,useState} from 'react';
import {BookOpen,Plus,Trash2,X} from 'lucide-react';
import {preparedAssetUrl,preparedRequest} from '../services/preparedLessonTasks.js';
import {isPreparedHomeworkGoal,preparedHomeworkLabel} from '../utils/preparedHomework.js';

export default function PreparedHomeworkBasket({open,editing,studentId,groupId,goals,onChange,onLoading}){
  const [pending,setPending]=useState([]),[error,setError]=useState(''),[preview,setPreview]=useState(null);
  const latest=useRef({goals,onChange,onLoading});useEffect(()=>{latest.current={goals,onChange};},[goals,onChange]);
  const scope=new URLSearchParams(groupId?{groupId}:{studentId}).toString();
  useEffect(()=>{
    if(!open||!studentId&&!groupId)return;const abort=new AbortController();onLoading?.(true);
    preparedRequest('/api/prepared-homework/basket?'+scope,undefined,'GET',abort.signal).then(data=>{
      if(abort.signal.aborted)return;setPending(data.goals);
      if(!editing){const value=latest.current,known=new Set(value.goals.filter(isPreparedHomeworkGoal).map(goal=>goal.preparedId)),extra=data.goals.filter(goal=>!known.has(goal.preparedId));if(extra.length)value.onChange({goals:[...value.goals.filter(goal=>isPreparedHomeworkGoal(goal)||goal.taskNumber||goal.mockExamId||goal.targetInput),...extra]});}
    }).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)onLoading?.(false);});return()=>{abort.abort();onLoading?.(false);};
  },[open,editing,scope,studentId,groupId,onLoading]);
  const selected=new Set(goals.filter(isPreparedHomeworkGoal).map(goal=>goal.preparedId));
  const available=pending.filter(goal=>!selected.has(goal.preparedId));
  return <section className="prepared-homework-basket">
    <strong><BookOpen size={16}/>Задачи с урока</strong><p>На карточке доски нажмите «На дом» — задача появится здесь с файлами и начатым решением.</p>
    {error&&<p role="alert" className="prepared-error">{error}</p>}
    {goals.map((goal,index)=>isPreparedHomeworkGoal(goal)&&<article key={goal.preparedId}><div><b>{preparedHomeworkLabel(goal)}</b><small>Личная копия для каждого ученика · проверка ответа</small></div><button type="button" onClick={()=>void preparedRequest(`/api/prepared-homework/${goal.preparedId}/preview`).then(setPreview).catch(e=>setError(e.message))}>Условие</button><button type="button" aria-label={`Убрать из домашки задачу ${goal.title}`} onClick={()=>{onChange({goals:goals.filter((_,i)=>i!==index)});setPending(old=>old.filter(row=>row.preparedId!==goal.preparedId));void preparedRequest(`/api/prepared-homework/basket/${goal.preparedId}?${scope}`,{},'DELETE').catch(e=>setError(e.message));}}><Trash2 size={15}/></button></article>)}
    {available.map(goal=><article key={goal.preparedId}><span>{preparedHomeworkLabel(goal)}</span><button type="button" onClick={()=>onChange({goals:[...goals,goal]})}><Plus size={14}/>Добавить к ДЗ</button></article>)}
    {preview&&<div className="prepared-homework-preview"><header><strong>{preparedHomeworkLabel(preview.goal)}</strong><button type="button" aria-label="Закрыть условие" onClick={()=>setPreview(null)}><X size={17}/></button></header>{preview.images.map(file=><img key={file.id} src={preparedAssetUrl(file.url)} alt="Условие задачи с урока"/>)}{preview.files.map(file=><small key={file.id}>{file.name}</small>)}</div>}
  </section>;
}

import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Clock3,Infinity as InfinityIcon,Square} from 'lucide-react';
import {api} from '../services/api.js';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import {lessonControl,lessonEndDeadline,lessonEndPhase,LESSON_END_QUESTION_MS} from '../utils/lessonEndControl.js';
import './LessonEndNotice.css';

export default function LessonEndNotice({job,refresh,onEnded,recordingWarning}){
  const portal=useFullscreenPortalTarget(),[now,setNow]=useState(Date.now),[minutes,setMinutes]=useState(10),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [collapsed,setCollapsed]=useState(()=>{try{return sessionStorage.getItem(`lesson-end-collapsed:${job.id}`)==='1';}catch{return false;}}),automatic=useRef('');
  const control=lessonControl(job),phase=lessonEndPhase(job,now),remaining=Math.max(0,lessonEndDeadline(job)-now);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer);},[]);
  const fold=value=>{setCollapsed(value);try{sessionStorage.setItem(`lesson-end-collapsed:${job.id}`,value?'1':'0');}catch{}};
  const action=async(mode)=>{
    if(busy)return;setBusy(true);setError('');
    try{
      if(mode==='finish'){
        await api.desktopRecording('finish-lesson',{id:job.id,revision:control.revision});onEnded?.(job);
      }else await api.desktopRecording('end-control',{id:job.id,revision:control.revision,mode,minutes});
      await refresh();
    }catch(failure){setError(failure.message);void refresh().catch(()=>{});}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    const key=`${job.id}:${control.revision}`;
    if(phase==='ended'&&automatic.current!==key){automatic.current=key;void action('finish');}
  },[phase,job.id,control.revision]);
  if(!phase&&control.mode!=='timed')return null;
  const question=phase==='question',ended=phase==='ended',manual=phase==='manual';
  const title=question?'Заканчиваем или продолжаем?':ended?'Занятие завершено':manual?'Продолжаем до завершения вручную':'Занятие продлено';
  return createPortal(<aside className={`lesson-end-notice${question?' is-question':''}`} aria-label="Окончание занятия" role={question?'alert':'region'}>
    {collapsed&&!question&&!ended&&!recordingWarning?<button type="button" className="lesson-end-pill" aria-expanded="false" onClick={()=>fold(false)}><InfinityIcon size={17}/>{manual?'Урок продолжается':`Урок до ${new Date(lessonEndDeadline(job)).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`}</button>:<>
      <header><span className="lesson-end-icon">{manual?<InfinityIcon size={21}/>:<Clock3 size={21}/>}</span><div><strong>{title}</strong><small>{job.lessonName||job.title}</small></div>{!question&&!ended&&<button type="button" className="lesson-end-fold" aria-label="Свернуть панель занятия" aria-expanded="true" onClick={()=>fold(true)}><ChevronDown size={18}/></button>}</header>
      {question?<><p>До конца занятия <b>{Math.ceil(remaining/1000)} сек.</b><br/>Без продления занятие и запись завершатся.</p><div className="lesson-end-countdown" aria-label="Время на решение"><span style={{width:`${Math.min(100,remaining/LESSON_END_QUESTION_MS*100)}%`}}/></div></>:manual?<p>Запись продолжается. Завершите занятие, когда закончите.</p>:!ended&&<p>Продолжаем до {new Date(lessonEndDeadline(job)).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}. Запись идёт без перерыва.</p>}
      {!manual&&!ended&&<><div className="lesson-end-timed"><button type="button" disabled={busy} className="lesson-end-primary" onClick={()=>void action('timed')}>Ещё {minutes} минут</button><select aria-label="На сколько продлить занятие" disabled={busy} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[5,10,15,30].map(n=><option key={n} value={n}>{n} мин</option>)}</select></div><button type="button" className="lesson-end-manual" disabled={busy} onClick={()=>void action('manual')}><InfinityIcon size={17}/>Продолжить до завершения вручную</button></>}
      {!ended&&<button type="button" className="lesson-end-finish" disabled={busy} onClick={()=>void action('finish')}><Square size={13}/>{busy?'Сохраняем…':'Завершить занятие'}</button>}
      {recordingWarning&&<div className="lesson-end-recording-error" role="alert"><strong>{recordingWarning.title}</strong><p>{recordingWarning.detail}</p><a href="http://127.0.0.1:18765/" target="_blank" rel="noreferrer">Открыть пульт записи ↗</a></div>}
      {error&&<p className="lesson-end-error" role="alert">{error}{ended&&<button type="button" disabled={busy} onClick={()=>void action('finish')}>Повторить завершение</button>}</p>}
    </>}
  </aside>,portal);
}

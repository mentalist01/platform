import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CheckCircle2,Loader2,Square} from 'lucide-react';
import {api} from '../services/api';
import {canFinishGroupLesson,finishGroupLesson} from '../utils/finishGroupLesson.js';
import './GroupLessonFinishButton.css';

export default function GroupLessonFinishButton({lesson,role,onFinished,beforeFinish,transport=api}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef(null),inFlight=useRef(false);
  const teacher=role==='teacher' || role==='admin';
  const available=teacher && canFinishGroupLesson(lesson);
  useEffect(()=>{
    if (!open || !dialog.current) return undefined;
    const element=dialog.current;
    element.showModal();
    return()=>element.close();
  },[open]);
  if (!teacher || !lesson?.lessonId) return null;
  if (!available && !open) return ['completed','cancelled'].includes(lesson.status)
    ? <span className="group-lesson-finish__done" role="status"><CheckCircle2 size={15}/>{lesson.status==='cancelled'?'Занятие отменено':'Занятие завершено'}</span> : null;
  const finish=async()=>{
    if (inFlight.current) return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const result=await finishGroupLesson({transport,groupId:lesson.groupId,lessonId:lesson.lessonId,beforeFinish});
      onFinished?.(result);setOpen(false);
    } catch(cause) {setError(cause.message || 'Не удалось завершить занятие. Проверьте связь и повторите.');}
    finally {inFlight.current=false;setBusy(false);}
  };
  return <>
    <button type="button" className="group-lesson-finish" onClick={()=>{setError('');setOpen(true);}} disabled={busy}>
      <Square size={14}/><span>Завершить занятие</span>
    </button>
    {open && createPortal(<dialog ref={dialog} className="group-lesson-finish__dialog" aria-labelledby="group-lesson-finish-title" aria-describedby="group-lesson-finish-description" onCancel={event=>{event.preventDefault();if(!busy)setOpen(false);}}>
      <div className="group-lesson-finish__icon"><Square size={22}/></div>
      <h2 id="group-lesson-finish-title">Завершить занятие для всех?</h2>
      <p className="group-lesson-finish__group">{lesson.groupName || 'Групповое занятие'}</p>
      <p id="group-lesson-finish-description">{lesson.callProvider==='telemost'?'Занятие на платформе и его запись завершатся. Сам звонок в Телемосте закройте в Телемосте.':'Звонок завершится во всех каналах группы. Запись этого занятия остановится.'} Материалы и решения сохранятся.</p>
      {error && <p className="group-lesson-finish__error" role="alert">{error}</p>}
      <div className="group-lesson-finish__actions">
        <button type="button" autoFocus disabled={busy} onClick={()=>setOpen(false)}>Продолжить урок</button>
        <button type="button" className="group-lesson-finish__confirm" disabled={busy} onClick={finish}>{busy?<><Loader2 size={16} className="animate-spin"/>Завершаем…</>:error?'Повторить завершение':'Да, завершить'}</button>
      </div>
    </dialog>,document.body)}
  </>;
}

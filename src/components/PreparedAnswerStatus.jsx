import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertCircle,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';

function PreparedReferenceAnswers({reference,columns}) {
  const [open,setOpen]=useState(null),trigger=useRef(null),closeButton=useRef(null);
  const portalTarget=useFullscreenPortalTarget(),titleId=useId();
  useEffect(()=>{
    if(!open)return;
    closeButton.current?.focus();
    const escape=event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(null);trigger.current?.focus();}else if(event.key==='Tab'){event.preventDefault();closeButton.current?.focus();}};
    document.addEventListener('keydown',escape,true);
    return()=>document.removeEventListener('keydown',escape,true);
  },[open]);
  const close=()=>{setOpen(null);trigger.current?.focus();};
  const answerText=reference.map(item=>item.value||'—').join(' · ');
  return <>
    <button ref={trigger} type="button" className="prepared-reference-preview" aria-label="Посмотреть правильные ответы для преподавателя" aria-haspopup="dialog" title={`Верный ответ: ${answerText}`} onClick={event=>setOpen({dark:Boolean(event.currentTarget.closest('.prepared-dark'))})}><span>Верный ответ: <strong>{answerText}</strong></span></button>
    {open&&createPortal(<div className={`prepared-dialog-backdrop${open.dark?' prepared-dark':''}`} onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)close();}} onKeyDown={event=>event.stopPropagation()}>
      <section className="prepared-dialog prepared-reference-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><small>Только преподавателю</small><h2 id={titleId}>Правильные ответы</h2></div><button ref={closeButton} type="button" aria-label="Закрыть правильные ответы" onClick={close}><X size={19}/></button></header>
        <div className="prepared-reference-values" style={{'--prepared-answer-columns':columns}}>{reference.map(item=><div key={item.index}><small>{item.label}</small><strong>{item.value||'—'}</strong></div>)}</div>
      </section>
    </div>,portalTarget)}
  </>;
}

// Feedback uses the existing heading row. Adding a result must not push the
// condition down: saved board ink is positioned in the condition's coordinates.
export default function PreparedAnswerStatus({label,wrong,reference=[],progress,columns=2}) {
  return <div className={`prepared-answer-heading${wrong?' is-wrong':''}`}>
    <p role="status">{wrong&&<AlertCircle size={14} aria-hidden="true"/>}<span>{wrong?'Пока неверно. Попробуйте ещё.':label}</span></p>
    {wrong&&reference.length>0?<PreparedReferenceAnswers reference={reference} columns={columns}/>:progress&&<span className="prepared-question-progress">{progress}</span>}
  </div>;
}

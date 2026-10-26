import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertCircle,ArrowRightLeft,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';

export default function PreparedFileHandoff({asset,disabled,action}){
  const portalTarget=useFullscreenPortalTarget(),[open,setOpen]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const trigger=useRef(null),closeButton=useRef(null),released=asset.writer&&!asset.writer.active;
  const close=()=>{if(busy)return;setOpen(null);trigger.current?.focus();};
  useEffect(()=>{
    if(!open)return;
    closeButton.current?.focus();
    const escape=event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();setOpen(null);trigger.current?.focus();}};
    document.addEventListener('keydown',escape,true);return()=>document.removeEventListener('keydown',escape,true);
  },[open,busy]);
  const run=async(input,message)=>{
    if(busy||disabled)return;setBusy(true);setError('');setNotice('');
    try{await action({...input,assetId:asset.assetId});setOpen(null);setNotice(message);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <>
    <button ref={trigger} type="button" disabled={disabled||busy||!asset.writer} onClick={event=>{setError('');setNotice('');if(released)void run({action:'resume-file'},'Запись возвращена. Нажмите Ctrl+S в открытой таблице.');else setOpen({dark:Boolean(event.currentTarget.closest('.prepared-dark'))});}}>{released?'Вернуть себе запись':'Передать файл'}</button>
    {asset.writer?.active&&!asset.writer.isSelf&&<small className="prepared-file-writer">Редактирует: {asset.writer.name}</small>}
    {released&&<small className="prepared-file-writer">Файл передан · сохранение из открытой таблицы приостановлено</small>}
    {!open&&(notice||error)&&<small className={`prepared-file-handoff-notice${error?' is-error':''}`} role="status">{error||notice}</small>}
    {open&&createPortal(<div className={`prepared-dialog-backdrop${open.dark?' prepared-dark':''}`} onPointerDown={e=>{e.stopPropagation();if(e.currentTarget===e.target)close();}} onKeyDown={e=>e.stopPropagation()}>
      <section className="prepared-dialog prepared-handoff-dialog" role="dialog" aria-modal="true" aria-label="Передача файла">
        <header><div><small>Совместная таблица</small><h2>Передать файл?</h2></div><button ref={closeButton} type="button" aria-label="Закрыть передачу файла" disabled={busy} onClick={close}><X size={19}/></button></header>
        <p><strong>{asset.name}</strong></p>
        <p>Сначала нажмите <strong>Ctrl+S</strong> в таблице и дождитесь сохранения на доске. Другой участник получит последнюю сохранённую версию.</p>
        {!asset.solution&&<p className="prepared-error"><AlertCircle size={17}/> Решение ещё не сохранено. Можно передать исходный файл или вернуться к сохранению своей работы.</p>}
        {asset.solution&&<p className="prepared-muted">Сохранено: {asset.solution.name} · {new Date(asset.solution.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</p>}
        <p className="prepared-muted">После передачи Ctrl+S из вашей открытой таблицы будет приостановлен. Если передали случайно, нажмите «Вернуть себе запись» на доске.</p>
        {error&&<p role="alert" className="prepared-error">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={close}>Вернуться и сохранить</button><button type="button" className="prepared-primary" disabled={disabled||busy} onClick={()=>void run({action:'release-file',allowWithoutSave:!asset.solution},'Файл передан. Можно вернуть запись до продолжения работы другим участником.')}><ArrowRightLeft size={15}/>{asset.solution?'Передать сохранённую версию':'Передать исходный файл'}</button></footer>
      </section>
    </div>,portalTarget)}
  </>;
}

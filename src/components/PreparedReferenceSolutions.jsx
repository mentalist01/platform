import {useEffect,useRef} from 'react';
import {FileCheck,Lock,LockKeyhole,LockKeyholeOpen,Upload,X,Download,Check,RefreshCw,Trash2} from 'lucide-react';
import FileDownloadLink from './FileDownloadLink.jsx';
import PreparedCardPopover from './PreparedCardPopover.jsx';
import './PreparedReferenceSolutions.css';

const size=bytes=>bytes>=1048576?`${(bytes/1048576).toFixed(1)} МБ`:bytes?`${Math.max(1,Math.round(bytes/1024))} КБ`:'';
export function PreparedReferenceSolutionEditor({task,taskNumber,files,busy,onChange,onUpload}){
  const upload=useRef(null),attached=task.referenceSolutions||[];
  return <section className="prepared-reference-editor" aria-label="Готовое решение задачи">
    <div className="prepared-reference-title"><FileCheck size={18}/><div><strong>Готовое решение</strong><small>Ученику откроется после верного ответа</small></div><span>Необязательно</span></div>
    <div className="prepared-reference-add"><button type="button" disabled={busy||attached.length>=8} onClick={()=>upload.current?.click()}><Upload size={14}/>Загрузить файл</button><select aria-label="Готовое решение из конспектов" disabled={busy||attached.length>=8} value="" onChange={event=>{const file=files.find(row=>row.id===event.target.value);if(file)onChange([...attached,{sourceFileId:file.id,name:file.name}]);}}><option value="">Из конспектов…</option>{files.filter(file=>Number(file.taskNumber)===Number(taskNumber)&&!attached.some(ref=>ref.sourceFileId===file.id)).map(file=><option key={file.id} value={file.id}>{file.name}{file.folderName?` · ${file.folderName}`:''}</option>)}</select><input ref={upload} type="file" accept=".xlsx,.xls,.xlsm,.ods,.fods,.csv,.tsv,.txt,.pdf,.py,.zip" multiple hidden onChange={event=>{const incoming=Array.from(event.target.files||[]);event.target.value='';if(incoming.length)void onUpload(incoming);}}/></div>
    {attached.length>0&&<ul>{attached.map((file,index)=><li key={file.assetId||file.sourceFileId}><FileCheck size={15}/><div><strong>{file.name}</strong><small>{size(file.sizeBytes)||'Сохраняется вместе с набором'}</small></div>{file.assetId&&<FileDownloadLink href={`/api/lesson-task-assets/${file.assetId}`} download={file.name} aria-label={`Скачать готовое решение ${file.name}`}><Download size={14}/></FileDownloadLink>}<button type="button" disabled={busy} aria-label={`Убрать готовое решение ${file.name}`} onClick={()=>onChange(attached.filter((_,i)=>i!==index))}><X size={14}/></button></li>)}</ul>}
    {!attached.length&&<p>Прикрепите свою таблицу с формулами или другой файл разбора. До решения ученик его не получит.</p>}
  </section>;
}

export default function PreparedReferenceSolutions({reference,canManage,solved,compact=false,onReplace,onRemove,disabled=false}){
  const badge=useRef(null),wasLocked=useRef(false),open=Boolean(reference?.available),present=Boolean(reference);
  useEffect(()=>{
    if(!open){wasLocked.current=present;return;}
    const unlock=wasLocked.current&&!canManage;wasLocked.current=false;
    if(!unlock||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const ring=badge.current?.animate([{boxShadow:'0 0 0 0 #38a67c00'},{boxShadow:'0 0 0 6px #38a67c25',offset:.45},{boxShadow:'0 0 0 10px #38a67c00'}],{duration:850,easing:'ease-out'});
    const lock=badge.current?.querySelector('.prepared-reference-lock-open')?.animate([{transform:'translateY(0) rotate(0deg)'},{transform:'translateY(-3px) rotate(-16deg)',offset:.35},{transform:'translateY(0) rotate(0deg)'}],{duration:650,easing:'ease-out'});
    return()=>{ring?.cancel();lock?.cancel();};
  },[open,canManage,present]);
  if(!reference)return null;
  if(compact)return <span ref={badge} className={`prepared-reference-badge${open?' is-open':' is-locked'}`}><PreparedCardPopover label={open?'Готовое решение':'Готовое решение закрыто · после верного ответа'} title={!open?'Готовое решение откроется после верного ответа':canManage&&!solved?'Вам доступно · ученику после верного ответа':'Скачать готовое решение'} icon={canManage?<FileCheck size={15}/>:<span className="prepared-reference-lock" aria-hidden="true"><LockKeyhole className="prepared-reference-lock-closed" size={15}/><LockKeyholeOpen className="prepared-reference-lock-open" size={15}/></span>} buttonText="Разбор" locked={!open} className={`prepared-material-reference${open?' is-available':' is-locked'}`}><div className="prepared-reference-popup-heading"><FileCheck size={18}/><div><strong>Готовое решение</strong><small>{canManage&&!solved?'Ученику — после верного ответа':'Можно скачать и сравнить со своим решением'}</small></div></div>{reference.files.map(file=><FileDownloadLink key={file.id} className="prepared-reference-download" href={file.url} download={file.name}><FileCheck size={17}/><span><strong>{file.name}</strong><small>{size(file.sizeBytes)}</small></span><Download size={14}/></FileDownloadLink>)}{onReplace&&<button type="button" disabled={disabled} onClick={onReplace}><RefreshCw size={14}/>Заменить файл</button>}{onRemove&&<button type="button" disabled={disabled} onClick={onRemove}><Trash2 size={14}/>Убрать разбор</button>}</PreparedCardPopover><span className="prepared-reference-announcement" role="status">{open?'Готовое решение доступно':'Готовое решение откроется после верного ответа'}</span></span>;
  return <section className={`prepared-reference-files${open?' is-open':''}`} aria-label="Готовое решение">
    <div className="prepared-reference-title">{open?<FileCheck size={19}/>:<Lock size={17}/>}<div><strong>Готовое решение</strong><small>{!open?'Откроется после правильного ответа':canManage&&!solved?'Вам доступно · ученику после верного ответа':'Можно скачать и сравнить со своим решением'}</small></div>{open&&solved&&<Check size={16} className="prepared-reference-unlocked"/>}</div>
    {open&&reference.files.map(file=><FileDownloadLink key={file.id} className="prepared-reference-download" href={file.url} download={file.name}><FileCheck size={17}/><span><strong>{file.name}</strong><small>{size(file.sizeBytes)}</small></span><span className="prepared-reference-download-label"><Download size={14}/>Скачать</span></FileDownloadLink>)}
  </section>;
}

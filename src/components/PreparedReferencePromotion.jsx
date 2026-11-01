import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,FileCheck,FileSpreadsheet,Download,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import FileDownloadLink from './FileDownloadLink.jsx';
import {preparedTaskTitle} from '../utils/preparedTaskTitle.js';

export const PREPARED_REFERENCE_PROMOTION='prepared-reference-promotion';
export default function PreparedReferencePromotion({run,refresh,disabled,dark}){
  const [cardId,setCardId]=useState(''),[assetId,setAssetId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const seen=useRef(null),timer=useRef(null),latest=useRef(null),target=useFullscreenPortalTarget(),dialog=useRef(null),returnFocus=useRef(null);
  const eligible=useMemo(()=>run?.canManage&&!disabled?run.cards.filter(card=>card.referencePromotion):[],[run,disabled]);
  const card=eligible.find(card=>card.id===cardId),offer=card?.referencePromotion;
  const file=offer?.files.find(file=>file.assetId===assetId)||offer?.files[0];
  const hasCard=Boolean(card);
  latest.current={runId:run?.id,eligible};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const keys=eligible.map(card=>`${run.id}:${card.id}`);
    // Existing solved tasks stay in their file menus; opening an old board
    // must not present a backlog of modal questions.
    if(seen.current?.runId!==run.id){clearTimeout(timer.current);seen.current={runId:run.id,ids:new Set(keys)};return;}
    const fresh=eligible.find(card=>!seen.current.ids.has(`${run.id}:${card.id}`));
    if(!cardId&&fresh){seen.current.ids.add(`${run.id}:${fresh.id}`);clearTimeout(timer.current);timer.current=setTimeout(()=>{if(latest.current.runId===run.id&&latest.current.eligible.some(card=>card.id===fresh.id)){setCardId(fresh.id);setAssetId('');setError('');}},1300);}
  },[run,eligible,cardId]);
  useEffect(()=>{
    const open=event=>{if(run?.id===event.detail?.runId&&eligible.some(card=>card.id===event.detail.cardId)){setCardId(event.detail.cardId);setAssetId('');setError('');}};
    window.addEventListener(PREPARED_REFERENCE_PROMOTION,open);return()=>window.removeEventListener(PREPARED_REFERENCE_PROMOTION,open);
  },[run,eligible]);
  useEffect(()=>{
    if(!cardId)return;
    if(!hasCard){setCardId('');return;}
    returnFocus.current=document.activeElement;dialog.current?.querySelector('button')?.focus({preventScroll:true});
    return()=>{if(returnFocus.current?.isConnected)returnFocus.current.focus({preventScroll:true});};
  },[cardId,hasCard,target]);
  const close=()=>{if(!busy){setCardId('');setError('');}};
  const confirm=async action=>{
    if(busy||!file)return;setBusy(true);setError('');
    try{await preparedRequest(`/api/lesson-task-runs/${run.id}/cards/${card.id}/reference-promotion`,{action,assetId:file.assetId,solutionId:file.id,revision:file.revision});setCardId('');await refresh();}
    catch(e){setError(e.message);if(e.status===409)await refresh();}finally{setBusy(false);}
  };
  if(!card||!file)return null;
  return createPortal(<div className={`prepared-dialog-backdrop${dark?' prepared-dark':''}`} onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)close();}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...dialog.current.querySelectorAll('button,a,select')].filter(node=>!node.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><section ref={dialog} className="prepared-dialog prepared-promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="prepared-promotion-heading"><div className="prepared-promotion-icon"><FileCheck size={23}/></div><header><div><small>Задача {preparedTaskTitle(card)} решена</small><h2 id="prepared-promotion-heading">Сохраним готовый разбор?</h2></div><button type="button" aria-label="Закрыть предложение" disabled={busy} onClick={close}><X size={19}/></button></header><p>Добавить сохранённую таблицу как готовое решение этой задачи в набор <strong>«{offer.setName}»</strong>?</p>{offer.files.length>1&&<label className="prepared-muted">Какую таблицу прикрепить<select value={file.assetId} disabled={busy} onChange={e=>setAssetId(e.target.value)}>{offer.files.map(row=><option key={row.assetId} value={row.assetId}>{row.name}</option>)}</select></label>}<div className="prepared-promotion-file"><FileSpreadsheet size={22}/><div><strong>{file.name}</strong><small>Сохранено {new Date(file.updatedAt).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</small></div><FileDownloadLink href={file.url} download={file.name}><Download size={14}/>Проверить файл</FileDownloadLink></div><p className="prepared-promotion-note"><Check size={16}/>Другие ученики откроют разбор после верного ответа. Сохранится отдельная копия файла.</p>{error&&<p role="alert" className="prepared-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>void confirm('dismiss')}>Не добавлять</button><button type="button" className="prepared-primary" disabled={busy} onClick={()=>void confirm('attach')}><FileCheck size={15}/>{busy?'Сохраняем…':'Прикрепить разбор'}</button></footer></section></div>,target);
}

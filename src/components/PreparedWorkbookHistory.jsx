import {useState} from 'react';
import {createPortal} from 'react-dom';
import {History,RotateCcw,Download,X} from 'lucide-react';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import FileDownloadLink from './FileDownloadLink.jsx';
import './PreparedWorkbookHistory.css';

export default function PreparedWorkbookHistory({asset,run,cardId,canRestart=false,disabled=false,refresh}){
  const [dialog,setDialog]=useState(null),[history,setHistory]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[closed,setClosed]=useState(false);
  const target=useFullscreenPortalTarget(),base=`/api/lesson-task-runs/${run.id}`,query=new URLSearchParams({cardId,assetId:asset.assetId});
  const load=async(before='')=>{
    setBusy(true);setError('');
    try{const result=await preparedRequest(base+'/workbook-history?'+query+(before?'&before='+encodeURIComponent(before):''));setHistory(current=>before?{...result,versions:[...current.versions,...result.versions]}:result);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const restart=async()=>{
    if(!closed||busy)return;setBusy(true);setError('');
    try{
      const result=await preparedRequest(base+'/workbook-restart',{cardId,assetId:asset.assetId,expectedRevision:asset.solution?.revision||0,expectedAttemptId:asset.attempt?.id||'',confirmClosed:true});
      setDialog(null);setMessage(`Попытка ${result.attempt.number} готова. Нажмите «Решать через помощник таблиц» — откроется исходный файл.`);await refresh();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const close=()=>{if(!busy){setDialog(null);setError('');}};
  return <div className="prepared-workbook-history">
    <div className="prepared-workbook-history-actions"><button type="button" disabled={busy} onClick={()=>{setDialog('history');setHistory(null);void load();}}><History size={13}/>История решений{asset.historyCount>0?` (${asset.historyCount})`:''}</button>{canRestart&&(asset.solution||asset.live?.enabled)&&<button type="button" disabled={disabled||busy} onClick={()=>{setDialog('restart');setClosed(false);setError('');}}><RotateCcw size={13}/>Решить заново</button>}</div>
    {asset.attempt?.number>1&&asset.attempt.hasSaved===false&&<small role="status">{message||`Попытка ${asset.attempt.number} · помощник откроет исходный файл.`}</small>}{!dialog&&error&&<small role="alert" className="prepared-error">{error}</small>}
    {dialog&&createPortal(<div className="prepared-dialog-backdrop" onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)close();}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')close();}}><section className="prepared-dialog prepared-workbook-history-dialog" role="dialog" aria-modal="true" aria-label={dialog==='history'?'История решений таблицы':'Решить таблицу заново'}><header><h2>{dialog==='history'?'История решений':'Новая попытка'}</h2><button type="button" aria-label="Закрыть" disabled={busy} onClick={close}><X size={19}/></button></header>
      <p className="prepared-workbook-history-filename">{asset.name}</p>
      {dialog==='restart'?<><p>Откроется исходный файл без внесённых вами изменений. Предыдущие сохранения останутся на доске и в истории.</p><p>Сначала сохраните нужные изменения через <strong>Ctrl+S</strong> и закройте эту таблицу у всех участников. Старые открытые копии не смогут сохранить изменения в новую попытку.</p><label className="prepared-workbook-restart-confirm"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)} disabled={busy}/>Таблицы сохранены и закрыты у всех участников</label></>:<>
        <FileDownloadLink className="prepared-workbook-history-source" href={history?.source?.url||base+'/workbook-history/source?'+query} download={asset.name}><Download size={15}/>Скачать исходный файл</FileDownloadLink>
        {busy&&!history&&<p role="status">Загружаем сохранения…</p>}
        {history&&!history.total&&<p>Сохранений пока нет. После Ctrl+S решение появится здесь.</p>}
        {history&&<ul>{history.versions.map(version=><li key={version.id}><div><strong>Попытка {version.attemptNumber} · {new Date(version.updatedAt).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</strong><small>{version.savedBy?.name||'Участник'}{version.current?' · последнее сохранение':''}</small><span>{version.name}</span></div><FileDownloadLink href={version.url} download={version.name}><Download size={14}/>Скачать</FileDownloadLink></li>)}</ul>}
        {history?.nextBefore&&<button type="button" disabled={busy} onClick={()=>void load(history.nextBefore)}>Показать ещё</button>}
      </>}
      {error&&<p role="alert" className="prepared-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>{dialog==='history'?'Закрыть':'Отмена'}</button>{dialog==='restart'?<button type="button" className="prepared-primary" disabled={busy||!closed||disabled} onClick={()=>void restart()}>{busy?'Создаём попытку…':'Начать заново'}</button>:<button type="button" disabled={busy} onClick={()=>void load()}>Обновить историю</button>}</footer>
    </section></div>,target)}
  </div>;
}

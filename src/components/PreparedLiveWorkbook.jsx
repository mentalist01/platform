import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Users,ExternalLink,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {getExternalApiOrigin} from '../utils/runtimeUrls.js';
import {getWorkbookHelperInstall} from '../utils/workbookHelperInstall.js';

export default function PreparedLiveWorkbook({asset,run,cardId,disabled,refresh}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const target=useFullscreenPortalTarget(),install=getWorkbookHelperInstall(),active=asset.live?.enabled;
  const installUrl=install.url&&/\.exe(?:[?#]|$)/i.test(install.url)?`${install.url}${install.url.includes('?')?'&':'?'}v=1.4.0`:install.url;
  const perform=async fn=>{if(busy||disabled)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const change=enabled=>perform(async()=>{await preparedRequest(`/api/lesson-task-runs/${run.id}/live`,{cardId,assetId:asset.assetId,enabled});await refresh();setOpen(false);});
  const launch=()=>perform(async()=>{
    if(install.platform!=='windows')throw Error('Совместное редактирование сейчас доступно в помощнике для Windows. Сохранённую версию можно скачать.');
    const result=await preparedRequest(`/api/lesson-task-runs/${run.id}/live/helper`,{cardId,assetId:asset.assetId});
    window.location.assign(`ivan-ege://workbook/open?${new URLSearchParams({origin:getExternalApiOrigin(),ticket:result.ticket})}`);
  });
  return <div className="prepared-live-workbook">
    {active?<><strong><Users size={15}/>Совместная таблица</strong><button type="button" className="prepared-primary" disabled={busy||disabled} onClick={launch}><ExternalLink size={14}/>Открыть общую таблицу</button><small>Изменения передаются автоматически · Ctrl+S сохраняет общую версию на доску</small>{run.canManage&&<button type="button" disabled={busy||disabled} onClick={()=>setOpen(true)}>Завершить совместный режим</button>}</>:run.canManage&&<button type="button" disabled={busy||disabled} onClick={()=>setOpen(true)}><Users size={14}/>Редактировать вместе</button>}
    {error&&<small role="alert" className="prepared-error">{error}</small>}
    {open&&createPortal(<div className="prepared-dialog-backdrop" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget&&!busy)setOpen(false);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!busy)setOpen(false);}}><section className="prepared-dialog prepared-handoff-dialog" role="dialog" aria-modal="true" aria-label="Совместная таблица"><header><div><small>Excel и LibreOffice · Windows</small><h2>{active?'Завершить совместную работу?':'Решайте в одной таблице'}</h2></div><button type="button" aria-label="Закрыть окно совместной таблицы" disabled={busy} onClick={()=>setOpen(false)}><X size={19}/></button></header>
      <p>{active?'Сначала сохраните общую версию через Ctrl+S и закройте таблицы у участников. После завершения снова будет доступна работа с передачей файла.':'Учитель и ученик открывают общую таблицу каждый у себя. Числа, формулы и заливка передаются автоматически; передавать файл больше не требуется.'}</p>
      {!active&&<><p>Нужен помощник для Windows версии 1.4 или новее. Перед включением сохраните и закройте обычную таблицу, если она уже открыта, затем нажмите «Передать файл».</p><p>Общая работа идёт в XLSX. Передаются значения, обычные формулы и сплошная заливка. Ширина столбцов, оформление текста, диаграммы и макросы совместно не синхронизируются. Общую правку можно отменить кнопкой в окне помощника.</p>{install.platform==='windows'&&installUrl&&<a href={installUrl}>Скачать помощник для Windows</a>}</>}
      {error&&<p role="alert" className="prepared-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button type="button" className="prepared-primary" disabled={busy||disabled} onClick={()=>change(!active)}>{active?'Завершить':'Включить совместную таблицу'}</button></footer></section></div>,target)}
  </div>;
}

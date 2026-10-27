import {useState} from 'react';
import {createPortal} from 'react-dom';
import {ExternalLink,X} from 'lucide-react';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {apiFetch} from '../services/api.js';
import {getExternalApiOrigin} from '../utils/runtimeUrls.js';
import {getWorkbookHelperInstall} from '../utils/workbookHelperInstall.js';

export default function PreparedLiveWorkbook({asset,run,cardId,disabled,refresh,onOpenSeparate,extraActions}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[previous,setPrevious]=useState(null);
  const [program,setProgram]=useState(()=>{try{const value=localStorage.getItem('workbook-program:v1');return ['excel','calc'].includes(value)?value:'auto';}catch{return 'auto';}});
  const target=useFullscreenPortalTarget(),install=getWorkbookHelperInstall(),active=asset.live?.enabled;
  const shared=active||install.platform==='windows'&&/\.(xlsx?|ods|fods|txt|csv|tsv)$/i.test(asset.name);
  const installUrl=install.url&&/\.exe(?:[?#]|$)/i.test(install.url)?install.url+(install.url.includes('?')?'&':'?')+'v=1.5.0':install.url;
  const perform=async fn=>{if(busy||disabled)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  const finish=()=>perform(async()=>{await preparedRequest('/api/lesson-task-runs/'+run.id+'/live',{cardId,assetId:asset.assetId,enabled:false});await refresh();setOpen(false);});
  const launch=(closePrevious=false)=>perform(async()=>{
    if(install.platform!=='windows')throw Error('Совместное редактирование доступно в помощнике для Windows. Сохранённую версию можно скачать.');
    const response=await apiFetch('/api/lesson-task-runs/'+run.id+'/live/helper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cardId,assetId:asset.assetId,start:true,...(closePrevious&&previous?{closePrevious:true,previousGeneration:previous.generation,previousRevision:previous.revision}:{})})});
    const result=await response.json();
    if(!response.ok){if(result.code==='PREVIOUS_TABLE_OPEN'){setPrevious(result.previous);return;}throw Error(result.error||'Не удалось открыть таблицу.');}
    setPrevious(null);
    window.location.assign('ivan-ege://workbook/open?'+new URLSearchParams({origin:getExternalApiOrigin(),ticket:result.ticket,...(run.canManage&&program!=='auto'?{engine:program}:{})}));
    await refresh();
  });
  return <div className="prepared-live-workbook">
    <button type="button" className="prepared-primary" disabled={busy||disabled} onClick={shared?()=>launch():onOpenSeparate}><ExternalLink size={14}/>{busy?'Открываем…':'Решать через помощник таблиц'}</button>
    {run.canManage&&shared&&install.platform==='windows'&&<select className="prepared-workbook-program" aria-label="Открывать таблицу в" title="Программа на вашем компьютере. Выберите ту же, что у ученика." value={program} disabled={busy||disabled} onChange={event=>{setProgram(event.target.value);try{localStorage.setItem('workbook-program:v1',event.target.value);}catch{}}}><option value="auto">По умолчанию</option><option value="excel">Microsoft Excel</option><option value="calc">LibreOffice Calc</option></select>}
    {active&&<small>Изменения передаются автоматически · Ctrl+S сохраняет общую версию</small>}
    {error&&<small role="alert" className="prepared-error">{error}</small>}
    <details className="prepared-workbook-options"><summary>Другие действия</summary><div>
      {shared&&<><p>Оба участника нажимают одну кнопку выше. Помощник Windows 1.5 показывает цветное выделение другого участника и открывает программу без дополнительного окна. Учитель может выбрать Excel или LibreOffice рядом с кнопкой.</p>{install.platform==='windows'&&installUrl&&<a href={installUrl}>Скачать помощник 1.5</a>}<p>Синхронизируются значения, обычные формулы и сплошная заливка. Выделения не меняют файл. Диаграммы, картинки и прочее оформление целиком не синхронизируются, даже если участники используют одинаковую программу.</p></>}
      {!active&&<>{shared&&<button type="button" disabled={busy||disabled} onClick={onOpenSeparate}>Открыть отдельно</button>}{extraActions}</>}
      {active&&run.canManage&&<button type="button" disabled={busy||disabled} onClick={()=>setOpen(true)}>Открывать файл по очереди</button>}
    </div></details>
    {previous&&createPortal(<div className="prepared-dialog-backdrop" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget&&!busy)setPrevious(null);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!busy)setPrevious(null);}}><section className="prepared-dialog prepared-handoff-dialog" role="dialog" aria-modal="true" aria-label="Продолжить в общей таблице"><header><h2>Продолжим вместе</h2><button type="button" aria-label="Закрыть" disabled={busy} onClick={()=>setPrevious(null)}><X size={19}/></button></header><p>Эту таблицу открывали раньше отдельно{previous.name?' ('+previous.name+')':''}. Сохраните её через <strong>Ctrl+S</strong>, дождитесь появления решения на доске и закройте файл. Затем откройте сохранённую версию вместе.</p><p>Этот переход нужен один раз. Дальше оба участника нажимают только «Решать через помощник таблиц».</p>{!previous.savedAt&&<p className="prepared-error">На доске ещё нет сохранённого решения. Если правки нужны, сначала сохраните их; иначе откроется исходный файл.</p>}{!previous.canClose&&<p>Переход подтвердит преподаватель или участник, открывший файл.</p>}{error&&<p role="alert" className="prepared-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>setPrevious(null)}>Отмена</button><button type="button" className="prepared-primary" disabled={busy||disabled||!previous.canClose} onClick={()=>launch(true)}>Сохранил и закрыл — открыть вместе</button></footer></section></div>,target)}
    {open&&createPortal(<div className="prepared-dialog-backdrop" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget&&!busy)setOpen(false);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'&&!busy)setOpen(false);}}><section className="prepared-dialog prepared-handoff-dialog" role="dialog" aria-modal="true" aria-label="Завершить совместную таблицу"><header><h2>Перейти к работе по очереди?</h2><button type="button" aria-label="Закрыть" disabled={busy} onClick={()=>setOpen(false)}><X size={19}/></button></header>
      <p>Сохраните общую версию через Ctrl+S и закройте таблицы у участников. После перехода можно открывать файл отдельно и передавать право сохранения.</p>
      {error&&<p role="alert" className="prepared-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button type="button" className="prepared-primary" disabled={busy||disabled} onClick={finish}>Перейти</button></footer></section></div>,target)}
  </div>;
}

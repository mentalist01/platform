import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Download,FileCheck,FileSpreadsheet,RefreshCw,Upload,X} from 'lucide-react';
import {preparedRequest} from '../services/preparedLessonTasks.js';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import FileDownloadLink from './FileDownloadLink.jsx';
import './PreparedReferenceReplacement.css';

export const PREPARED_REFERENCE_REPLACEMENT='prepared-reference-replacement';

export default function PreparedReferenceReplacement({run,refresh,disabled,dark}){
  const [request,setRequest]=useState(null);
  const [options,setOptions]=useState(null);
  const [referenceId,setReferenceId]=useState('');
  const [assetId,setAssetId]=useState('');
  const [upload,setUpload]=useState(null);
  const [source,setSource]=useState('saved');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const target=useFullscreenPortalTarget();
  const dialog=useRef(null),fileInput=useRef(null),controller=useRef(null);
  const endpoint=request?`/api/lesson-task-runs/${request.runId}/cards/${request.cardId}/reference-replacement`:'';
  const file=options?.files.find(row=>row.assetId===assetId);

  const load=useCallback(async()=>{
    if(!endpoint)return;
    controller.current?.abort();
    const abort=new AbortController();
    controller.current=abort;
    setLoading(true);
    setError('');
    try{
      const next=await preparedRequest(endpoint,undefined,'GET',abort.signal);
      if(abort.signal.aborted)return;
      setOptions(next);
      setReferenceId(current=>next.references.some(row=>row.id===current)?current:next.references[0]?.id||'');
      setAssetId(current=>next.files.some(row=>row.assetId===current)?current:next.files[0]?.assetId||'');
    }catch(e){
      if(e.name!=='AbortError')setError(e.message);
    }finally{
      if(!abort.signal.aborted)setLoading(false);
    }
  },[endpoint]);

  useEffect(()=>{
    const open=event=>{
      if(disabled||!run?.canManage||event.detail?.runId!==run.id)return;
      const card=run.cards.find(row=>row.id===event.detail.cardId);
      if(!card?.referenceReplacementAvailable)return;
      setOptions(null);setUpload(null);setSource('saved');setError('');
      setRequest({runId:run.id,cardId:card.id});
    };
    window.addEventListener(PREPARED_REFERENCE_REPLACEMENT,open);
    return()=>window.removeEventListener(PREPARED_REFERENCE_REPLACEMENT,open);
  },[run,disabled]);

  useEffect(()=>{
    if(disabled||request?.runId!==run?.id){setRequest(null);return;}
    void load();
    return()=>controller.current?.abort();
  },[disabled,request,run?.id,load]);

  useEffect(()=>{
    if(!request)return;
    const previous=document.activeElement;
    dialog.current?.querySelector('button')?.focus({preventScroll:true});
    return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[request,target]);

  const close=()=>{if(!busy)setRequest(null);};
  const replace=async()=>{
    if(busy||loading||!options||!referenceId||!(source==='saved'?file:upload))return;
    setBusy(true);setError('');
    try{
      let chosen;
      if(source==='upload'){
        const form=new FormData();form.append('file',upload);
        const asset=await preparedRequest('/api/lesson-task-reference-files',form);
        chosen={referenceAssetId:asset.id};
      }else{
        chosen={assetId:file.assetId,solutionId:file.id,revision:file.revision};
      }
      await preparedRequest(endpoint,{
        expectedSetVersion:options.expectedSetVersion,
        expectedReferenceIds:options.expectedReferenceIds,
        referenceId,
        ...chosen,
      });
      setRequest(null);
      await refresh();
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  };
  if(!request)return null;
  const selected=source==='saved'?file:upload;
  return createPortal(
    <div className={`prepared-dialog-backdrop${dark?' prepared-dark':''}`}
      onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)close();}}
      onKeyDown={event=>{
        event.stopPropagation();
        if(event.key==='Escape')close();
        if(event.key!=='Tab')return;
        const nodes=[...dialog.current.querySelectorAll('button,a,select')].filter(node=>!node.disabled&&!node.hidden);
        const first=nodes[0],last=nodes.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }}>
      <section ref={dialog} className="prepared-dialog prepared-reference-replacement" role="dialog" aria-modal="true" aria-labelledby="prepared-replacement-heading">
        <header>
          <div><small>Готовое решение · {options?.setName||'Загружаем набор'}</small><h2 id="prepared-replacement-heading">Заменить файл разбора</h2></div>
          <button type="button" aria-label="Закрыть замену разбора" disabled={busy} onClick={close}><X size={19}/></button>
        </header>
        {loading&&<p role="status">Загружаем последние сохранения…</p>}
        {options&&<>
          <label className="prepared-replacement-label">Какой разбор заменить
            {options.references.length>1?<select value={referenceId} disabled={busy||loading} onChange={event=>setReferenceId(event.target.value)}>
              {options.references.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
            </select>:<span className="prepared-replacement-current"><FileCheck size={18}/>{options.references[0]?.name}</span>}
          </label>
          <div className="prepared-replacement-divider"><ArrowRight size={17}/><span>Выберите новый файл</span></div>
          <div className="prepared-replacement-sources" aria-label="Источник нового разбора">
            <button type="button" aria-pressed={source==='saved'} disabled={busy||loading} onClick={()=>setSource('saved')}><FileSpreadsheet size={15}/>Сохранение на доске</button>
            <button type="button" aria-pressed={source==='upload'} disabled={busy||loading} onClick={()=>{setSource('upload');if(!upload)fileInput.current?.click();}}><Upload size={15}/>С компьютера</button>
          </div>
          {source==='saved'?<>
            {options.files.length>1&&<label className="prepared-replacement-label">Сохранённая таблица<select value={assetId} disabled={busy||loading} onChange={event=>setAssetId(event.target.value)}>
              {options.files.map(row=><option key={row.assetId} value={row.assetId}>{row.name}</option>)}
            </select></label>}
            {!file&&<p>Сохранений пока нет. Сохраните таблицу через Ctrl+S и обновите список или выберите файл с компьютера.</p>}
            <button type="button" className="prepared-replacement-refresh" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={14}/>Обновить сохранения</button>
          </>:<button type="button" className="prepared-replacement-upload" disabled={busy||loading} onClick={()=>fileInput.current?.click()}><Upload size={16}/>{upload?'Выбрать другой файл':'Выбрать файл'}</button>}
          {selected&&<div className="prepared-replacement-file">
            <FileSpreadsheet size={24}/><div><strong>{selected.name}</strong>
              {source==='saved'?<small>{file.savedBy?.name||'Участник'} · {new Date(file.updatedAt).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small>:<small>Файл с компьютера</small>}
            </div>
            {source==='saved'&&<FileDownloadLink href={file.url} download={file.name}><Download size={15}/>Проверить</FileDownloadLink>}
          </div>}
          <p className="prepared-replacement-note">Новый разбор сохранится в наборе и обновится на досках с этой задачей. Ученики смогут открыть его после верного ответа.</p>
        </>}
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.xlsm,.ods,.fods,.csv,.tsv,.txt,.pdf,.py,.zip" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file){setUpload(file);setSource('upload');}}}/>
        {error&&<p className="prepared-error" role="alert">{error}{!options&&<button type="button" disabled={busy||loading} onClick={()=>void load()}>Повторить</button>}</p>}
        <footer><button type="button" disabled={busy} onClick={close}>Отмена</button>
          <button type="button" className="prepared-primary" disabled={busy||loading||!options||!selected} onClick={()=>void replace()}><FileCheck size={15}/>{busy?'Заменяем…':'Заменить разбор'}</button>
        </footer>
      </section>
    </div>,target);
}
